"use server";

// Supabase only: production has no Prisma database connection.
import { supabase } from '@/lib/supabase';
import { aiService } from '@/services/aiService';
import { normalizeCharacterName } from '@/lib/characterNames';
import { parseStoryboardJson } from '@/lib/storyboardGeneration';
import {
  buildShotDirectionPrompt,
  buildShotPlan,
  parseShotPlan,
  sceneBeats,
  serializeShotPlan,
  validateShotDirection,
  type ShotSceneContext,
} from '@/lib/sceneShots';
import {
  CHARACTER_FIX_ROUNDS,
  agreedBeatCast,
  buildCastCheckPrompt,
  buildStoryboardRevisionPrompt,
  castCheckChunks,
  checkedBeatNumbers,
  describeIssues,
  describeWarnings,
  findCharacterIssues,
  fixableIssueCount,
  mergeWhereabouts,
  parseBeatCast,
  parseRevisedStoryboardPrompt,
  parseWhereabouts,
  storyboardNeedsFix,
  videoNeedsFix,
  withCharactersLine,
  withExactNames,
  withSpeakers,
  type BeatCast,
  type CastMember,
  type SceneCharacterIssues,
  type Whereabouts,
} from '@/lib/characterContinuity';
import { buildCastCompletionPrompt, parseCastDecisions, type LibraryCharacter } from '@/lib/castCompletion';
import { generateReference } from '@/lib/referenceGeneration';

export interface SceneCharacterReport {
  sceneId: string;
  sceneNumber: number;
  /** False when the scene could not be checked at all. */
  ok: boolean;
  error?: string;
  /** Who the agent found on screen in each beat. */
  beats: BeatCast[];
  /** Problems found on the first pass. */
  found: string[];
  /** What the check changed. */
  fixed: string[];
  /** Problems still there after the last round. */
  remaining: string[];
  /** Things a person has to decide or redo: extra links, characters outside the cast, outdated images or clips. */
  warnings: string[];
  /** The storyboard image was made before this check changed the scene's characters or prompt. */
  imageOutdated?: boolean;
}

