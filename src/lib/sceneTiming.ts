// Episode timing: a timing agent estimates how long each beat needs on screen, and storyboard
// scenes are split by that time so each one runs 5 to 15 seconds of finished video.

import {
  BEAT_HEADER,
  SHOT_CAP_SECONDS,
  SHOT_DURATIONS,
  planShotTiming,
  sceneBeats,
  type ScriptBeat,
} from '@/lib/sceneShots';
import type { ScenePlan } from '@/lib/storyboardGeneration';

/** A storyboard scene runs between these lengths, as the sum of its beats' clips. */
export const SCENE_MIN_SECONDS = 5;
export const SCENE_MAX_SECONDS = 15;

export interface BeatTiming {
  beat: number;
  /** Clip length, one of SHOT_DURATIONS. */
  seconds: number;
  /** Seconds the dialogue needs at an unhurried pace, with its pauses; 0 for a silent beat. */
  speechSeconds: number;
  /** False when the agent gave no estimate and the length comes from the dialogue alone. */
  estimated: boolean;
}

export interface EpisodeTiming {
  timings: BeatTiming[];
  runtimeSeconds: number;
  /** Set when the timing agent could not be used; timings then come from the dialogue alone. */
  agentError?: string;
}

function speechSeconds(beat: ScriptBeat): number {
  const timing = planShotTiming({ dialogue: beat.dialogue, wpm: beat.wpm });
  return timing.dialogueWords ? timing.neededSeconds : 0;
}

