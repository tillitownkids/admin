import { supabase } from '@/lib/supabase';
import { clipBeats, parseScriptBeats, parseShotPlan, serializeShotPlan, SHOT_DURATIONS, SHOT_PLAN_FORMAT, snapShotSeconds, type ClipSegment, type SceneShot } from '@/lib/sceneShots';
import { replaceBeatBlocks, stripHtmlToMarkdown } from '@/lib/scriptText';
import { clipPromptOf, loadPromptVersion, recordPromptVersion, type PromptAuthor } from '@/lib/promptHistory';

// Writes to one sequence's beats and prompts, each recorded in its history. Used by the admin's
// server actions and by the MCP server, so both keep the same record.

export class SequenceWriteError extends Error {}

interface SequenceRow {
  id: string;
  story_id: string | null;
  scene_number: number;
  beat_numbers: number[] | null;
  script_beats: string | null;
  storyboard_prompt: string;
  video_prompt: string | null;
}

async function loadSequence(sceneId: string): Promise<SequenceRow> {
  const { data, error } = await supabase
    .from('Scene').select('id, story_id, scene_number, beat_numbers, script_beats, storyboard_prompt, video_prompt')
    .eq('id', sceneId).maybeSingle();
  if (error) throw new SequenceWriteError(error.message);
  if (!data) throw new SequenceWriteError('The sequence no longer exists.');
  return data as SequenceRow;
}

async function update(sceneId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from('Scene').update({ ...values, updated_at: new Date().toISOString() }).eq('id', sceneId);
  if (error) throw new SequenceWriteError(error.message);
}

/**
 * Saves a sequence's beat text and copies the same beats into the episode's script, so the Script
 * step and the sequence always agree. The beats must keep the sequence's beat numbers.
 */
