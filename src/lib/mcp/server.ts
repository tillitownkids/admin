import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { getEpisodesAction } from '@/actions/episodesAction';
import { supabase } from '@/lib/supabase';
import { findExistingByName, normalizeCharacterName } from '@/lib/characterNames';
import { episodeStatusLine, nextEpisodeStep } from '@/lib/episodeSteps';
import { parseScriptBeats, parseShotPlan, planShotTiming, shotTakes } from '@/lib/sceneShots';
import { SERVER_INSTRUCTIONS, productionGuide } from '@/lib/mcp/guide';
import { listSequenceNotes } from '@/lib/sequenceNotes';
import { registerSequenceTools } from '@/lib/mcp/sequenceTools';
import { READ, REPLACE, WRITE, adminUrl, episodeId, names, run } from '@/lib/mcp/toolKit';
import {
  ToolError,
  linkToEpisode,
  loadEpisodeCast,
  loadLibrary,
  loadScenes,
  loadScript,
  loadSettings,
  loadStory,
  markdownOf,
  one,
  resolveNames,
  sceneCharacterNames,
  sceneObjectNames,
  type LibraryItem,
  type PropItem,
} from '@/lib/mcp/data';

// The TilliTown Admin MCP server: lets Claude (claude.ai, Claude Desktop, Claude Code) read episodes
// and write their stories, beat scripts, sequences, prompts, takes and issue notes into the admin,
// which keeps the record. Sequence tools live in sequenceTools.ts.