/** The rows of a Supabase result, or its error as a thrown message that says what failed. */
function rows<T>(result: { data: unknown; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what} could not be loaded: ${result.error.message}`);
  return result.data as T;
}

export interface CastCompletion {
  /** Library characters added to the episode's cast. */
  attached: string[];
  /** New characters created, with a reference sheet when it could be generated. */
  created: string[];
  /** Names left alone: crowds, extras, scenery animals, objects. */
  skipped: string[];
  /** Characters created whose sheet failed; scenes with them cannot make images until it exists. */
  sheetErrors: string[];
}

/**
 * Brings characters the check saw on screen, but outside the episode's cast, into the cast: a library
 * character is attached, and a genuinely new one is created with a reference sheet, since a scene
 * cannot make images while one of its characters has none. Never creates a second copy of a library
 * character.
 */
export async function completeEpisodeCastAction(storyId: string, names: string[]): Promise<CastCompletion> {
  const result: CastCompletion = { attached: [], created: [], skipped: [], sheetErrors: [] };
  const unique = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (!unique.length) return result;

  const [libraryResult, storyResult] = await Promise.all([
    supabase.from('Character').select('id, name, description'),
    supabase.from('Story').select('content').eq('id', storyId).maybeSingle(),
  ]);
  const library = (rows<{ id: string; name: string; description: string | null }[]>(libraryResult, 'The character library') || [])
    .map((character) => ({ ...character, description: character.description || '' }));
  const story = rows<{ content: string | null } | null>(storyResult, 'The episode story');
  const response = await aiService.call(
    buildCastCompletionPrompt({ names: unique, library, story: story?.content || '' }),
    4000,
    { temperature: 0 },
  );
  const decisions = parseCastDecisions(parseStoryboardJson(response.text || ''), unique, library as LibraryCharacter[]);

  for (const decision of decisions) {
    if (decision.action === 'skip') {
      result.skipped.push(decision.name);
      continue;
    }
    let character: { id: string; name: string } = decision.action === 'attach' ? decision.character : { id: '', name: decision.name };
    if (decision.action === 'create') {
      const created = await supabase.from('Character').insert({ name: decision.name, description: decision.description }).select('id, name').single();
      if (created.error || !created.data) throw new Error(`${decision.name} could not be created: ${created.error?.message || 'no row returned'}`);
      character = created.data;
      library.push({ ...character, description: decision.description });
      try {
        await generateReference('character', character.id);
      } catch (error) {
        result.sheetErrors.push(error instanceof Error ? error.message : `${character.name}: the sheet could not be generated.`);
      }
      result.created.push(character.name);
    } else if (!result.attached.includes(character.name)) {
      result.attached.push(character.name);
    }
    const { error: linkError } = await supabase.from('StoryCharacter')
      .upsert([{ story_id: storyId, character_id: character.id }], { onConflict: 'story_id,character_id', ignoreDuplicates: true });
    if (linkError) throw new Error(`${character.name} could not be added to the episode: ${linkError.message}`);
  }
  return result;
}

/** The episode's scenes in order, for the client to check one at a time. */
export async function listCharacterCheckScenesAction(storyId: string): Promise<{ id: string; sceneNumber: number }[]> {
  const scenes = rows<{ id: string; scene_number: number }[]>(
    await supabase.from('Scene').select('id, scene_number').eq('story_id', storyId).order('scene_number', { ascending: true }),
    'The episode scenes',
  ) || [];
  return scenes.map((scene) => ({ id: scene.id, sceneNumber: scene.scene_number }));
}

interface CastRead {
  beats: BeatCast[];
  /** Who is where after the last beat, for the next batch. */
  whereabouts: Whereabouts[];
}

/** One read of who is on screen in each beat; asked once more, naming the mistake, if it answers with names outside the cast. */
async function readBeatCast(cast: CastMember[], scriptBeats: string, beatNumbers: number[], earlierBeats = '', whereabouts: Whereabouts[] = []): Promise<CastRead> {
  const prompt = buildCastCheckPrompt({ cast, scriptBeats, beatNumbers, earlierBeats, whereabouts });
  let correction = '';
  let failure: unknown;
  let best: CastRead | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await aiService.call(prompt + correction, 8000, { temperature: 0 });
      const answer = parseStoryboardJson(response.text || '');
      const { beats, unknown } = parseBeatCast(answer, cast, beatNumbers);
      const read = { beats, whereabouts: parseWhereabouts(answer, cast) };
      if (!unknown.length) return read;
      best = read;
      correction = `\n\nCORRECTION: a previous answer listed ${unknown.map((name) => `"${name}"`).join(', ')} in "on_screen", which matches no cast name. Use the exact cast name of the character meant, or put a character who is not in the cast in "not_in_cast".`;
    } catch (error) {
      failure = error;
    }
  }
  if (best) return best;
  throw failure instanceof Error ? failure : new Error('The character check did not answer.');
}

/**
 * Who is on screen in each beat by the agreement of two independent reads (one read alone if the other
 * fails), and who is where afterwards: both reads' records, then anyone only the earlier record knew.
 */
async function detectBeatCast(cast: CastMember[], scriptBeats: string, beatNumbers: number[], earlierBeats = '', whereabouts: Whereabouts[] = []): Promise<CastRead> {
  const [first, second] = await Promise.allSettled([
    readBeatCast(cast, scriptBeats, beatNumbers, earlierBeats, whereabouts),
    readBeatCast(cast, scriptBeats, beatNumbers, earlierBeats, whereabouts),
  ]);
  if (first.status === 'fulfilled' && second.status === 'fulfilled') {
    return {
      beats: agreedBeatCast(first.value.beats, second.value.beats),
      whereabouts: mergeWhereabouts(first.value.whereabouts, second.value.whereabouts, whereabouts),
    };
  }
  const read = first.status === 'fulfilled' ? first.value : second.status === 'fulfilled' ? second.value : null;
  if (!read) throw (first as PromiseRejectedResult).reason;
  return { beats: read.beats, whereabouts: mergeWhereabouts(read.whereabouts, whereabouts) };
}

async function loadStoryCast(storyId: string | null): Promise<{ id: string; name: string; description: string | null }[]> {
  if (!storyId) return [];
  const links = rows<{ Character: { id: string; name: string; description: string | null } | null }[]>(
    await supabase.from('StoryCharacter').select('Character(id, name, description)').eq('story_id', storyId),
    'The episode cast',
  ) || [];
  return links.flatMap((link) => (link.Character ? [link.Character] : []));
}

interface SceneRecord {
  id: string;
  story_id: string | null;
  episode_location_id: string | null;
  scene_number: number;
  description: string | null;
  script_beats: string | null;
  beat_numbers: number[] | null;
  storyboard_prompt: string | null;
  storyboard_image_url: string | null;
  video_prompt: string | null;
}

async function updateScene(sceneId: string, data: Partial<Pick<SceneRecord, 'storyboard_prompt' | 'video_prompt'>>) {
  const { error } = await supabase.from('Scene').update({ ...data, updated_at: new Date().toISOString() }).eq('id', sceneId);
  if (error) throw new Error(`The scene could not be saved: ${error.message}`);
}

/** One batch of the episode read: whole scenes in order, with the scenes just before them as context. */
export interface CastReadBatch {
  sceneIds: string[];
  earlierSceneIds: string[];
}

type CastSceneRecord = Pick<SceneRecord, 'id' | 'scene_number' | 'script_beats' | 'beat_numbers' | 'description'>;

function castScene(scene: CastSceneRecord) {
  return {
    id: scene.id,
    scriptBeats: scene.script_beats || '',
    beatNumbers: checkedBeatNumbers({ scriptBeats: scene.script_beats || '', beatNumbers: scene.beat_numbers || undefined, description: scene.description || '' }),
  };
}

const beatText = (scenes: { scriptBeats: string }[]) => scenes.map((scene) => scene.scriptBeats.trim()).join('\n\n---\n\n');

/**
 * Splits the episode into batches of a handful of beats for `readEpisodeCastBatchAction`. The client
 * reads them in order, so who is where carries from each batch to the next.
 */
export async function planEpisodeCastReadAction(storyId: string): Promise<{ batches: CastReadBatch[]; errors: Record<string, string> }> {
  const errors: Record<string, string> = {};
  const scenes = (rows<CastSceneRecord[]>(
    await supabase.from('Scene').select('id, scene_number, script_beats, beat_numbers, description').eq('story_id', storyId).order('scene_number', { ascending: true }),
    'The episode scenes',
  ) || []).map(castScene);
  const readable = scenes.filter((scene) => scene.scriptBeats.trim());
  for (const scene of scenes) if (!scene.scriptBeats.trim()) errors[scene.id] = 'The scene has no beat script to check against.';
  return {
    batches: castCheckChunks(readable).map((chunk) => ({
      sceneIds: chunk.scenes.map((scene) => scene.id),
      earlierSceneIds: chunk.earlier.map((scene) => scene.id),
    })),
    errors,
  };
}

export type CastReadBatchResult = {
  /** Who each scene's beats show, by scene id. */
  byScene: Record<string, BeatCast[]>;
  /** Who is where after the batch; the record passed in when the batch could not be read. */
  whereabouts: Whereabouts[];
  error?: string;
};

/**
 * Reads one batch of the episode: who each beat shows, starting from who was where after the batches
 * before it, so a character established long ago and not mentioned since is still known to be there.
 */
export async function readEpisodeCastBatchAction(storyId: string, batch: CastReadBatch, whereabouts: Whereabouts[]): Promise<CastReadBatchResult> {
  try {
    const cast = await loadStoryCast(storyId);
    if (!cast.length) throw new Error('The episode has no characters to check for.');
    const ids = [...batch.earlierSceneIds, ...batch.sceneIds];
    const records = (rows<CastSceneRecord[]>(
      await supabase.from('Scene').select('id, scene_number, script_beats, beat_numbers, description').in('id', ids),
      'The episode scenes',
    ) || []).map(castScene);
    const byId = new Map(records.map((scene) => [scene.id, scene]));
    const pick = (list: string[]) => list.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
    const scenes = pick(batch.sceneIds).filter((scene) => scene.scriptBeats.trim());
    if (!scenes.length) return { byScene: {}, whereabouts };

    const read = await detectBeatCast(
      cast,
      beatText(scenes),
      scenes.flatMap((scene) => scene.beatNumbers),
      beatText(pick(batch.earlierSceneIds)),
      whereabouts,
    );
    const byScene: Record<string, BeatCast[]> = {};
    let next = 0;
    for (const scene of scenes) {
      byScene[scene.id] = read.beats.slice(next, next + scene.beatNumbers.length);
      next += scene.beatNumbers.length;
    }
    return { byScene, whereabouts: read.whereabouts };
  } catch (error) {
    return { byScene: {}, whereabouts, error: error instanceof Error ? error.message : 'The character check did not answer.' };
  }
}

async function loadObjectNames(sceneId: string): Promise<string[]> {
  const { data, error } = await supabase.from('SceneProp').select('Prop(name)').eq('scene_id', sceneId);
  if (error) return [];
  return ((data || []) as unknown as { Prop: { name: string } | null }[]).flatMap((link) => (link.Prop ? [link.Prop.name] : []));
}

/**
 * Checks one scene against its script and, when `fix` is set, repairs what it can in rounds until
 * nothing fixable is left: attaches missing characters, names them in the storyboard prompt and
 * re-plans the video shots so each shot names who its beat shows. Images and clips are never
 * regenerated here; the report says which ones were made before the fix.
 */
export async function checkSceneCharactersAction(
  sceneId: string,
  options: { fix: boolean; /** Who each beat shows, from `detectEpisodeCastAction`. Read from this scene alone when absent. */ beats?: BeatCast[] },
): Promise<SceneCharacterReport> {
  const report: SceneCharacterReport = {
    sceneId, sceneNumber: 0, ok: true, beats: [], found: [], fixed: [], remaining: [], warnings: [],
  };

  try {
    const scene = rows<SceneRecord | null>(
      await supabase.from('Scene')
        .select('id, story_id, episode_location_id, scene_number, description, script_beats, beat_numbers, storyboard_prompt, storyboard_image_url, video_prompt')
        .eq('id', sceneId).maybeSingle(),
      'The scene',
    );
    if (!scene) throw new Error('The scene no longer exists.');
    report.sceneNumber = scene.scene_number;
    const [linkResult, locationResult] = await Promise.all([
      supabase.from('SceneCharacter').select('Character(id, name)').eq('scene_id', sceneId),
      scene.episode_location_id
        ? supabase.from('EpisodeLocation').select('Location(name)').eq('id', scene.episode_location_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const sceneLinks = rows<{ Character: { id: string; name: string } | null }[]>(linkResult, "The scene's characters") || [];
    const locationName = (rows<{ Location: { name: string } | null } | null>(locationResult, "The scene's location"))?.Location?.name || '';
    const beatNumbers = scene.beat_numbers || undefined;
    const description = scene.description || '';

    const scriptBeats = scene.script_beats || '';
    if (!scriptBeats.trim()) throw new Error('The scene has no beat script to check against.');
    const storyCast = await loadStoryCast(scene.story_id);
    if (!storyCast.length) throw new Error('The episode has no characters to check for.');

    const context = { scriptBeats, beatNumbers, description };
    const read = options.beats?.length ? options.beats : (await detectBeatCast(storyCast, scriptBeats, checkedBeatNumbers(context))).beats;
    // Anyone who speaks on camera is in the shot, whatever the reads decided.
    const beats = withSpeakers(read, context, storyCast);
    report.beats = beats;

    let linked = sceneLinks.flatMap((link) => (link.Character ? [link.Character.name] : []));
    let storyboardPrompt = scene.storyboard_prompt || '';
    let videoPrompt = scene.video_prompt;
    const check = () => findCharacterIssues({ beats, linked, storyboardPrompt, videoPrompt, cast: storyCast });

    let issues: SceneCharacterIssues = check();
    report.found = describeIssues(issues);
    let linksAdded = false;
    let storyboardChanged = false;
    let videoChanged = false;

    for (let round = 0; options.fix && round < CHARACTER_FIX_ROUNDS && fixableIssueCount(issues) > 0; round++) {
      // 1. Attach every character the script shows, so their sheets go with the image and clip requests.
      if (issues.missingLinks.length) {
        const missing = new Set(issues.missingLinks.map(normalizeCharacterName));
        const characters = storyCast.filter((character) => missing.has(normalizeCharacterName(character.name)));
        const { error: linkError } = await supabase.from('SceneCharacter').upsert(
          characters.map((character) => ({ scene_id: scene.id, character_id: character.id })),
          { onConflict: 'scene_id,character_id', ignoreDuplicates: true },
        );
        if (linkError) throw new Error(`Characters could not be attached to the scene: ${linkError.message}`);
        linked = [...linked, ...characters.map((character) => character.name)];
        linksAdded = characters.length > 0;
        report.fixed.push(`Attached ${characters.map((character) => character.name).join(', ')}.`);
        issues = check();
      }

      // 2. The Characters line is rewritten directly; a panel that leaves someone out is revised by the agent.
      if (storyboardNeedsFix(issues)) {
        const before = fixableIssueCount(issues);
        // Short names are swapped for exact names in code; only what is still missing goes to the agent.
        let candidate = withExactNames(withCharactersLine(storyboardPrompt, linked), beats, storyCast);
        let candidateIssues = findCharacterIssues({ beats, linked, storyboardPrompt: candidate, videoPrompt, cast: storyCast });
        if (candidateIssues.storyboardPanels.length) {
          try {
            const response = await aiService.call(buildStoryboardRevisionPrompt({
              storyboardPrompt: candidate,
              scriptBeats,
              panels: candidateIssues.storyboardPanels,
            }), 4000, { temperature: 0 });
            const revised = withExactNames(withCharactersLine(parseRevisedStoryboardPrompt(parseStoryboardJson(response.text || ''), candidate), linked), beats, storyCast);
            const revisedIssues = findCharacterIssues({ beats, linked, storyboardPrompt: revised, videoPrompt, cast: storyCast });
            if (fixableIssueCount(revisedIssues) < fixableIssueCount(candidateIssues)) {
              candidate = revised;
              candidateIssues = revisedIssues;
            }
          } catch {
            // The Characters line fix still stands; the next round asks again.
          }
        }
        if (fixableIssueCount(candidateIssues) < before) {
          await updateScene(scene.id, { storyboard_prompt: candidate });
          storyboardPrompt = candidate;
          storyboardChanged = true;
          issues = candidateIssues;
        }
      }

      // 3. A shot plan that leaves someone out is planned again with each beat's cast. Clips stay with their shots.
      const plan = parseShotPlan(videoPrompt);
      if (plan && videoNeedsFix(issues)) {
        const shotContext: ShotSceneContext = {
          locationName,
          characterNames: linked,
          objectNames: await loadObjectNames(scene.id),
          scriptBeats,
          beatNumbers,
          description,
          storyboardPrompt,
          beatCast: Object.fromEntries(beats.map((beat) => [beat.beat, beat.onScreen])),
        };
        try {
          const response = await aiService.call(buildShotDirectionPrompt(shotContext), 4000, { temperature: 0 });
          const direction = validateShotDirection(parseStoryboardJson(response.text || ''), sceneBeats(shotContext));
          const replanned = serializeShotPlan(buildShotPlan(shotContext, direction, plan));
          const replannedIssues = findCharacterIssues({ beats, linked, storyboardPrompt, videoPrompt: replanned, cast: storyCast });
          if (fixableIssueCount(replannedIssues) < fixableIssueCount(issues)) {
            await updateScene(scene.id, { video_prompt: replanned });
            videoPrompt = replanned;
            videoChanged = true;
            issues = replannedIssues;
          }
        } catch {
          // Left for the next round.
        }
      }
    }

    if (storyboardChanged) report.fixed.push('Named and placed every on-screen character in the storyboard prompt.');
    if (videoChanged) report.fixed.push('Planned the video shots again so each names and places the characters its beat shows.');
    report.remaining = describeIssues(issues);
    report.warnings = describeWarnings(issues);
    if ((linksAdded || storyboardChanged) && scene.storyboard_image_url) {
      report.imageOutdated = true;
      report.warnings.push('The storyboard image was made before this fix. Generate a new take in the Storyboard step.');
    }
    const clips = parseShotPlan(videoPrompt)?.shots.filter((shot) => shot.videoUrl).length || 0;
    if (videoChanged && clips > 0) {
      report.warnings.push(`${clips} clip${clips === 1 ? ' was' : 's were'} made before the shot prompts were fixed. Generate new takes in the Video step.`);
    }
  } catch (error) {
    report.ok = false;
    report.error = error instanceof Error ? error.message : 'The scene could not be checked.';
  }
  return report;
}