export async function updateSequenceBeats(sceneId: string, markdown: string, author: PromptAuthor) {
  const scene = await loadSequence(sceneId);
  const text = markdown.replaceAll('\r\n', '\n').trim();
  const beats = parseScriptBeats(text);
  const expected = Array.isArray(scene.beat_numbers) ? scene.beat_numbers : [];
  const numbers = beats.map((beat) => beat.number);
  if (!beats.length || numbers.some((number) => number === null)) {
    throw new SequenceWriteError('Each beat must start with its header, like "### BEAT 12 — Title".');
  }
  if (expected.length && (numbers.length !== expected.length || numbers.some((number, index) => number !== expected[index]))) {
    throw new SequenceWriteError(`This sequence holds beats ${expected.join(', ')}; the text has beats ${numbers.join(', ')}. Keep the same beats, or plan the storyboard again to regroup them.`);
  }

  let scriptNote: string | undefined;
  if (scene.story_id) {
    const { data: scripts, error } = await supabase
      .from('Script').select('id, content').eq('story_id', scene.story_id).order('generated_at', { ascending: false }).limit(1);
    if (error) throw new SequenceWriteError(error.message);
    const script = scripts?.[0];
    if (script) {
      const blocks = new Map<number, string>();
      // Each beat's own text, from its header to the next.
      const lines = text.split('\n');
      const starts = lines.flatMap((line, index) => (/^\s*(?:#{1,6}\s*)?\**\s*BEAT\s*\d+/i.test(line) ? [index] : []));
      starts.forEach((start, index) => {
        const number = Number(lines[start].match(/BEAT\s*(\d+)/i)![1]);
        blocks.set(number, lines.slice(start, starts[index + 1] ?? lines.length).join('\n').replace(/\n\s*-{3,}\s*$/, '').trim());
      });
      const { text: merged, missing } = replaceBeatBlocks(stripHtmlToMarkdown(script.content || ''), blocks);
      if (missing.length) {
        scriptNote = `Beats ${missing.join(', ')} were not found in the episode script, so only the sequence was updated.`;
      } else {
        const { error: scriptError } = await supabase.from('Script').update({ content: merged }).eq('id', script.id);
        if (scriptError) throw new SequenceWriteError(`The sequence was not saved: the script could not be updated (${scriptError.message}).`);
      }
    }
  }

  await update(sceneId, { script_beats: text });
  await recordPromptVersion(sceneId, 'beats', text, author, scene.script_beats);
  return { scriptNote };
}

export async function updateStoryboardPrompt(sceneId: string, prompt: string, author: PromptAuthor) {
  const scene = await loadSequence(sceneId);
  if (!prompt.trim()) throw new SequenceWriteError('The storyboard prompt is empty.');
  await update(sceneId, { storyboard_prompt: prompt });
  await recordPromptVersion(sceneId, 'storyboard_prompt', prompt, author, scene.storyboard_prompt);
}

/** Replaces the clip prompt text. Its plan, timing and takes stay as they are. */
export async function updateClipPrompt(sceneId: string, prompt: string, author: PromptAuthor) {
  const scene = await loadSequence(sceneId);
  if (!prompt.trim()) throw new SequenceWriteError('The clip prompt is empty.');
  const plan = parseShotPlan(scene.video_prompt);
  const previous = clipPromptOf(scene.video_prompt);
  if (plan?.shots.length) {
    plan.shots[0] = { ...plan.shots[0], prompt };
    await update(sceneId, { video_prompt: serializeShotPlan(plan) });
  } else {
    // A sequence with no clip plan yet keeps the text as a plain prompt until it is planned.
    await update(sceneId, { video_prompt: prompt });
  }
  await recordPromptVersion(sceneId, 'clip_prompt', prompt, author, previous);
}

/** Puts an earlier version back. It is saved as a new version; history is never rewritten. */
export async function restorePromptVersion(versionId: string, author: PromptAuthor) {
  const version = await loadPromptVersion(versionId);
  if (version.field === 'beats') return updateSequenceBeats(version.scene_id, version.value, author);
  if (version.field === 'storyboard_prompt') return updateStoryboardPrompt(version.scene_id, version.value, author);
  return updateClipPrompt(version.scene_id, version.value, author);
}

export interface ClipPromptInput {
  /** The sequence's beats this clip plays, in order, each with its natural length in seconds. */
  beats: { beat: number; seconds: number }[];
  /** The full clip prompt, written by hand (attachments, panels, staging, script, timing). */
  prompt: string;
  title?: string;
}

/**
 * Saves hand-written clip prompts for a sequence: one clip, or several clips of whole beats when the
 * beats need more than one clip can hold at a natural pace (dialogue is never shortened or sped up).
 * Each clip's length is the shortest accepted length that holds its beats; the last beat takes any
 * slack. A clip that plays the same beats as before keeps its takes. A sequence's older single clip
 * stays in use until the new clips are made.
 */
export async function saveClipPrompts(sceneId: string, clips: ClipPromptInput[], author: PromptAuthor) {
  const scene = await loadSequence(sceneId);
  if (!clips.length) throw new SequenceWriteError('Give at least one clip.');
  const sequenceBeats = scene.beat_numbers || [];
  const covered = clips.flatMap((clip) => clip.beats.map((entry) => entry.beat));
  if (sequenceBeats.length && (covered.length !== sequenceBeats.length || covered.some((beat, index) => beat !== sequenceBeats[index]))) {
    throw new SequenceWriteError(`The clips must play the sequence's beats ${sequenceBeats.join(', ')} once each, in order (got ${covered.join(', ')}).`);
  }
  const parsed = parseScriptBeats(stripHtmlToMarkdown(scene.script_beats || ''));
  const titleOf = (beat: number) => parsed.find((entry) => entry.number === beat)?.title ?? `Beat ${beat}`;
  const panelOf = (beat: number) => Math.max(1, sequenceBeats.indexOf(beat) + 1);
  const previous = parseShotPlan(scene.video_prompt);

  const shots: SceneShot[] = clips.map((clip, index) => {
    if (!clip.prompt.trim()) throw new SequenceWriteError(`Clip ${index + 1} has no prompt.`);
    const needed = clip.beats.reduce((sum, entry) => sum + entry.seconds, 0);
    if (needed > SHOT_DURATIONS[SHOT_DURATIONS.length - 1]) {
      throw new SequenceWriteError(`Clip ${index + 1} needs ${needed} s; a clip holds at most ${SHOT_DURATIONS[SHOT_DURATIONS.length - 1]} s. Split it into more clips.`);
    }
    const seconds = snapShotSeconds(needed);
    let cursor = 0;
    const segments: ClipSegment[] = clip.beats.map((entry, k) => {
      const start = cursor;
      const end = k === clip.beats.length - 1 ? seconds : Math.round((cursor + entry.seconds) * 10) / 10;
      cursor = end;
      return { panel: panelOf(entry.beat), beat: entry.beat, title: titleOf(entry.beat), start, end, neededSeconds: entry.seconds, dialogueWords: 0 };
    });
    const same = previous?.shots.find((shot) => {
      const beats = clipBeats(shot);
      return beats.length === clip.beats.length && beats.every((beat, k) => beat === clip.beats[k].beat);
    });
    return {
      shot: index + 1,
      beat: clip.beats.length === 1 ? clip.beats[0].beat : null,
      title: clip.title ?? clip.beats.map((entry) => titleOf(entry.beat)).join(' · '),
      seconds,
      neededSeconds: needed,
      dialogueWords: 0,
      prompt: clip.prompt.trim(),
      segments,
      videoUrl: same?.videoUrl ?? null,
      magnificId: same?.magnificId ?? null,
      ...(same?.takes?.length ? { takes: same.takes } : {}),
    };
  });

  await update(sceneId, { video_prompt: serializeShotPlan({ format: SHOT_PLAN_FORMAT, shots }) });
  // History keeps the first clip's prompt (what restore puts back); the others are in the plan.
  await recordPromptVersion(sceneId, 'clip_prompt', shots[0].prompt, author, clipPromptOf(scene.video_prompt));
  return shots.map((shot) => ({ clip: shot.shot, beats: clipBeats(shot), seconds: shot.seconds, keptTakes: shot.takes?.length ?? 0 }));
}
