import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resetStoryboardAction } from '@/actions/resetStoryboardAction';
import { supabase } from '@/lib/supabase';
import { MAX_SCENE_OBJECTS } from '@/lib/propSheet';
import { scriptBeatBlocks } from '@/lib/scriptText';
import {
  buildShotPlan,
  parseScriptBeats,
  parseShotPlan,
  planShotTiming,
  sceneBeats,
  serializeShotPlan,
  shotTakes,
  validateShotDirection,
  type ShotSceneContext,
} from '@/lib/sceneShots';
import { MAX_BEATS_PER_SCENE } from '@/lib/storyboardGeneration';
import { SCENE_MAX_SECONDS, SCENE_MIN_SECONDS, sceneLengthProblems, withBeatDurations } from '@/lib/sceneTiming';
import { addClipTake } from '@/lib/sceneClips';
import { processAndUploadStoryboardImageAsset } from '@/lib/storage';
import { listGeneratedImageHistory, recordGeneratedImageVersion } from '@/lib/generatedImageHistory';
import { clipPromptOf, isMissingTable, listPromptVersions, recordPromptVersion } from '@/lib/promptHistory';
import { restorePromptVersion, updateSequenceBeats, updateStoryboardPrompt } from '@/lib/sequenceWrites';
import { addSequenceNote, listSequenceNotes, setSequenceNoteStatus } from '@/lib/sequenceNotes';
import { listSequenceReferences, recordSequenceReference, setReferenceIdentifier } from '@/lib/sequenceReferences';
import {
  MAX_ATTACHMENTS,
  clipAttachLine,
  resolveSequenceAttachments,
  saveSequenceAttachments,
  sheetVersions,
  storyboardAttachLine,
  withClipAttachLine,
  type AttachmentSet,
  type StoredAttachment,
} from '@/lib/sequenceAttachments';
import {
  NOT_IN_EPISODE,
  ToolError,
  loadEpisodeCast,
  loadScene,
  loadScenes,
  loadScript,
  loadStory,
  markdownOf,
  one,
  replaceSceneLinks,
  resolveNames,
  sceneCharacterNames,
  sceneObjectNames,
} from '@/lib/mcp/data';
import { READ, REPLACE, WRITE, adminUrl, episodeId, run, sequenceId, sequenceUrl, storyboardPromptWarnings } from '@/lib/mcp/toolKit';

// The tools that work on sequences (Scene rows): planning them, editing one, its takes, issues and
// history, and its clip's shot directions. Every text Claude writes is kept in the sequence's history.

