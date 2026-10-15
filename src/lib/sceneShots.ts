// One beat = one storyboard panel = one shot. A scene is one video generation: its shots play in
// order inside a single clip, each timed by its beat's planned length. The plan (prompt, duration,
// generated clips) is stored as JSON in Scene.video_prompt so no schema change is needed.

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
  /** Clip length planned for this beat by the timing agent ([DURATION] line). */
  seconds: number | null;
}

export const BEAT_HEADER = /^\s*(?:#{1,6}\s*)?\**\s*BEAT\s*(\d+)\b(.*)$/;
const TAG_NAMES = 'EMOTION|WPM|TIMING|DURATION|ACTION|DIALOGUE|CAMERA|MOTION|SFX|END';
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
  return { number, title, setting: '', action: '', dialogue: '', camera: '', motion: '', wpm: null, seconds: null };
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
      if (name === 'duration') beat.seconds = Number(tag[4].match(/\d+(?:\.\d+)?/)?.[0]) || null;
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

/** The shortest accepted clip length that holds `needed` seconds. */
export function snapShotSeconds(needed: number): number {
  return SHOT_DURATIONS.find((duration) => duration >= needed) ?? SHOT_DURATIONS[SHOT_DURATIONS.length - 1];
}

/**
 * A beat's clip length. Dialogue sets the floor; a length planned by the timing agent ([DURATION])
 * can only lengthen the clip, never squeeze the speech. An unplanned silent beat gets 5 seconds.
 */
export function planShotTiming(beat: Pick<ScriptBeat, 'dialogue' | 'wpm'> & { seconds?: number | null }): ShotTiming {
  const dialogueWords = dialogueWordCount(beat.dialogue);
  const wordsPerSecond = Math.min(beat.wpm || DEFAULT_WPM, MAX_WPM) / 60;
  const speech = dialogueWords ? dialogueWords / wordsPerSecond + dialoguePauseSeconds(beat.dialogue) + 0.5 : 0;
  const planned = beat.seconds && beat.seconds > 0 ? beat.seconds : dialogueWords ? 0 : SILENT_SHOT_SECONDS;
  const needed = Math.max(speech, planned);
  const longest = SHOT_DURATIONS[SHOT_DURATIONS.length - 1];
  const seconds = snapShotSeconds(needed);
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
  /** `placement`: where each character is at the first frame, e.g. "Jaksh: left, foreground, kneeling, facing right". */
  shots: { beat_number: number | null; camera: string; action: string; placement?: string }[];
}

const PANEL_HEADER = /(?:^|\n)[ \t]*\**[ \t]*Panel[ \t]+(\d+)[ \t]*\**[ \t]*[:—–-]/gi;

/** Each "Panel N:" description of a storyboard prompt, up to the blank line that ends it. */
export function storyboardPanels(prompt: string): Map<number, string> {
  const text = (prompt || '').replaceAll('\r\n', '\n');
  const headers = Array.from(text.matchAll(PANEL_HEADER));
  const panels = new Map<number, string>();
  headers.forEach((header, index) => {
    const start = header.index! + header[0].length;
    const end = index + 1 < headers.length ? headers[index + 1].index! : text.length;
    const body = text.slice(start, end);
    const blank = body.search(/\n[ \t]*\n/);
    panels.set(Number(header[1]), (blank >= 0 ? body.slice(0, blank) : body).trim());
  });
  return panels;
}

/** The storyboard description of each beat's opening frame: its numbered panel, or an older single frame's shot line. */
function openingFrames(storyboardPrompt: string | null | undefined, beatCount: number): (string | null)[] {
  const panels = storyboardPanels(storyboardPrompt || '');
  if (panels.size) return Array.from({ length: beatCount }, (_, index) => panels.get(index + 1) ?? null);
  const shot = (storyboardPrompt || '').match(/^[ \t]*\**Shot\**[ \t]*:[ \t]*(.+)$/im)?.[1]?.trim() ?? null;
  return Array.from({ length: beatCount }, (_, index) => (index === 0 ? shot : null));
}

export interface ShotSceneContext {
  locationName: string;
  characterNames: string[];
  /** Objects (props) seen in the scene; each has a reference sheet attached to the clip request. */
  objectNames?: string[];
  scriptBeats: string;
  /** The scene's beat numbers, used to number a beat saved without its header. */
  beatNumbers?: number[];
  /** Used when the scene has no parseable beat script. */
  description: string;
  /** The storyboard image prompt; it tells a panel grid from an older single full frame. */
  storyboardPrompt?: string | null;
  /** Cast on screen in each beat, by beat number, from the character check. Each is named in that beat's action. */
  beatCast?: Record<number, string[]>;
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
  const objects = scene.objectNames?.length
    ? `\nObjects (exact names): ${scene.objectNames.map((name) => `"${name}"`).join(', ')}`
    : '';
  const onScreen = scene.beatCast
    ? beatList.flatMap((number) => {
      const names = scene.beatCast![number] || [];
      return names.length ? [`- Beat ${number}: ${names.map((name) => `"${name}"`).join(', ')}`] : [];
    })
    : [];
  const onScreenSection = onScreen.length
    ? `\n\nON SCREEN IN EACH BEAT (name every one of them in that beat's "action" and "placement", by exact name):\n${onScreen.join('\n')}`
    : '';
  // Each clip opens on its storyboard panel, so the characters start where the panel put them.
  const frames = openingFrames(scene.storyboardPrompt, beats.length);
  const frameLines = frames.flatMap((frame, index) => (frame ? [`- Beat ${beatList[index]}: ${frame}`] : []));
  const framesSection = frameLines.length
    ? `\n\nSTORYBOARD OPENING FRAMES (each clip starts on its beat's frame; copy where each character is):\n${frameLines.join('\n')}`
    : '';

  return `You are a film director preparing shot directions for a 3D animated children's series. Each beat below is ONE shot: one framing, one action, opening on its own storyboard panel. The scene's shots play in order inside a single video clip, cutting from one to the next.

For every beat write:

"camera" — shot size, angle, and exactly one camera move with a speed modifier, using ONLY this vocabulary:
- Shot size: wide shot, medium wide shot, medium shot, medium close-up, close-up, extreme close-up
- Angle: eye level, low angle, high angle, over-the-shoulder, POV, child-eye height
- Camera move: static (locked-off), push-in, pull-back, pan left, pan right, tilt up, tilt down, tracking shot, orbit, crane up, crane down
- Speed: slow, smooth, gentle, gradual. Never "fast" or "quick".
Format exactly like: "Medium shot, eye level, slow push-in." A static shot is written "Close-up, eye level, static (locked-off)."
One shot only: no "then", no cuts, no second framing. Keep the opening framing of the beat's own CAMERA line.
Consecutive beats must differ in shot size or camera move.

"action" — ONE sentence, at most 25 words, stating the single physical action visible in this shot in concrete physical verbs. Name characters and objects exactly as listed. Subject motion only: no camera words, no dialogue, no appearance description, no decorative adjectives.

"placement" — where every character in the shot is at its first frame, one entry per character separated by semicolons, in the form "Exact Name: left, center or right of frame, foreground, midground or background, pose, facing which way" (for example "Jaksh: left, foreground, kneeling, facing right; Tilli: right, midground, standing, facing Jaksh"). Copy positions from the beat's storyboard opening frame when it gives them. List every character the shot shows and no one else; keep a character on the same side of frame as in the beat before unless the action moves them. Write "none" when no character is in the shot.

Also write "lighting": one phrase of at most 14 words for the whole scene — time of day plus one specific light quality (for example "Warm late-afternoon light spilling through the doorway").

Do not write, change, or remove dialogue. It is inserted separately, word for word.

Location: ${scene.locationName || 'not specified'}
Characters (exact names): ${cast}${objects}${onScreenSection}${framesSection}

BEATS:
"""
${(scene.scriptBeats || scene.description || '').trim()}
"""

Return ONLY valid JSON, one "shots" entry per beat in this order ${JSON.stringify(beatList)}:
{
  "lighting": "...",
  "shots": [
    { "beat_number": ${beatList[0]}, "camera": "...", "action": "...", "placement": "..." }
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
        typeof shot.action !== 'string' || !shot.action.trim() ||
        (shot.placement !== undefined && typeof shot.placement !== 'string')) {
      throw new Error(`Shot direction for beat ${expected} is missing, out of order, or incomplete.`);
    }
  });
  return direction;
}

function sentence(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Whether a scene's storyboard image is a numbered panel grid. Every sheet planned now is a grid;
 * single-beat scenes planned earlier were one full frame, and their prompt says so.
 */
export function storyboardIsGrid(beatCount: number, storyboardPrompt?: string | null): boolean {
  const prompt = storyboardPrompt || '';
  if (/\b\d\s*x\s*\d\b|\bpanel grid\b|\bPanel 1\s*:/i.test(prompt)) return true;
  if (/\bsingle full-frame\b/i.test(prompt)) return false;
  return beatCount > 1;
}

/** One shot inside a scene's clip: a storyboard panel and the stretch of the clip it fills. */
export interface ClipShotInput {
  /** Storyboard panel the shot opens on. */
  panel: number;
  /** Seconds into the clip where the shot starts and ends. */
  start: number;
  end: number;
  camera: string;
  action: string;
  dialogue: string;
  dialogueWords: number;
  /** Where each character is at the shot's first frame; "none" or empty when no one is placed. */
  placement?: string;
}

function timestamp(seconds: number): string {
  return `0:${String(seconds).padStart(2, '0')}`;
}

function shotSpeech(dialogue: string, words: number): string {
  const spoken = dialogueForVideo(dialogue);
  if (!spoken) return 'No one speaks.';
  const pauses = spoken.includes('(pause)') ? 'with a clear pause at each (pause) and at punctuation' : 'with a clear pause at punctuation';
  return `${spoken} — ${words} word${words === 1 ? '' : 's'}, spoken slowly at about 2 words per second, ${pauses}.`;
}

function shotPlacement(placement: string | undefined): string {
  const text = (placement || '').replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '');
  return /^none$/i.test(text) ? '' : text;
}

/**
 * The prompt for a scene's single clip: a timestamped shot list, one shot per storyboard panel,
 * each with a job for every attached reference.
 */
export function buildShotPrompt(input: {
  /** False when the storyboard is a single full-frame image rather than a grid. */
  isGrid: boolean;
  seconds: number;
  lighting: string;
  shots: ClipShotInput[];
  characterNames: string[];
  /** Objects whose sheets are attached. */
  objectNames?: string[];
  locationName: string;
}): string {
  const hasCast = input.characterNames.length > 0;
  const objectNames = input.objectNames || [];
  const multiShot = input.shots.length > 1;
  const attachments = [
    input.isGrid ? 'storyboard grid' : 'storyboard frame',
    hasCast ? `character sheets (${input.characterNames.join(', ')})` : '',
    objectNames.length ? `object sheets (${objectNames.join(', ')})` : '',
    input.locationName ? `location sheet (${input.locationName})` : 'location sheet',
  ].filter(Boolean).join(', ');

  const opening = !input.isGrid
    ? 'Use the attached storyboard frame as the opening composition — match its framing and character positions exactly.'
    : multiShot
      ? 'Open each shot on its numbered panel in the attached storyboard grid — match that panel\'s framing and character positions exactly, filling the whole frame. Never show the grid, other panels, panel borders or panel numbers.'
      : `Use the panel numbered ${input.shots[0]?.panel ?? 1} in the attached storyboard grid as the opening composition — match its framing and character positions exactly, filling the whole frame. Never show the grid, other panels, panel borders or panel numbers.`;
  const roles = [
    opening,
    hasCast ? 'Use the character sheets for character appearance only.' : '',
    objectNames.length ? 'Use the object sheets for object appearance only.' : '',
    'Use the location sheet for the environment only.',
  ].filter(Boolean).join(' ');

  const cuts = multiShot
    ? `${input.shots.length} shots in one clip, cutting at each timestamp; same location and lighting throughout.`
    : 'One continuous shot, no cuts.';
  // Stated positions keep characters from drifting, morphing into each other or popping up elsewhere.
  const anyPlaced = input.shots.some((shot) => shotPlacement(shot.placement));
  const shotBlocks = input.shots.map((shot, index) => {
    const placement = shotPlacement(shot.placement);
    const panel = multiShot && input.isGrid ? `Panel ${shot.panel}. ` : '';
    return [
      `Shot ${index + 1} [${timestamp(shot.start)}–${timestamp(shot.end)}] — ${panel}${sentence(shot.camera)} ${sentence(shot.action)} ${shotSpeech(shot.dialogue, shot.dialogueWords)}`,
      placement ? `Positions at ${timestamp(shot.start)} — ${placement}.` : '',
    ].filter(Boolean).join('\n');
  });

  return [
    `Attachments: ${attachments}.`,
    roles,
    `3D animated video, Pixar/DreamWorks style, full color, ${input.seconds} seconds total, landscape 16:9. ${sentence(input.lighting)} ${cuts}`,
    ...shotBlocks,
    anyPlaced ? `Each character keeps one body with fixed proportions, stays in place unless the action moves them, and never appears, vanishes, duplicates or swaps places${multiShot ? ' within a shot' : ''}.` : '',
    `Consistent character design and lighting throughout, matching the attached sheets. No morphing, warping, or distorted geometry. Avoid jitter and bent limbs.${hasCast ? ' No extra characters.' : ''}`,
  ].filter(Boolean).join('\n\n');
}

/** Each "Shot N [..]" block of a clip prompt, in order. A prompt without shot headers is one block. */
export function clipPromptShots(prompt: string): string[] {
  const text = (prompt || '').replaceAll('\r\n', '\n');
  const starts = Array.from(text.matchAll(/^Shot \d+ \[/gm)).map((match) => match.index!);
  if (starts.length < 2) return [text];
  return starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length));
}

export const SHOT_PLAN_FORMAT = 'tillitown-shots-v1';

/** One generated clip for a shot. A shot can hold several; the shot's `videoUrl` names the one in use. */
export interface ShotTake {
  url: string;
  magnificId?: string | null;
  createdAt?: string | null;
}

/** A beat's stretch of a scene clip. */
export interface ClipSegment {
  /** Storyboard panel the shot opens on. */
  panel: number;
  beat: number | null;
  title: string;
  start: number;
  end: number;
  neededSeconds: number;
  dialogueWords: number;
}

/**
 * A planned clip. A scene planned now has one, holding every beat as a timed shot (`segments`);
 * scenes planned earlier have one clip per beat, numbered by panel.
 */
export interface SceneShot {
  /** 1-based clip number in the scene. */
  shot: number;
  /** The clip's only beat; null when it holds several. */
  beat: number | null;
  title: string;
  seconds: number;
  neededSeconds: number;
  dialogueWords: number;
  prompt: string;
  /** The beats inside the clip, in order. Missing on clips planned one per beat. */
  segments?: ClipSegment[];
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

/** The beats a planned clip covers, in order. */
export function clipBeats(shot: Pick<SceneShot, 'beat' | 'segments'>): (number | null)[] {
  return shot.segments?.length ? shot.segments.map((segment) => segment.beat) : [shot.beat];
}

/** Whether the plan is one clip holding exactly these beats, as planning makes it now. */
export function planMatchesBeats(plan: SceneShotPlan, beatNumbers: (number | null)[]): boolean {
  if (plan.shots.length !== 1) return false;
  const covered = clipBeats(plan.shots[0]);
  return covered.length === beatNumbers.length && covered.every((beat, index) => beat === beatNumbers[index]);
}

/**
 * Where each beat's shot starts and ends inside one clip. Each shot gets its beat's planned length;
 * the clip is the shortest accepted length that holds them all, and the last shot fills any slack.
 * Beats longer than the longest clip together are scaled down to fit it (`overMax`).
 */
export function planClipTiming(beats: ScriptBeat[]): {
  seconds: number;
  neededSeconds: number;
  overMax: boolean;
  shots: { start: number; end: number; timing: ShotTiming }[];
} {
  const timings = beats.map((beat) => planShotTiming(beat));
  const total = timings.reduce((sum, timing) => sum + timing.seconds, 0);
  const seconds = snapShotSeconds(total);
  const scale = total > seconds ? seconds / total : 1;
  let elapsed = 0;
  const shots = timings.map((timing, index) => {
    const start = Math.round(elapsed * scale);
    elapsed += timing.seconds;
    const end = index === timings.length - 1 ? seconds : Math.round(elapsed * scale);
    return { start, end, timing };
  });
  return {
    seconds,
    neededSeconds: Math.round(timings.reduce((sum, timing) => sum + timing.neededSeconds, 0) * 10) / 10,
    overMax: total > seconds,
    shots,
  };
}

/** One clip for the whole scene: every beat is a timed shot that opens on its storyboard panel. */
export function buildShotPlan(scene: ShotSceneContext, direction: ShotDirection, previous?: SceneShotPlan | null): SceneShotPlan {
  const beats = sceneBeats(scene);
  const clip = planClipTiming(beats);
  // A clip already generated for the same beats stays with the plan.
  const existing = previous && planMatchesBeats(previous, beats.map((beat) => beat.number)) ? previous.shots[0] : null;
  const segments = beats.map((beat, index): ClipSegment => ({
    panel: index + 1,
    beat: beat.number,
    title: beat.title,
    start: clip.shots[index].start,
    end: clip.shots[index].end,
    neededSeconds: clip.shots[index].timing.neededSeconds,
    dialogueWords: clip.shots[index].timing.dialogueWords,
  }));
  const shot: SceneShot = {
    shot: 1,
    beat: beats.length === 1 ? beats[0].number : null,
    title: beats.length === 1 ? beats[0].title : '',
    seconds: clip.seconds,
    neededSeconds: clip.neededSeconds,
    dialogueWords: segments.reduce((sum, segment) => sum + segment.dialogueWords, 0),
    prompt: buildShotPrompt({
      isGrid: storyboardIsGrid(beats.length, scene.storyboardPrompt),
      seconds: clip.seconds,
      lighting: direction.lighting,
      shots: beats.map((beat, index) => ({
        panel: index + 1,
        start: segments[index].start,
        end: segments[index].end,
        camera: direction.shots[index].camera,
        action: direction.shots[index].action,
        dialogue: beat.dialogue,
        dialogueWords: segments[index].dialogueWords,
        placement: direction.shots[index].placement,
      })),
      characterNames: scene.characterNames,
      objectNames: scene.objectNames,
      locationName: scene.locationName,
    }),
    segments,
    videoUrl: existing?.videoUrl ?? null,
    magnificId: existing?.magnificId ?? null,
    ...(existing?.takes?.length ? { takes: existing.takes } : {}),
  };
  return { format: SHOT_PLAN_FORMAT, shots: [shot] };
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
