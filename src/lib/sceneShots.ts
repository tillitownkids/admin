// One beat = one storyboard panel = one shot = one video generation.
// A scene's shots (prompt, duration, generated clip) are stored together as JSON
// in Scene.video_prompt so no schema change is needed.

export interface ScriptBeat {
  number: number | null;
  title: string;
  /** Location header, e.g. "EXT — VILLAGE SQUARE — LATE AFTERNOON — ..." */
  setting: string;
  action: string;
  /** Raw [DIALOGUE] text including pause tags. */
  dialogue: string;
  camera: string;
  motion: string;
  wpm: number | null;
}

const BEAT_HEADER = /^\s*(?:#{1,6}\s*)?\**\s*BEAT\s*(\d+)\b(.*)$/;
const TAG_NAMES = 'EMOTION|WPM|TIMING|ACTION|DIALOGUE|CAMERA|MOTION|SFX|END';
// Saved scripts use **[ACTION]**, [ACTION] and **ACTION:**. A bare "Dialogue: 3.3 seconds"
// (inside a timing block) is not a tag.
const TAG_LINE = new RegExp(`^\\s*(?:\\*\\*\\[(${TAG_NAMES})\\]\\*\\*|\\[(${TAG_NAMES})\\]|\\*\\*(${TAG_NAMES}):?\\*\\*)\\s*:?\\s*(.*)$`, 'i');
const PAUSE_TAG = /<-?\s*break\s*(?:time\s*=\s*["']?)?([\d.]+)\s*(?:seconds?|secs?|s)?["']?\s*\/?\s*-?>/gi;
const SETTING_LINE = /^\**\s*(EXT|INT)\b/i;
// Placeholders written for a silent beat: "None", "None.", "*None*", "[No dialogue]", "—".
function isNoDialogue(text: string): boolean {
  return /^(none|n\/a|no (spoken )?dialogue|silent|silence)?$/i.test(text.replace(/[*_()[\].—–-]/g, ' ').replace(/\s+/g, ' ').trim());
}

function emptyBeat(number: number | null, title: string): ScriptBeat {
  return { number, title, setting: '', action: '', dialogue: '', camera: '', motion: '', wpm: null };
}

export function parseScriptBeats(script: string): ScriptBeat[] {
  const beats: ScriptBeat[] = [];
  let beat: ScriptBeat | null = null;
  let field: 'action' | 'dialogue' | 'camera' | 'motion' | null = null;

  for (const line of (script || '').replaceAll('\r\n', '\n').split('\n')) {
    const header = line.match(BEAT_HEADER);
    if (header) {
      const title = header[2].replace(/\*/g, '').replace(/^\s*[—–:-]\s*/, '').trim();
      beat = emptyBeat(Number(header[1]), title);
      beats.push(beat);
      field = null;
      continue;
    }
    // Some single-beat scenes were saved without their "BEAT N" header line.
    if (!beat && (TAG_LINE.test(line) || SETTING_LINE.test(line.trim()))) {
      beat = emptyBeat(null, '');
      beats.push(beat);
    }
    if (!beat) continue;

    if (beat.wpm === null) {
      const wpm = line.match(/(\d{2,3})\s*WPM/i);
      if (wpm) beat.wpm = Number(wpm[1]);
    }
    if (/^\s*-{3,}\s*$/.test(line)) { field = null; continue; }

    const tag = line.match(TAG_LINE);
    if (tag) {
      const name = (tag[1] || tag[2] || tag[3]).toLowerCase();
      // "[WPM] 132" is also written without its unit.
      if (name === 'wpm' && beat.wpm === null) beat.wpm = Number(tag[4].match(/\d{2,3}/)?.[0]) || null;
      field = name === 'action' || name === 'dialogue' || name === 'camera' || name === 'motion' ? name : null;
      if (field) beat[field] = tag[4].trim();
      continue;
    }

    const text = line.trim();
    if (!text) continue;
    if (field) beat[field] = `${beat[field]} ${text}`.trim();
    else if (!beat.setting && SETTING_LINE.test(text)) beat.setting = text.replace(/\*/g, '').trim();
  }
  for (const parsed of beats) if (isNoDialogue(parsed.dialogue)) parsed.dialogue = '';
  return beats;
}

export function dialoguePauseSeconds(dialogue: string): number {
  let total = 0;
  for (const match of (dialogue || '').matchAll(PAUSE_TAG)) total += Number(match[1]) || 0;
  return total;
}

export function dialogueWordCount(dialogue: string): number {
  const text = (dialogue || '').replace(PAUSE_TAG, ' ');
  const quoted = text.match(/["“][^"”]*["”]/g);
  const spoken = quoted ? quoted.join(' ') : text.replace(/^[^:\n]{1,40}:\s*/, '');
  return spoken.replace(/[—–]/g, ' ').split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** Spoken lines as the video model should receive them: words untouched, pause tags as "(pause)". */
export function dialogueForVideo(dialogue: string): string {
  return (dialogue || '').replace(PAUSE_TAG, ' (pause) ').replace(/\s+/g, ' ').trim();
}

/** Clip lengths the video model accepts. */
export const SHOT_DURATIONS = [4, 5, 6, 8, 10, 12, 15];
/** Playbook cap: a shot that needs longer should be split in the script. */
export const SHOT_CAP_SECONDS = 8;
const SILENT_SHOT_SECONDS = 5;
const DEFAULT_WPM = 126;
// 2.2 words/sec. Faster stated rates are ignored: rushed speech is never used to fit a clip.
const MAX_WPM = 132;

export interface ShotTiming {
  dialogueWords: number;
  neededSeconds: number;
  seconds: number;
  /** Longer than the 8-second cap. */
  overCap: boolean;
  /** Does not fit even the longest clip; the beat must be split. */
  overMax: boolean;
}

export function planShotTiming(beat: Pick<ScriptBeat, 'dialogue' | 'wpm'>): ShotTiming {
  const dialogueWords = dialogueWordCount(beat.dialogue);
  if (!dialogueWords) {
    return { dialogueWords: 0, neededSeconds: SILENT_SHOT_SECONDS, seconds: SILENT_SHOT_SECONDS, overCap: false, overMax: false };
  }
  const wordsPerSecond = Math.min(beat.wpm || DEFAULT_WPM, MAX_WPM) / 60;
  const needed = dialogueWords / wordsPerSecond + dialoguePauseSeconds(beat.dialogue) + 0.5;
  const longest = SHOT_DURATIONS[SHOT_DURATIONS.length - 1];
  const seconds = SHOT_DURATIONS.find((duration) => duration >= needed) ?? longest;
  return {
    dialogueWords,
    neededSeconds: Math.round(needed * 10) / 10,
    seconds,
    overCap: seconds > SHOT_CAP_SECONDS,
    overMax: needed > longest,
  };
}

export interface ShotDirection {
  lighting: string;
  shots: { beat_number: number | null; camera: string; action: string }[];
}

export interface ShotSceneContext {
  locationName: string;
  characterNames: string[];
  scriptBeats: string;
  /** The scene's beat numbers, used to number a beat saved without its header. */
  beatNumbers?: number[];
  /** Used when the scene has no parseable beat script. */
  description: string;
}

/** Beats of a scene; a scene without a parseable beat script is treated as one shot. */
export function sceneBeats(scene: Pick<ShotSceneContext, 'scriptBeats' | 'beatNumbers' | 'description'>): ScriptBeat[] {
  const beats = parseScriptBeats(scene.scriptBeats);
  if (!beats.length) {
    const text = (scene.scriptBeats || scene.description || '').trim();
    beats.push({ ...emptyBeat(null, scene.description || 'Shot'), action: text });
  }
  if (scene.beatNumbers?.length === beats.length) {
    beats.forEach((beat, index) => { beat.number ??= scene.beatNumbers![index]; });
  }
  return beats;
}

export function buildShotDirectionPrompt(scene: ShotSceneContext): string {
  const beats = sceneBeats(scene);
  const beatList = beats.map((beat, index) => beat.number ?? index + 1);
  const cast = scene.characterNames.length
    ? scene.characterNames.map((name) => `"${name}"`).join(', ')
    : 'none';

  return `You are a film director preparing shot directions for a 3D animated children's series. Each beat below becomes ONE separate short video clip: one shot, one action.

For every beat write:

"camera" — shot size, angle, and exactly one camera move with a speed modifier, using ONLY this vocabulary:
- Shot size: wide shot, medium wide shot, medium shot, medium close-up, close-up, extreme close-up
- Angle: eye level, low angle, high angle, over-the-shoulder, POV, child-eye height
- Camera move: static (locked-off), push-in, pull-back, pan left, pan right, tilt up, tilt down, tracking shot, orbit, crane up, crane down
- Speed: slow, smooth, gentle, gradual. Never "fast" or "quick".
Format exactly like: "Medium shot, eye level, slow push-in." A static shot is written "Close-up, eye level, static (locked-off)."
One shot only: no "then", no cuts, no second framing. Keep the opening framing of the beat's own CAMERA line.
Consecutive beats must differ in shot size or camera move.

"action" — ONE sentence, at most 25 words, stating the single physical action visible in this shot in concrete physical verbs. Name characters exactly as listed. Subject motion only: no camera words, no dialogue, no appearance description, no decorative adjectives.

Also write "lighting": one phrase of at most 14 words for the whole scene — time of day plus one specific light quality (for example "Warm late-afternoon light spilling through the doorway").

Do not write, change, or remove dialogue. It is inserted separately, word for word.

Location: ${scene.locationName || 'not specified'}
Characters (exact names): ${cast}

BEATS:
"""
${(scene.scriptBeats || scene.description || '').trim()}
"""

Return ONLY valid JSON, one "shots" entry per beat in this order ${JSON.stringify(beatList)}:
{
  "lighting": "...",
  "shots": [
    { "beat_number": ${beatList[0]}, "camera": "...", "action": "..." }
  ]
}`;
}

export function validateShotDirection(value: unknown, beats: ScriptBeat[]): ShotDirection {
  const direction = value as ShotDirection | null;
  if (!direction || typeof direction.lighting !== 'string' || !direction.lighting.trim() ||
      !Array.isArray(direction.shots) || direction.shots.length !== beats.length) {
    throw new Error(`Shot directions must contain lighting and exactly ${beats.length} shot(s).`);
  }
  direction.shots.forEach((shot, index) => {
    const expected = beats[index].number ?? index + 1;
    if (!shot || Number(shot.beat_number) !== expected ||
        typeof shot.camera !== 'string' || !shot.camera.trim() ||
        typeof shot.action !== 'string' || !shot.action.trim()) {
      throw new Error(`Shot direction for beat ${expected} is missing, out of order, or incomplete.`);
    }
  });
  return direction;
}

function sentence(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function buildShotPrompt(input: {
  panel: number;
  /** False when the storyboard is a single full-frame image rather than a grid. */
  isGrid: boolean;
  seconds: number;
  lighting: string;
  camera: string;
  action: string;
  dialogue: string;
  dialogueWords: number;
  characterNames: string[];
  locationName: string;
}): string {
  const hasCast = input.characterNames.length > 0;
  const attachments = [
    input.isGrid ? 'storyboard grid' : 'storyboard frame',
    hasCast ? `character sheets (${input.characterNames.join(', ')})` : '',
    input.locationName ? `location sheet (${input.locationName})` : 'location sheet',
  ].filter(Boolean).join(', ');

  const opening = input.isGrid
    ? `Use the panel numbered ${input.panel} in the attached storyboard grid as the opening composition — match its framing and character positions exactly, filling the whole frame. Never show the grid, other panels, panel borders or panel numbers.`
    : 'Use the attached storyboard frame as the opening composition — match its framing and character positions exactly.';
  const roles = [
    opening,
    hasCast ? 'Use the character sheets for character appearance only.' : '',
    'Use the location sheet for the environment only.',
  ].filter(Boolean).join(' ');

  const spoken = dialogueForVideo(input.dialogue);
  const pauses = spoken.includes('(pause)') ? 'with a clear pause at each (pause) and at punctuation' : 'with a clear pause at punctuation';
  const speech = spoken
    ? `${spoken} — ${input.dialogueWords} word${input.dialogueWords === 1 ? '' : 's'}, spoken slowly at about 2 words per second, ${pauses}.`
    : 'No one speaks.';
  const end = `0:${String(input.seconds).padStart(2, '0')}`;

  return [
    `Attachments: ${attachments}.`,
    roles,
    `3D animated video, Pixar/DreamWorks style, full color, ${input.seconds} seconds total, landscape 16:9. ${sentence(input.lighting)} One continuous shot, no cuts.`,
    `Shot 1 [0:00–${end}] — ${sentence(input.camera)} ${sentence(input.action)} ${speech}`,
    `Consistent character design and lighting throughout, matching the attached sheets. No morphing, warping, or distorted geometry. Avoid jitter and bent limbs.${hasCast ? ' No extra characters.' : ''}`,
  ].join('\n\n');
}

export const SHOT_PLAN_FORMAT = 'tillitown-shots-v1';

/** One generated clip for a shot. A shot can hold several; the shot's `videoUrl` names the one in use. */
export interface ShotTake {
  url: string;
  magnificId?: string | null;
  createdAt?: string | null;
}

export interface SceneShot {
  /** 1-based position in the scene; also the storyboard panel number. */
  shot: number;
  beat: number | null;
  title: string;
  seconds: number;
  neededSeconds: number;
  dialogueWords: number;
  prompt: string;
  /** The clip in use: the one that is stitched into the episode. */
  videoUrl?: string | null;
  magnificId?: string | null;
  /** Every clip generated for this shot, oldest first. */
  takes?: ShotTake[];
}

export interface SceneShotPlan {
  format: typeof SHOT_PLAN_FORMAT;
  shots: SceneShot[];
}

/** Null for scenes that have no plan yet, including scenes holding an older plain-text video prompt. */
export function parseShotPlan(videoPrompt: string | null | undefined): SceneShotPlan | null {
  const text = (videoPrompt || '').trim();
  if (!text.startsWith('{')) return null;
  try {
    const plan = JSON.parse(text) as SceneShotPlan;
    return plan?.format === SHOT_PLAN_FORMAT && Array.isArray(plan.shots) ? plan : null;
  } catch {
    return null;
  }
}

export function serializeShotPlan(plan: SceneShotPlan): string {
  return JSON.stringify(plan);
}

/** Every clip generated for a shot, oldest first. A clip saved before takes were kept counts as its only take. */
export function shotTakes(shot: Pick<SceneShot, 'takes' | 'videoUrl' | 'magnificId'>): ShotTake[] {
  const takes = Array.isArray(shot.takes) ? shot.takes.filter((take) => Boolean(take?.url)) : [];
  if (shot.videoUrl && !takes.some((take) => take.url === shot.videoUrl)) {
    return [{ url: shot.videoUrl, magnificId: shot.magnificId ?? null, createdAt: null }, ...takes];
  }
  return takes;
}

/** Adds a clip to a shot. It becomes the clip in use only when the shot has none, so an earlier choice is never replaced. */
export function addShotTake(shot: SceneShot, take: ShotTake): SceneShot {
  const takes = [...shotTakes(shot).filter((item) => item.url !== take.url), take];
  if (shot.videoUrl) return { ...shot, takes };
  return { ...shot, takes, videoUrl: take.url, magnificId: take.magnificId ?? null };
}

/** Puts one of the shot's takes in use. Null when the URL is not one of its takes. */
export function selectShotTake(shot: SceneShot, url: string): SceneShot | null {
  const takes = shotTakes(shot);
  const take = takes.find((item) => item.url === url);
  if (!take) return null;
  return { ...shot, takes, videoUrl: take.url, magnificId: take.magnificId ?? null };
}

/** Removes a take that is not in use. Null when the URL is the clip in use or not one of the shot's takes. */
export function removeShotTake(shot: SceneShot, url: string): SceneShot | null {
  const takes = shotTakes(shot);
  if (url === shot.videoUrl || !takes.some((item) => item.url === url)) return null;
  return { ...shot, takes: takes.filter((item) => item.url !== url) };
}

export function buildShotPlan(scene: ShotSceneContext, direction: ShotDirection, previous?: SceneShotPlan | null): SceneShotPlan {
  const beats = sceneBeats(scene);
  const shots = beats.map((beat, index): SceneShot => {
    const timing = planShotTiming(beat);
    // Clips already generated for the same beat stay with it.
    const existing = previous?.shots.find((shot) => shot.shot === index + 1 && shot.beat === beat.number);
    return {
      shot: index + 1,
      beat: beat.number,
      title: beat.title,
      seconds: timing.seconds,
      neededSeconds: timing.neededSeconds,
      dialogueWords: timing.dialogueWords,
      prompt: buildShotPrompt({
        panel: index + 1,
        isGrid: beats.length > 1,
        seconds: timing.seconds,
        lighting: direction.lighting,
        camera: direction.shots[index].camera,
        action: direction.shots[index].action,
        dialogue: beat.dialogue,
        dialogueWords: timing.dialogueWords,
        characterNames: scene.characterNames,
        locationName: scene.locationName,
      }),
      videoUrl: existing?.videoUrl ?? null,
      magnificId: existing?.magnificId ?? null,
      ...(existing?.takes?.length ? { takes: existing.takes } : {}),
    };
  });
  return { format: SHOT_PLAN_FORMAT, shots };
}

/**
 * A scene's clips in playback order: its generated shot clips, or the single clip of an older scene
 * (shot: null). `missingShots` counts planned shots that have no clip yet.
 */
export function sceneClips(scene: { video_prompt?: string | null; video_url?: string | null }): {
  clips: { url: string; shot: number | null }[];
  missingShots: number;
} {
  const shots = parseShotPlan(scene.video_prompt)?.shots || [];
  const clips = shots.flatMap((shot) => (shot.videoUrl ? [{ url: shot.videoUrl, shot: shot.shot }] : []));
  if (clips.length) return { clips, missingShots: shots.length - clips.length };
  return { clips: scene.video_url ? [{ url: scene.video_url, shot: null }] : [], missingShots: 0 };
}