export function registerSequenceTools(server: McpServer, { origin }: { origin: string }) {
  server.registerTool('save_storyboard', {
    title: 'Save sequences',
    description: 'Saves the episode\'s sequences: the script\'s beats grouped into sequences (one 2x2 storyboard and one clip each), each with its location, on-screen cast, objects and storyboard image prompt. Each sequence\'s beat text is copied from the saved script. Replacing existing sequences deletes their images, clips, issues and history, so it needs replace_existing: true. No images are generated.',
    inputSchema: {
      episode_id: episodeId,
      sequences: z.array(z.object({
        sequence_number: z.number().int().min(1),
        title: z.string().min(1),
        location_name: z.string().min(1).describe('Exact name of a location linked to the episode.'),
        character_names: z.array(z.string()).describe('Cast physically on screen, exact names. [] for none.'),
        object_names: z.array(z.string()).optional().describe(`Up to ${MAX_SCENE_OBJECTS} visible episode objects, exact names.`),
        beat_numbers: z.array(z.number().int().min(1)).min(1).max(MAX_BEATS_PER_SCENE),
        storyboard_prompt: z.string().min(1),
      })).min(1),
      replace_existing: z.boolean().optional().describe('Required when the episode already has sequences. Deletes their images, clips, issues and history. Confirm with the user first.'),
    },
    annotations: REPLACE,
  }, ({ episode_id, sequences, replace_existing }) => run(async () => {
    await loadStory(episode_id);
    const script = await loadScript(episode_id);
    if (!script) throw new ToolError('The episode has no beat script. Save one with save_script first.');
    const markdown = markdownOf(script.content);
    const beats = parseScriptBeats(markdown);
    const blocks = scriptBeatBlocks(markdown);
    const cast = await loadEpisodeCast(episode_id);

    // Every beat once, in order, as the admin's planner requires.
    const errors: string[] = [];
    let nextBeat = 1;
    sequences.forEach((sequence, index) => {
      const label = `Sequence ${sequence.sequence_number}`;
      if (sequence.sequence_number !== index + 1) errors.push(`Sequence ${index + 1} is numbered ${sequence.sequence_number}; number sequences 1, 2, 3… in order.`);
      for (const beat of sequence.beat_numbers) {
        if (beat !== nextBeat) errors.push(`${label}: beat ${beat} where beat ${nextBeat} was expected. Every beat appears once, in order.`);
        nextBeat = beat + 1;
        if (!blocks.has(beat)) errors.push(`${label}: beat ${beat} is not in the saved script.`);
      }
      if ((sequence.object_names?.length ?? 0) > MAX_SCENE_OBJECTS) errors.push(`${label}: at most ${MAX_SCENE_OBJECTS} objects.`);
    });
    if (nextBeat - 1 !== beats.length) errors.push(`The sequences cover beats 1–${nextBeat - 1}, but the script has ${beats.length} beats.`);
    const resolved = sequences.map((sequence) => {
      try {
        const [location] = resolveNames('location', cast.locations, [sequence.location_name], NOT_IN_EPISODE);
        return {
          location,
          characters: resolveNames('character', cast.characters, sequence.character_names, NOT_IN_EPISODE),
          objects: resolveNames('object', cast.objects, sequence.object_names, NOT_IN_EPISODE),
        };
      } catch (error) {
        errors.push(`Sequence ${sequence.sequence_number}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });
    if (errors.length) throw new ToolError(`The sequences were not saved:\n- ${errors.join('\n- ')}`);

    // Clip lengths: the script's [DURATION] lines, else what the dialogue needs.
    // Clip lengths as the script states them ([DURATION]), never shorter than the dialogue needs. A
    // written length is the author's choice, so it is not capped the way the timing agent's guesses are.
    const timings = beats.map((beat, index) => {
      const timing = planShotTiming(beat);
      return { beat: beat.number ?? index + 1, seconds: timing.seconds, speechSeconds: timing.dialogueWords ? timing.neededSeconds : 0, estimated: Boolean(beat.seconds) };
    });
    const plans = sequences.map((sequence) => ({ ...sequence, scene_number: sequence.sequence_number }));
    const warnings = [
      ...sceneLengthProblems(plans, timings).map((problem) => problem.replace(/^Scene/, 'Sequence')),
      ...sequences.flatMap((sequence) => {
        const seconds = sequence.beat_numbers.reduce((sum, beat) => sum + (timings.find((t) => t.beat === beat)?.seconds ?? 0), 0);
        return seconds < SCENE_MIN_SECONDS ? [`Sequence ${sequence.sequence_number} runs ${seconds} s, under ${SCENE_MIN_SECONDS} s; join it to a neighbour unless the location changes.`] : [];
      }),
      ...sequences.flatMap((sequence) => storyboardPromptWarnings(`Sequence ${sequence.sequence_number}`, sequence.storyboard_prompt, sequence.beat_numbers.length)),
    ];

    const existing = await loadScenes(episode_id);
    if (existing.length) {
      if (!replace_existing) {
        const images = existing.filter((scene) => scene.storyboard_image_url).length;
        const clips = existing.filter((scene) => parseShotPlan(scene.video_prompt)?.shots.some((shot) => shot.videoUrl) || scene.video_url).length;
        throw new ToolError(`This episode already has ${existing.length} sequences (${images} with storyboard images, ${clips} with clips). Replacing them deletes all of those, with their issues and history. Nothing was saved. Confirm with the user, then call again with replace_existing: true.`);
      }
      const reset = await resetStoryboardAction(episode_id);
      if (!reset.success) throw new ToolError(reset.error);
    }

    const rows = sequences.map((sequence, index) => ({
      story_id: episode_id,
      episode_location_id: resolved[index]!.location.episode_location_id,
      scene_number: sequence.sequence_number,
      description: sequence.title,
      storyboard_prompt: sequence.storyboard_prompt,
      script_beats: withBeatDurations(sequence.beat_numbers.map((beat) => blocks.get(beat)!).join('\n\n---\n\n'), sequence.beat_numbers, timings),
      beat_numbers: sequence.beat_numbers,
      storyboard_status: 'confirmed',
      order_index: sequence.sequence_number,
    }));
    const inserted = await one<{ id: string; scene_number: number }[]>(supabase.from('Scene').insert(rows).select('id, scene_number'));
    const idByNumber = new Map((inserted || []).map((row) => [row.scene_number, row.id]));
    for (const [index, sequence] of sequences.entries()) {
      await replaceSceneLinks(idByNumber.get(sequence.sequence_number)!, resolved[index]!.characters, resolved[index]!.objects);
    }
    // Each sequence's history starts with what Claude wrote.
    const { error: historyError } = await supabase.from('PromptVersion').insert(rows.flatMap((row) => {
      const id = idByNumber.get(row.scene_number)!;
      return [
        { scene_id: id, field: 'storyboard_prompt', value: row.storyboard_prompt, author: 'claude' },
        { scene_id: id, field: 'beats', value: row.script_beats, author: 'claude' },
      ];
    }));
    if (historyError && !isMissingTable(historyError)) console.warn('Sequence history could not be started:', historyError.message);

    return {
      sequences: sequences.map((sequence) => ({ sequence_number: sequence.sequence_number, id: idByNumber.get(sequence.sequence_number), beats: sequence.beat_numbers })),
      runtime_seconds: timings.reduce((sum, timing) => sum + timing.seconds, 0),
      replaced_sequences: existing.length,
      warnings,
      next: 'Make the storyboard images (in the admin, or with Magnific and record_storyboard_take), then write each sequence\'s shot directions with save_video_plan.',
      url: adminUrl(origin, episode_id, 'sequences'),
    };
  }));

  server.registerTool('get_sequence', {
    title: 'Get sequence',
    description: 'Everything about one sequence: its beats, storyboard prompt and takes, clip prompt and takes, issues and notes, and recent history. Give sequence_id, or episode_id with sequence_number.',
    inputSchema: {
      sequence_id: sequenceId.optional(),
      episode_id: episodeId.optional(),
      sequence_number: z.number().int().min(1).optional(),
    },
    annotations: READ,
  }, ({ sequence_id, episode_id, sequence_number }) => run(async () => {
    let id = sequence_id;
    if (!id) {
      if (!episode_id || !sequence_number) throw new ToolError('Give sequence_id, or episode_id with sequence_number.');
      const match = (await loadScenes(episode_id)).find((scene) => scene.scene_number === sequence_number);
      if (!match) throw new ToolError(`Episode ${episode_id} has no sequence ${sequence_number}.`);
      id = match.id;
    }
    const scene = await loadScene(id);
    const [imageTakes, notes, history, storyboardAttachments, clipAttachments] = await Promise.all([
      listGeneratedImageHistory('scene_storyboard', scene.id),
      listSequenceNotes({ sceneId: scene.id }).catch(() => ({ available: false, notes: [] })),
      listPromptVersions(scene.id).catch(() => ({ available: false, versions: [] })),
      resolveSequenceAttachments(scene.id, 'storyboard'),
      resolveSequenceAttachments(scene.id, 'clip'),
    ]);
    const clip = parseShotPlan(scene.video_prompt)?.shots[0];
    return {
      id: scene.id,
      sequence_number: scene.scene_number,
      title: scene.description,
      location: scene.EpisodeLocation?.Location?.name ?? null,
      characters: sceneCharacterNames(scene),
      objects: sceneObjectNames(scene),
      beat_numbers: scene.beat_numbers,
      beats: scene.script_beats,
      storyboard: {
        prompt: scene.storyboard_prompt,
        image_in_use: scene.storyboard_image_url,
        takes: imageTakes.map((take) => ({ url: take.public_url, in_use: take.is_selected, magnific_identifier: take.provider_identifier, created_at: take.created_at })),
      },
      clip: clip
        ? {
          seconds: clip.seconds,
          prompt: clip.prompt,
          clip_in_use: clip.videoUrl ?? null,
          takes: shotTakes(clip).map((take) => ({ url: take.url, in_use: take.url === clip.videoUrl, created_at: take.createdAt })),
        }
        : { planned: false, legacy_prompt: clipPromptOf(scene.video_prompt) },
      issues_and_notes: notes.notes.map((note) => ({ id: note.id, kind: note.kind, status: note.status, author: note.author, body: note.body, media_url: note.media_url, created_at: note.created_at })),
      attachments: { storyboard: attachmentSummary(storyboardAttachments), clip: attachmentSummary(clipAttachments) },
      reference_images: (await listSequenceReferences({ sceneId: scene.id }).catch(() => ({ references: [] }))).references.map((item) => ({
        reference_id: item.id, label: item.label, kind: item.kind, url: item.image_url, in_magnific: Boolean(item.magnific_identifier), issue_id: item.note_id,
      })),
      history: history.versions.slice(0, 15).map((version) => ({ id: version.id, field: version.field, author: version.author, created_at: version.created_at, preview: version.value.slice(0, 160) })),
      url: sequenceUrl(origin, scene.story_id, scene.scene_number),
    };
  }));

  server.registerTool('update_sequence', {
    title: 'Update sequence',
    description: 'Edits one sequence: title, storyboard image prompt, beats (kept in sync with the episode script), on-screen cast or objects. Keeps its images and clips; every text change is kept in its history.',
    inputSchema: {
      sequence_id: sequenceId,
      title: z.string().min(1).optional(),
      storyboard_prompt: z.string().min(1).optional(),
      beats: z.string().min(1).optional().describe('The sequence\'s full beat text, with the same beats and headers as now ("### BEAT 12 — Title").'),
      character_names: z.array(z.string()).optional().describe('Replaces the on-screen cast. [] clears it.'),
      object_names: z.array(z.string()).optional().describe(`Replaces the objects (max ${MAX_SCENE_OBJECTS}). [] clears them.`),
    },
    annotations: WRITE,
  }, ({ sequence_id, title, storyboard_prompt, beats, character_names, object_names }) => run(async () => {
    const scene = await loadScene(sequence_id);
    const cast = await loadEpisodeCast(scene.story_id);
    if ((object_names?.length ?? 0) > MAX_SCENE_OBJECTS) throw new ToolError(`At most ${MAX_SCENE_OBJECTS} objects per sequence.`);
    const characters = character_names ? resolveNames('character', cast.characters, character_names, NOT_IN_EPISODE) : undefined;
    const objects = object_names ? resolveNames('object', cast.objects, object_names, NOT_IN_EPISODE) : undefined;
    const warnings: string[] = [];
    if (beats) {
      const { scriptNote } = await updateSequenceBeats(sequence_id, beats, 'claude');
      if (scriptNote) warnings.push(scriptNote);
    }
    if (storyboard_prompt) {
      await updateStoryboardPrompt(sequence_id, storyboard_prompt, 'claude');
      warnings.push(...storyboardPromptWarnings('Prompt', storyboard_prompt, (scene.beat_numbers || []).length || 1));
      if (scene.storyboard_image_url) warnings.push('The sequence already has an image from the old prompt. Make a new take to see the change.');
    }
    if (title) {
      const { error } = await supabase.from('Scene').update({ description: title, updated_at: new Date().toISOString() }).eq('id', sequence_id);
      if (error) throw new ToolError(error.message);
    }
    await replaceSceneLinks(sequence_id, characters, objects);
    if ((characters || beats) && parseShotPlan(scene.video_prompt)) warnings.push('Re-save the sequence\'s video plan with save_video_plan so the clip matches the change.');
    return { saved: true, sequence_number: scene.scene_number, warnings, url: sequenceUrl(origin, scene.story_id, scene.scene_number) };
  }));

  server.registerTool('add_sequence_note', {
    title: 'Add issue or note',
    description: 'Records an issue found in a sequence\'s storyboard or clip (e.g. "beat 43: background glitches behind the characters"), or a note about it, so the team sees it on the sequence\'s page.',
    inputSchema: {
      sequence_id: sequenceId,
      kind: z.enum(['issue', 'note']).optional().describe('Default: issue.'),
      body: z.string().min(1),
      media_url: z.string().url().optional().describe('The storyboard or clip take the issue is about.'),
    },
    annotations: WRITE,
  }, ({ sequence_id, kind, body, media_url }) => run(async () => {
    const note = await addSequenceNote({ sceneId: sequence_id, kind: kind ?? 'issue', body, mediaUrl: media_url, author: 'claude' });
    return { id: note.id, saved: true };
  }));

  server.registerTool('resolve_sequence_note', {
    title: 'Resolve or reopen issue',
    description: 'Marks an issue resolved (after its fix is saved), or open again.',
    inputSchema: {
      note_id: z.string().uuid(),
      status: z.enum(['resolved', 'open']).optional().describe('Default: resolved.'),
    },
    annotations: WRITE,
  }, ({ note_id, status }) => run(async () => {
    const note = await setSequenceNoteStatus(note_id, status ?? 'resolved');
    return { id: note.id, status: note.status };
  }));

  server.registerTool('record_storyboard_take', {
    title: 'Record storyboard take',
    description: 'Saves a storyboard image made outside the admin (for example with the Magnific connector) as a take of a sequence, copied to the admin\'s storage. Pass the Magnific creation identifier: the admin\'s clip generation opens on it.',
    inputSchema: {
      sequence_id: sequenceId,
      image_url: z.string().url(),
      magnific_identifier: z.string().optional(),
      put_in_use: z.boolean().optional().describe('Default true: the new take becomes the storyboard in use.'),
    },
    annotations: WRITE,
  }, ({ sequence_id, image_url, magnific_identifier, put_in_use }) => run(async () => {
    const scene = await loadScene(sequence_id);
    const stored = await processAndUploadStoryboardImageAsset(image_url, magnific_identifier || `claude_${Date.now()}`, scene.id);
    const take = await recordGeneratedImageVersion({
      ownerType: 'scene_storyboard',
      ownerId: scene.id,
      publicUrl: stored.publicUrl,
      storagePath: stored.storagePath,
      storageBucket: stored.storageBucket,
      providerIdentifier: magnific_identifier || null,
      promptUsed: scene.storyboard_prompt,
      use: put_in_use === false ? 'if-none' : 'always',
    });
    return {
      url: take.public_url,
      in_use: take.is_selected,
      ...(magnific_identifier ? {} : { warning: 'No Magnific identifier was given, so the admin cannot generate a clip from this storyboard; make its clip outside and record it with record_clip_take.' }),
      sequence_url: sequenceUrl(origin, scene.story_id, scene.scene_number),
    };
  }));

  server.registerTool('record_clip_take', {
    title: 'Record clip take',
    description: 'Saves a clip made outside the admin (for example with the Magnific connector) as a take of a sequence\'s clip, copied to the admin\'s storage. It becomes the clip in use only when the sequence has none. The sequence needs a clip plan (save_video_plan) first.',
    inputSchema: {
      sequence_id: sequenceId,
      video_url: z.string().url(),
      magnific_identifier: z.string().optional(),
    },
    annotations: WRITE,
  }, ({ sequence_id, video_url, magnific_identifier }) => run(async () => {
    const scene = await loadScene(sequence_id);
    try {
      const result = await addClipTake(scene.id, video_url, { identifier: magnific_identifier });
      return { clip_in_use: result.inUse, warning: result.warning, sequence_url: sequenceUrl(origin, scene.story_id, scene.scene_number) };
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : 'The clip could not be saved.');
    }
  }));

  server.registerTool('get_attachable_assets', {
    title: 'Get attachable assets',
    description: "What a sequence's storyboard or clip can attach: the episode's characters, locations and objects with every version of their sheets (e.g. a location's golden-hour and night sheets), and the other sequences' storyboards (for a continuity reference). Use before set_attachments.",
    inputSchema: { sequence_id: sequenceId },
    annotations: READ,
  }, ({ sequence_id }) => run(async () => {
    const scene = await loadScene(sequence_id);
    const [cast, scenes] = await Promise.all([loadEpisodeCast(scene.story_id), loadScenes(scene.story_id)]);
    const [characterVersions, locationVersions, objectVersions] = await Promise.all([
      sheetVersions('character', cast.characters.map((item) => item.id)),
      sheetVersions('location', cast.locations.map((item) => item.id)),
      sheetVersions('object', cast.objects.map((item) => item.id)),
    ]);
    type Version = (typeof characterVersions)[number];
    const sheet = (item: { id: string; name: string; magnific_identifier: string | null }, rows: Version[]) => ({
      name: item.name,
      has_sheet: Boolean(item.magnific_identifier),
      versions: rows.filter((row) => row.owner_id === item.id).map((row) => ({
        version_id: row.id,
        url: row.public_url,
        in_use: row.is_selected,
        attachable: Boolean(row.provider_identifier),
        created_at: row.created_at,
        ...(row.prompt_used ? { made_from: row.prompt_used.slice(0, 120) } : {}),
      })),
    });
    return {
      sequence_number: scene.scene_number,
      characters: cast.characters.map((item) => sheet(item, characterVersions)),
      locations: cast.locations.map((item) => sheet(item, locationVersions)),
      objects: cast.objects.map((item) => sheet(item, objectVersions)),
      storyboards: scenes.filter((item) => item.id !== scene.id).map((item) => ({
        sequence_number: item.scene_number,
        title: item.description,
        has_storyboard: Boolean(item.storyboard_image_url),
        url: item.storyboard_image_url,
      })),
      // Camera maps and other references made for this episode's sequences.
      reference_images: (await listSequenceReferences({ storyId: scene.story_id }).catch(() => ({ references: [] }))).references.map((item) => ({
        reference_id: item.id,
        sequence_number: scenes.find((candidate) => candidate.id === item.scene_id)?.scene_number ?? null,
        label: item.label,
        kind: item.kind,
        url: item.image_url,
        in_magnific: Boolean(item.magnific_identifier),
      })),
    };
  }));

  server.registerTool('set_attachments', {
    title: 'Set attachments',
    description: `Chooses the reference images sent with a sequence's storyboard or clip request, in order: the first is Image 1, the next Image 2, and so on, so the prompt can name them by number. Pick a sheet by its exact name, optionally a specific version (version_id from get_attachable_assets), or a sequence's storyboard by number (continuity reference). A clip always opens with its own storyboard as Image 1. At most ${MAX_ATTACHMENTS}. Pass automatic: true to go back to the sequence's cast, location and objects.`,
    inputSchema: {
      sequence_id: sequenceId,
      target: z.enum(['storyboard', 'clip']),
      automatic: z.boolean().optional().describe('true: forget the chosen list and attach automatically.'),
      attachments: z.array(z.object({
        type: z.enum(['character', 'location', 'object', 'storyboard', 'reference']),
        name: z.string().optional().describe('Exact name of an episode character, location or object.'),
        reference_id: z.string().uuid().optional().describe('For a reference image (camera map, seating map): its id from record_reference_image or get_attachable_assets.'),
        sequence_number: z.number().int().min(1).optional().describe("For a storyboard: whose storyboard (this sequence's for a clip, an earlier one for continuity)."),
        version_id: z.string().uuid().optional().describe('A specific version of the sheet or storyboard; default is the one in use.'),
        label: z.string().optional().describe('How the prompt names it, e.g. "Oasis Camp Night sheet". Default: "<name> sheet" or "SEQ 15 storyboard".'),
        role: z.string().optional().describe('Its job, e.g. "appearance only", "environment only", "continuity reference: match the SHOT 2 panel".'),
      })).max(MAX_ATTACHMENTS).optional(),
    },
    annotations: WRITE,
  }, ({ sequence_id, target, automatic, attachments }) => run(async () => {
    const scene = await loadScene(sequence_id);
    let list: StoredAttachment[] | null = null;
    if (!automatic) {
      if (!attachments?.length) throw new ToolError('Give the attachments in order, or automatic: true.');
      const [cast, scenes, references] = await Promise.all([
        loadEpisodeCast(scene.story_id),
        loadScenes(scene.story_id),
        listSequenceReferences({ storyId: scene.story_id }).catch(() => ({ references: [] })),
      ]);
      const pools = { character: cast.characters, location: cast.locations, object: cast.objects } as const;
      list = attachments.map((item): StoredAttachment => {
        if (item.type === 'reference') {
          const reference = references.references.find((candidate) => candidate.id === item.reference_id);
          if (!reference) throw new ToolError('A reference attachment needs the reference_id of a reference image of this episode (record_reference_image, get_attachable_assets).');
          return { kind: 'reference', id: reference.id, take_id: null, label: item.label || reference.label, role: item.role ?? null };
        }
        if (item.type === 'storyboard') {
          const number = item.sequence_number ?? scene.scene_number;
          const other = scenes.find((candidate) => candidate.scene_number === number);
          if (!other) throw new ToolError(`This episode has no sequence ${number}.`);
          return { kind: 'storyboard', id: other.id, take_id: item.version_id ?? null, label: item.label || `SEQ ${String(number).padStart(2, '0')} storyboard`, role: item.role ?? null };
        }
        if (!item.name) throw new ToolError(`A ${item.type} attachment needs its exact name.`);
        const [asset] = resolveNames(item.type, pools[item.type], [item.name], NOT_IN_EPISODE);
        return { kind: item.type, id: asset.id, take_id: item.version_id ?? null, label: item.label || `${asset.name} sheet`, role: item.role ?? null };
      });
    }
    const { notes } = await saveSequenceAttachments(scene.id, target, list);
    const set = await resolveSequenceAttachments(scene.id, target);
    const warnings = [...notes, ...set.problems];
    if (target === 'storyboard') {
      const continuity = set.attachments.findIndex((item) => item.kind === 'storyboard');
      if (continuity >= 0 && continuity !== set.attachments.length - 1) warnings.push('Put the continuity storyboard last, so the other images keep their numbers.');
    }
    // A planned clip's prompt names its attachments; keep that line in step with the list.
    const clip = parseShotPlan(scene.video_prompt);
    if (target === 'clip' && clip?.shots.length && !set.automatic) {
      const previous = clip.shots[0].prompt;
      const prompt = withClipAttachLine(previous, set);
      if (prompt !== previous) {
        clip.shots[0] = { ...clip.shots[0], prompt };
        const { error } = await supabase.from('Scene').update({ video_prompt: serializeShotPlan(clip), updated_at: new Date().toISOString() }).eq('id', scene.id);
        if (error) throw new ToolError(error.message);
        await recordPromptVersion(scene.id, 'clip_prompt', prompt, 'claude', previous);
        warnings.push("The clip prompt's Attachments line was updated to this list.");
      }
    }
    return {
      ...attachmentSummary(set),
      prompt_line: target === 'storyboard' ? storyboardAttachLine(set) : clipAttachLine(set),
      next: target === 'storyboard'
        ? 'Start the storyboard prompt with prompt_line and refer to each image as "Image N" (update_sequence).'
        : 'The clip prompt now lists these in order; refer to them as "Image N" in the shot text if needed (save_video_plan with prompt_override, or keep the built prompt).',
      warnings,
      url: sequenceUrl(origin, scene.story_id, scene.scene_number),
    };
  }));

  server.registerTool('record_reference_image', {
    title: 'Record reference image',
    description: "Saves a camera map, seating map or other reference image on a sequence, copied into the admin's storage. Make one only after the sequence's storyboard has failed several times on layout or positions (see the guide). Pass issue_id to link it to the issue it fixes, and magnific_identifier once the image is in Magnific (upload it with the Magnific connector); without one it cannot be sent to the generator. Then attach it with set_attachments (type reference).",
    inputSchema: {
      sequence_id: sequenceId,
      image_url: z.string().url(),
      label: z.string().min(1).describe('How prompts name it, e.g. "SEQ 03 camera map".'),
      kind: z.enum(['camera_map', 'seating_map', 'reference']).optional().describe('Default: camera_map.'),
      magnific_identifier: z.string().optional(),
      issue_id: z.string().uuid().optional().describe('The issue (add_sequence_note) this reference image is the fix for.'),
    },
    annotations: WRITE,
  }, ({ sequence_id, image_url, label, kind, magnific_identifier, issue_id }) => run(async () => {
    const scene = await loadScene(sequence_id);
    const reference = await recordSequenceReference({
      sceneId: scene.id, label, kind: kind ?? 'camera_map', imageUrl: image_url,
      magnificIdentifier: magnific_identifier, noteId: issue_id, author: 'claude',
    });
    return {
      reference_id: reference.id,
      url: reference.image_url,
      in_magnific: Boolean(reference.magnific_identifier),
      next: reference.magnific_identifier
        ? 'Attach it with set_attachments (type reference, this reference_id) and describe each panel by left, center and right of frame; tell the model it is only a map and its arrows must never be drawn.'
        : 'Upload it to Magnific to get its identifier, then call set_reference_identifier; until then it cannot be attached to a generation.',
      sequence_url: sequenceUrl(origin, scene.story_id, scene.scene_number),
    };
  }));

  server.registerTool('set_reference_identifier', {
    title: 'Set reference identifier',
    description: "Records the Magnific identifier of a reference image after it was uploaded to Magnific, so it can be sent with a storyboard or clip request.",
    inputSchema: { reference_id: z.string().uuid(), magnific_identifier: z.string().min(1) },
    annotations: WRITE,
  }, ({ reference_id, magnific_identifier }) => run(async () => {
    const reference = await setReferenceIdentifier(reference_id, magnific_identifier);
    return { reference_id: reference.id, label: reference.label, in_magnific: true };
  }));

  server.registerTool('restore_prompt_version', {
    title: 'Restore a version',
    description: 'Puts back an earlier version of a sequence\'s beats, storyboard prompt or clip prompt (ids from get_sequence\'s history). The current text stays in the history.',
    inputSchema: { version_id: z.string().uuid() },
    annotations: WRITE,
  }, ({ version_id }) => run(async () => {
    const result = await restorePromptVersion(version_id, 'claude');
    return { restored: true, ...(result && 'scriptNote' in result && result.scriptNote ? { note: result.scriptNote } : {}) };
  }));

  server.registerTool('save_video_plan', {
    title: 'Save video plan',
    description: 'Saves one sequence\'s video shot directions: the lighting and, per beat, camera, action and placement. The server adds the dialogue word for word, times every shot, and builds the timestamped clip prompt the admin sends to the video model. Keeps a generated clip when the beats are unchanged.',
    inputSchema: {
      sequence_id: sequenceId,
      lighting: z.string().min(1).describe('One phrase, at most 14 words: time of day plus one light quality.'),
      shots: z.array(z.object({
        beat_number: z.number().int(),
        camera: z.string().min(1).describe('e.g. "Medium shot, eye level, slow push-in."'),
        action: z.string().min(1).describe('One sentence, at most 25 words, the single visible action.'),
        placement: z.string().optional().describe('"Name: left, foreground, kneeling, facing right; …" or "none".'),
      })).min(1).describe('One per beat of the sequence, in beat order.'),
      prompt_override: z.string().min(1).optional()
        .describe('Replaces the built clip prompt with your own text. Avoid unless the user asks; timing and dialogue are then yours to get right.'),
    },
    annotations: WRITE,
  }, ({ sequence_id, lighting, shots, prompt_override }) => run(async () => {
    const scene = await loadScene(sequence_id);
    const context: ShotSceneContext = {
      locationName: scene.EpisodeLocation?.Location?.name || '',
      characterNames: sceneCharacterNames(scene),
      objectNames: sceneObjectNames(scene),
      scriptBeats: scene.script_beats || '',
      beatNumbers: Array.isArray(scene.beat_numbers) ? scene.beat_numbers : undefined,
      description: scene.description || '',
      storyboardPrompt: scene.storyboard_prompt,
    };
    const beats = sceneBeats(context);
    let direction;
    try {
      direction = validateShotDirection({ lighting, shots }, beats);
    } catch (error) {
      throw new ToolError(`${error instanceof Error ? error.message : 'Invalid shots.'} This sequence's beats are ${JSON.stringify(beats.map((beat, index) => beat.number ?? index + 1))}.`);
    }
    const previous = parseShotPlan(scene.video_prompt);
    const plan = buildShotPlan(context, direction, previous);
    if (prompt_override) plan.shots[0].prompt = prompt_override;
    else {
      // A clip with chosen attachments names them, in order, in its prompt.
      const chosen = await resolveSequenceAttachments(scene.id, 'clip');
      if (!chosen.automatic) plan.shots[0].prompt = withClipAttachLine(plan.shots[0].prompt, chosen);
    }
    const { error } = await supabase.from('Scene').update({ video_prompt: serializeShotPlan(plan), updated_at: new Date().toISOString() }).eq('id', sequence_id);
    if (error) throw new ToolError(error.message);
    await recordPromptVersion(scene.id, 'clip_prompt', plan.shots[0].prompt, 'claude', clipPromptOf(scene.video_prompt));

    const shot = plan.shots[0];
    const warnings: string[] = [];
    if (previous?.shots.some((item) => item.videoUrl) && !shot.videoUrl) warnings.push('The sequence\'s beats changed, so its earlier clip is no longer in use. Make a new clip.');
    if (shot.seconds > SCENE_MAX_SECONDS) warnings.push(`The clip runs ${shot.seconds} s, over ${SCENE_MAX_SECONDS} s.`);
    if (!scene.storyboard_image_url) warnings.push('The sequence has no storyboard image yet; the clip opens on it, so make the image first.');
    return {
      sequence_number: scene.scene_number,
      clip_seconds: shot.seconds,
      shots: shot.segments?.map((segment) => ({ beat: segment.beat, start: segment.start, end: segment.end, dialogue_words: segment.dialogueWords })),
      kept_existing_clip: Boolean(shot.videoUrl),
      prompt: shot.prompt,
      warnings,
      url: sequenceUrl(origin, scene.story_id, scene.scene_number),
    };
  }));
}

/** A sequence's attachments for one request, as Claude reads them. */
function attachmentSummary(set: AttachmentSet) {
  return {
    chosen_by: set.automatic ? 'automatic (cast, location, objects)' : 'chosen',
    images: set.attachments.map((item) => ({
      image: item.image,
      type: item.kind,
      label: item.label,
      role: item.role ?? null,
      version: item.take_id ? 'specific version' : 'in use',
      ...(item.problem ? { problem: item.problem } : {}),
    })),
  };
}