export function buildBeatTimingPrompt(beats: ScriptBeat[]): string {
  const numbers = beats.map((beat, index) => beat.number ?? index + 1);
  const list = beats.map((beat, index) => {
    const speech = speechSeconds(beat);
    return [
      `Beat ${numbers[index]}${beat.title ? ` — ${beat.title}` : ''}`,
      beat.action && `Action: ${beat.action}`,
      beat.motion && `Motion: ${beat.motion}`,
      beat.camera && `Camera: ${beat.camera}`,
      beat.dialogue ? `Dialogue: ${beat.dialogue} (speech: ${speech} s)` : 'Dialogue: none',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return `You are the timing editor for a 3D animated children's series for ages 3 to 6. Each beat below becomes one short video clip. Estimate how many seconds each beat needs on screen so the finished episode feels calm and unhurried.

For every beat, judge:
- The action and motion: how long they take at a gentle pace a young child can follow. As a guide, a glance or small reaction takes 2 to 3 seconds, a gesture 3 to 4, a few steps or a short task 4 to 6, a longer movement up to 8.
- The camera move: a slow push-in, pan or crane needs time to read.
- The dialogue: a beat needs at least its "speech" seconds (words at about 2 per second, plus the written pauses). Action that happens during the speech adds no time; action before or after the line does.
- A moment to settle after a key line, a discovery or a strong reaction, when the beat has one.

Rules:
- Give each beat the time its own content needs. Do not pad beats to round numbers and do not make beats equal.
- Never give a beat less than its speech seconds.
- Action alone never needs more than ${SHOT_CAP_SECONDS} seconds.
- Use decimals where useful, for example 4.5.

BEATS:
"""
${list}
"""

Return ONLY valid JSON, one entry per beat in this order ${JSON.stringify(numbers)}:
{
  "beats": [
    { "beat_number": ${numbers[0] ?? 1}, "seconds": 5.5 }
  ]
}`;
}

/**
 * Clip lengths from the agent's estimate. A missing or invalid estimate falls back to the dialogue
 * timing for that beat. The estimate can lengthen a clip up to the 8-second cap; only dialogue can
 * take it past the cap, and nothing shortens a clip below what its dialogue needs.
 */
export function resolveBeatTimings(beats: ScriptBeat[], estimate: unknown): BeatTiming[] {
  const estimates = new Map<number, number>();
  const list = (estimate as { beats?: unknown } | null)?.beats;
  if (Array.isArray(list)) {
    for (const item of list) {
      const beat = Number(item?.beat_number);
      const seconds = Number(item?.seconds);
      if (Number.isSafeInteger(beat) && Number.isFinite(seconds) && seconds > 0) estimates.set(beat, seconds);
    }
  }
  return beats.map((beat, index) => {
    const number = beat.number ?? index + 1;
    const estimated = estimates.get(number);
    const timing = planShotTiming({
      dialogue: beat.dialogue,
      wpm: beat.wpm,
      seconds: estimated === undefined ? null : Math.min(estimated, SHOT_CAP_SECONDS),
    });
    return { beat: number, seconds: timing.seconds, speechSeconds: speechSeconds(beat), estimated: estimated !== undefined };
  });
}

export function runtimeSeconds(timings: Pick<BeatTiming, 'seconds'>[]): number {
  return timings.reduce((total, timing) => total + timing.seconds, 0);
}

/** "48 s", "2 min", "2 min 34 s". */
export function formatRuntime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (!minutes) return `${rest} s`;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

function secondsOf(beats: number[], timings: BeatTiming[]): number {
  const byBeat = new Map(timings.map((timing) => [timing.beat, timing.seconds]));
  return beats.reduce((total, beat) => total + (byBeat.get(beat) ?? 0), 0);
}

function beatRange(beats: number[]): string {
  return beats.length === 1 ? `beat ${beats[0]}` : `beats ${beats[0]}–${beats[beats.length - 1]}`;
}

/** Scenes longer than the maximum. A single beat cannot be split, so it may run longer. */
export function sceneLengthProblems(scenes: ScenePlan[], timings: BeatTiming[]): string[] {
  return scenes.flatMap((scene) => {
    const seconds = secondsOf(scene.beat_numbers, timings);
    return scene.beat_numbers.length > 1 && seconds > SCENE_MAX_SECONDS
      ? [`Scene ${scene.scene_number} (${beatRange(scene.beat_numbers)}) runs ${seconds} s, over the ${SCENE_MAX_SECONDS} s limit.`]
      : [];
  });
}

/** Every way to cut a run of beats into consecutive parts. A scene holds at most 4 beats, so at most 8 ways. */
function partitions(beats: number[]): number[][][] {
  if (beats.length <= 1) return [[beats]];
  return partitions(beats.slice(1)).flatMap((rest) => [
    [[beats[0], ...rest[0]], ...rest.slice(1)],
    [[beats[0]], ...rest],
  ]);
}

/**
 * Splits each scene over the maximum into the fewest consecutive parts that fit, preferring parts of
 * similar length. Scenes are then renumbered from 1.
 */
export function splitLongScenes(scenes: ScenePlan[], timings: BeatTiming[]): ScenePlan[] {
  return scenes.flatMap((scene) => {
    if (scene.beat_numbers.length < 2 || secondsOf(scene.beat_numbers, timings) <= SCENE_MAX_SECONDS) return [scene];
    const fits = partitions(scene.beat_numbers).filter((parts) =>
      parts.every((part) => part.length === 1 || secondsOf(part, timings) <= SCENE_MAX_SECONDS));
    const spread = (parts: number[][]) => {
      const lengths = parts.map((part) => secondsOf(part, timings));
      return Math.max(...lengths) - Math.min(...lengths);
    };
    const best = fits.sort((a, b) => a.length - b.length || spread(a) - spread(b))[0];
    return best.map((part, index) => ({
      ...scene,
      title: index === 0 ? scene.title : `${scene.title} (part ${index + 1})`,
      beat_numbers: part,
    }));
  }).map((scene, index) => ({ ...scene, scene_number: index + 1 }));
}

/**
 * A scene under the minimum (one short beat on its own, kept apart by a location change) has its
 * last beat lengthened to the next accepted clip length, never past the 8-second cap.
 */
export function lengthenShortScenes(scenes: ScenePlan[], timings: BeatTiming[]): BeatTiming[] {
  const result = timings.map((timing) => ({ ...timing }));
  for (const scene of scenes) {
    const last = result.find((timing) => timing.beat === scene.beat_numbers[scene.beat_numbers.length - 1]);
    while (last && secondsOf(scene.beat_numbers, result) < SCENE_MIN_SECONDS) {
      const next = SHOT_DURATIONS.find((duration) => duration > last.seconds);
      if (!next || next > SHOT_CAP_SECONDS) break;
      last.seconds = next;
    }
  }
  return result;
}

const DURATION_LINE = /^\s*(?:\*\*\[DURATION\]\*\*|\[DURATION\]|\*\*DURATION:?\*\*)/i;

/**
 * Writes each beat's planned clip length into the scene's beat text as a "[DURATION]" line, so the
 * video stage generates clips of the lengths the storyboard was split by.
 */
export function withBeatDurations(scriptBeats: string, beatNumbers: number[], timings: BeatTiming[]): string {
  const byBeat = new Map(timings.map((timing) => [timing.beat, timing.seconds]));
  const lines = (scriptBeats || '').replaceAll('\r\n', '\n').split('\n').filter((line) => !DURATION_LINE.test(line));
  const headers = lines.flatMap((line, index) => {
    const header = line.match(BEAT_HEADER);
    return header ? [{ index, beat: Number(header[1]) }] : [];
  });
  // A single beat saved without its "BEAT N" header is the scene's only beat.
  const blocks = headers.length ? headers : beatNumbers.length === 1 ? [{ index: 0, beat: beatNumbers[0] }] : [];
  for (let k = blocks.length - 1; k >= 0; k--) {
    const seconds = byBeat.get(blocks[k].beat);
    if (!seconds) continue;
    let end = k + 1 < blocks.length ? blocks[k + 1].index : lines.length;
    // Before the blank lines and "---" separator that close the beat.
    while (end > blocks[k].index + 1 && /^\s*(?:-{3,})?\s*$/.test(lines[end - 1])) end--;
    lines.splice(end, 0, `**[DURATION]** ${seconds} seconds`);
  }
  return lines.join('\n');
}

/** A saved scene's length: its beats' planned clips, or their dialogue timing for older scenes. */
export function sceneRuntime(scene: { script_beats?: string | null; beat_numbers?: number[] | string | null; description?: string | null }): number {
  const beatNumbers = Array.isArray(scene.beat_numbers) ? scene.beat_numbers : [];
  if (!scene.script_beats?.trim()) return 0;
  return sceneBeats({ scriptBeats: scene.script_beats, beatNumbers, description: scene.description || '' })
    .reduce((total, beat) => total + planShotTiming(beat).seconds, 0);
}