export function createTillitownMcpServer({ origin }: { origin: string }) {
  const server = new McpServer(
    { name: 'tillitown-admin', title: 'TilliTown Admin', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // ---------------------------------------------------------------- reads

  server.registerTool('get_production_guide', {
    title: 'Production guide',
    description: 'The formats and rules for stories, beat scripts, storyboard prompts and video shot directions. Read it before writing any of them; the admin parses what you save.',
    annotations: READ,
  }, () => run(async () => productionGuide(await loadSettings())));

  server.registerTool('list_episodes', {
    title: 'List episodes',
    description: 'Every episode with its id, title, current step and status, most recently changed first.',
    annotations: READ,
  }, () => run(async () => {
    const result = await getEpisodesAction();
    if (!result.success) throw new ToolError(result.error);
    return result.episodes.map((episode) => ({
      id: episode.id,
      number: episode.number,
      title: episode.title,
      next_step: nextEpisodeStep(episode.progress),
      status: episodeStatusLine(episode.progress),
      has_script: episode.progress.hasScript,
      scenes: episode.progress.scenes,
      updated_at: episode.updatedAt,
      url: adminUrl(origin, episode.id, 'story'),
    }));
  }));

  server.registerTool('get_episode', {
    title: 'Get episode',
    description: 'One episode: its story, linked characters/locations/objects (with descriptions), beat script with per-beat timing, and its sequences (one storyboard + one clip each) with their image prompts, clip prompts and open issues. Use `include` to fetch only some parts of a long episode; get_sequence has everything about one sequence.',
    inputSchema: {
      episode_id: episodeId,
      include: z.array(z.enum(['story', 'assets', 'script', 'storyboard', 'video'])).optional()
        .describe('Parts to return. Default: all.'),
      sequence_numbers: z.array(z.number().int()).optional().describe('Only these sequences (storyboard/video parts).'),
    },
    annotations: READ,
  }, ({ episode_id, include, sequence_numbers }) => run(async () => {
    const parts = new Set(include?.length ? include : ['story', 'assets', 'script', 'storyboard', 'video']);
    const story = await loadStory(episode_id);
    const result: Record<string, unknown> = { id: story.id, topic: story.topic, url: adminUrl(origin, story.id, 'story') };

    if (parts.has('story')) result.story = markdownOf(story.content);
    if (parts.has('assets')) {
      const cast = await loadEpisodeCast(episode_id);
      const asset = (item: LibraryItem) => ({ name: item.name, description: item.description, has_reference_sheet: Boolean(item.magnific_identifier) });
      result.characters = cast.characters.map(asset);
      result.locations = cast.locations.map(asset);
      result.objects = cast.objects.map((item) => ({ ...asset(item), kind: item.kind }));
    }
    if (parts.has('script')) {
      const script = await loadScript(episode_id);
      if (!script) result.script = null;
      else {
        const markdown = markdownOf(script.content);
        const beats = parseScriptBeats(markdown);
        result.script = {
          id: script.id,
          saved_at: script.generated_at,
          beats: beats.map((beat) => {
            const timing = planShotTiming(beat);
            return { beat: beat.number, title: beat.title, setting: beat.setting, dialogue_words: timing.dialogueWords, clip_seconds: timing.seconds, over_8s: timing.overCap };
          }),
          runtime_seconds: beats.reduce((sum, beat) => sum + planShotTiming(beat).seconds, 0),
          text: markdown,
        };
      }
    }
    if (parts.has('storyboard') || parts.has('video')) {
      const wanted = sequence_numbers?.length ? new Set(sequence_numbers) : null;
      const scenes = (await loadScenes(episode_id)).filter((scene) => !wanted || wanted.has(scene.scene_number));
      const notes = (await listSequenceNotes({ storyId: episode_id }).catch(() => ({ notes: [] }))).notes;
      result.sequences = scenes.map((scene) => {
        const entry: Record<string, unknown> = {
          id: scene.id,
          sequence_number: scene.scene_number,
          title: scene.description,
          location: scene.EpisodeLocation?.Location?.name ?? null,
          characters: sceneCharacterNames(scene),
          objects: sceneObjectNames(scene),
          beat_numbers: scene.beat_numbers,
          has_storyboard_image: Boolean(scene.storyboard_image_url),
          open_issues: notes.filter((note) => note.scene_id === scene.id && note.kind === 'issue' && note.status === 'open').length,
          url: `${adminUrl(origin, episode_id, 'sequences')}/${scene.scene_number}`,
        };
        if (parts.has('storyboard')) {
          entry.storyboard_prompt = scene.storyboard_prompt;
          entry.script_beats = scene.script_beats;
        }
        if (parts.has('video')) {
          const plan = parseShotPlan(scene.video_prompt);
          entry.video = plan
            ? plan.shots.map((shot) => ({ seconds: shot.seconds, prompt: shot.prompt, has_clip: Boolean(shot.videoUrl), takes: shotTakes(shot).length }))
            : scene.video_prompt?.trim()
              ? { legacy_prompt: scene.video_prompt, has_clip: Boolean(scene.video_url) }
              : null;
        }
        return entry;
      });
    }
    return result;
  }));

  server.registerTool('list_library', {
    title: 'List library',
    description: 'Characters, locations and objects in the shared library, with descriptions and whether each has its reference sheet. Names here are the exact names every other tool expects.',
    inputSchema: {
      type: z.enum(['character', 'location', 'object', 'all']).optional().describe('Default: all.'),
    },
    annotations: READ,
  }, ({ type }) => run(async () => {
    const library = await loadLibrary();
    const entry = (item: LibraryItem) => ({ name: item.name, description: item.description, has_reference_sheet: Boolean(item.magnific_identifier) });
    const want = type ?? 'all';
    return {
      ...(want === 'all' || want === 'character' ? { characters: library.characters.map(entry) } : {}),
      ...(want === 'all' || want === 'location' ? { locations: library.locations.map(entry) } : {}),
      ...(want === 'all' || want === 'object'
        ? { objects: library.objects.map((item) => ({ ...entry(item), kind: item.kind, episode_id: item.story_id })) }
        : {}),
    };
  }));

  // ---------------------------------------------------------------- library and story

  server.registerTool('create_library_item', {
    title: 'Create library item',
    description: 'Adds a character, location or object to the library (name and visual description). Its reference sheet is generated later in the admin. Returns the existing entry instead if the name already exists. Optionally links it to an episode.',
    inputSchema: {
      type: z.enum(['character', 'location', 'object']),
      name: z.string().min(1),
      description: z.string().min(1).describe('Visual description the reference sheet is generated from.'),
      episode_id: episodeId.optional().describe('Also link it to this episode.'),
      object_kind: z.enum(['permanent', 'episode']).optional()
        .describe('Objects only: "permanent" is reused across episodes; "episode" belongs to episode_id. Default: episode when episode_id is given.'),
    },
    annotations: WRITE,
  }, ({ type, name, description, episode_id, object_kind }) => run(async () => {
    if (episode_id) await loadStory(episode_id);
    const library = await loadLibrary();
    const table = type === 'character' ? 'Character' : type === 'location' ? 'Location' : 'Prop';
    const pool: (LibraryItem | PropItem)[] = type === 'character' ? library.characters : type === 'location' ? library.locations
      : library.objects.filter((item) => item.kind === 'permanent' || item.story_id === episode_id);
    const existing = findExistingByName(name, pool);
    let item = existing;
    if (!item) {
      const kind = object_kind ?? (episode_id ? 'episode' : 'permanent');
      if (type === 'object' && kind === 'episode' && !episode_id) throw new ToolError('An episode object needs episode_id.');
      const row = type === 'object'
        ? { name: name.trim(), description, kind, story_id: kind === 'episode' ? episode_id : null }
        : { name: name.trim(), description };
      item = await one<LibraryItem>(supabase.from(table).insert([row]).select('*').single());
    }
    if (episode_id && item) {
      await linkToEpisode(episode_id, type === 'character' ? { characters: [item] } : type === 'location' ? { locations: [item] } : { objects: [item as PropItem] });
    }
    return {
      created: !existing,
      name: item!.name,
      note: existing
        ? `"${existing.name}" already exists in the library; it was ${episode_id ? 'linked, not duplicated' : 'not duplicated'}.`
        : `Created. Generate its reference sheet in the admin before storyboard images are made.`,
    };
  }));

  server.registerTool('create_episode', {
    title: 'Create episode',
    description: 'Creates a new episode from a story (markdown, first line "# Title") and links its characters, locations and objects by exact library name. Fails without saving if any name is unknown.',
    inputSchema: {
      topic: z.string().min(1).describe('One-line premise, shown when the story has no title.'),
      story: z.string().min(1).describe('The story in markdown. First line: "# Title".'),
      character_names: names('Characters in the story'),
      location_names: names('Locations in the story, in story order'),
      object_names: names('Permanent library objects the story uses'),
    },
    annotations: WRITE,
  }, ({ topic, story, character_names, location_names, object_names }) => run(async () => {
    const library = await loadLibrary();
    const characters = resolveNames('character', library.characters, character_names);
    const locations = resolveNames('location', library.locations, location_names);
    const objects = resolveNames('object', library.objects.filter((item) => item.kind === 'permanent'), object_names);
    const created = await one<{ id: string }>(supabase.from('Story').insert([{
      topic: topic.slice(0, 200),
      episode_number: '1',
      generation_type: 'new',
      mode: 'single',
      content: story,
      status: 'active',
      production_stage: 'story',
    }]).select('id').single());
    await linkToEpisode(created!.id, { characters, locations, objects });
    const missingSheets = [...characters, ...locations, ...objects].filter((item) => !item.magnific_identifier).map((item) => item.name);
    return {
      episode_id: created!.id,
      url: adminUrl(origin, created!.id, 'story'),
      linked: { characters: characters.map((c) => c.name), locations: locations.map((l) => l.name), objects: objects.map((o) => o.name) },
      ...(missingSheets.length ? { needs_reference_sheet: missingSheets } : {}),
    };
  }));

  server.registerTool('update_story', {
    title: 'Update story',
    description: 'Replaces an episode\'s story text and/or topic. Does not change its script or storyboard.',
    inputSchema: {
      episode_id: episodeId,
      story: z.string().min(1).optional().describe('The full new story in markdown. First line: "# Title".'),
      topic: z.string().min(1).optional(),
    },
    annotations: WRITE,
  }, ({ episode_id, story, topic }) => run(async () => {
    await loadStory(episode_id);
    if (!story && !topic) throw new ToolError('Give story, topic or both.');
    const { error } = await supabase.from('Story').update({ ...(story ? { content: story } : {}), ...(topic ? { topic: topic.slice(0, 200) } : {}) }).eq('id', episode_id);
    if (error) throw new ToolError(error.message);
    const script = await loadScript(episode_id);
    return {
      saved: true,
      url: adminUrl(origin, episode_id, 'story'),
      ...(story && script ? { note: 'The episode already has a beat script written from the old story. Update it with save_script if the story change should reach the script.' } : {}),
    };
  }));

  server.registerTool('link_episode_assets', {
    title: 'Link episode assets',
    description: 'Adds library characters, locations and objects to an episode by exact name. Only adds; existing links stay.',
    inputSchema: {
      episode_id: episodeId,
      character_names: names('Characters to add'),
      location_names: names('Locations to add'),
      object_names: names('Objects to add (permanent ones, or this episode\'s own)'),
    },
    annotations: WRITE,
  }, ({ episode_id, character_names, location_names, object_names }) => run(async () => {
    await loadStory(episode_id);
    const library = await loadLibrary();
    const characters = resolveNames('character', library.characters, character_names);
    const locations = resolveNames('location', library.locations, location_names);
    const objects = resolveNames('object', library.objects.filter((item) => item.kind === 'permanent' || item.story_id === episode_id), object_names);
    await linkToEpisode(episode_id, { characters, locations, objects });
    const cast = await loadEpisodeCast(episode_id);
    return {
      characters: cast.characters.map((c) => c.name),
      locations: cast.locations.map((l) => l.name),
      objects: cast.objects.map((o) => o.name),
      url: adminUrl(origin, episode_id, 'assets'),
    };
  }));

  // ---------------------------------------------------------------- script

  server.registerTool('save_script', {
    title: 'Save beat script',
    description: 'Saves the episode\'s beat script (markdown, format from get_production_guide). Checks that it parses into numbered beats and reports timing problems. Replacing an existing script needs replace_existing: true.',
    inputSchema: {
      episode_id: episodeId,
      script: z.string().min(1).describe('The full beat script in markdown.'),
      replace_existing: z.boolean().optional().describe('Required to overwrite a script the episode already has. Confirm with the user first.'),
    },
    annotations: REPLACE,
  }, ({ episode_id, script, replace_existing }) => run(async () => {
    const story = await loadStory(episode_id);
    const beats = parseScriptBeats(script);
    if (!beats.length) throw new ToolError('No beats found. Each beat starts with a line like "### BEAT 1 — Title" (see get_production_guide).');
    const errors: string[] = [];
    beats.forEach((beat, index) => {
      if (beat.number !== index + 1) errors.push(`Beat ${index + 1} is numbered ${beat.number ?? 'nothing'}; number beats 1, 2, 3… with no gaps.`);
      if (!beat.action) errors.push(`Beat ${beat.number ?? index + 1} has no [ACTION].`);
      if (!beat.camera) errors.push(`Beat ${beat.number ?? index + 1} has no [CAMERA].`);
    });
    if (errors.length) throw new ToolError(`The script was not saved:\n- ${errors.join('\n- ')}`);

    const cast = await loadEpisodeCast(episode_id);
    const warnings: string[] = [];
    beats.forEach((beat) => {
      const timing = planShotTiming(beat);
      if (timing.overCap) warnings.push(`Beat ${beat.number}: needs ${timing.neededSeconds} s (${timing.dialogueWords} words), over the 8 s clip cap. Split it.`);
      if (!beat.setting) warnings.push(`Beat ${beat.number}: no "EXT/INT — LOCATION — TIME" header line.`);
    });
    if (cast.locations.length) {
      const known = cast.locations.map((location) => normalizeCharacterName(location.name));
      const unlinked = beats.filter((beat) => beat.setting && !known.some((name) => normalizeCharacterName(beat.setting).includes(name)));
      if (unlinked.length) warnings.push(`Beats ${unlinked.map((beat) => beat.number).join(', ')}: the header names no linked location (${cast.locations.map((l) => `"${l.name}"`).join(', ')}).`);
    }

    const existing = await loadScript(episode_id);
    if (existing && !replace_existing) {
      const oldBeats = parseScriptBeats(markdownOf(existing.content)).length;
      throw new ToolError(`This episode already has a script (${oldBeats} beats). Nothing was saved. Show the user the change, then call again with replace_existing: true.`);
    }
    const payload = {
      topic: story.topic || 'Beat Script',
      episode_number: '1',
      generation_type: 'new',
      mode: 'single',
      content: script,
      status: 'success',
      story_id: episode_id,
      generated_at: new Date().toISOString(),
    };
    const saved = existing
      ? await one<{ id: string }>(supabase.from('Script').update(payload).eq('id', existing.id).select('id').single())
      : await one<{ id: string }>(supabase.from('Script').insert([payload]).select('id').single());

    const scenes = await loadScenes(episode_id);
    if (scenes.length) warnings.push(`The episode has ${scenes.length} sequences built from the previous script; they keep the old beat text until save_storyboard replaces them (or update_sequence edits their beats).`);
    const runtime = beats.reduce((sum, beat) => sum + planShotTiming(beat).seconds, 0);
    return { script_id: saved!.id, beats: beats.length, runtime_seconds: runtime, warnings, url: adminUrl(origin, episode_id, 'script') };
  }));

  // ---------------------------------------------------------------- sequences

  registerSequenceTools(server, { origin });

  return server;
}
