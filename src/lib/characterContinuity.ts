// The character check: an agent reads the episode's beats in order, tracks who is present in each
// place, and decides who each shot actually shows. Each of them must then be attached to the scene
// (their reference sheet goes with the storyboard and video requests), named in the storyboard panel
// and the video shot of that beat, and placed there: a stated position on screen keeps a character
// from drifting, morphing or turning up somewhere odd. Nobody else is added: a close-up shows one face.

import { normalizeCharacterName } from '@/lib/characterNames';
import { parseShotPlan, sceneBeats, storyboardPanels } from '@/lib/sceneShots';

export { storyboardPanels };

/** Check, fix and check again at most this many times per scene. */
export const CHARACTER_FIX_ROUNDS = 3;
/** Beats the agent decides in one call; earlier beats are sent along as context. */
export const CAST_CHECK_BEATS_PER_CALL = 8;

export interface CastMember {
  name: string;
  description?: string | null;
}

export interface BeatCast {
  beat: number;
  /** Cast members the shot shows, by their exact cast names. */
  onScreen: string[];
  /** Characters the shot shows who are not in the episode cast, so nothing can be attached. */
  notInCast: string[];
  /** Cast members in the place at this beat, shown or not. Used to settle borderline calls. */
  present?: string[];
}

interface PanelProblem {
  panel: number;
  beat: number;
  /** Not named in the panel. */
  missing: string[];
  /** Named, but with no place in frame. */
  unplaced: string[];
}

interface ShotProblem {
  shot: number;
  beat: number;
  missing: string[];
  unplaced: string[];
}

/** Where a cast member is at a point in the episode, carried from one batch of beats to the next. */
export interface Whereabouts {
  name: string;
  /** The place and position, e.g. "Desert Oasis Campsite, seated by the fire". */
  place: string;
}

export interface SceneCharacterIssues {
  /** On screen in the script but not attached to the scene. */
  missingLinks: string[];
  /** Attached to the scene but on screen in none of its beats. */
  extraLinks: string[];
  /** On screen but not in the episode cast. */
  notInCast: string[];
  /** Attached but left out of the storyboard prompt's Characters line. */
  storyboardLine: string[];
  /** Panels that leave out, or do not place, a character the beat shows. */
  storyboardPanels: PanelProblem[];
  /** Panels, spare ones included, that call a cast member only by a short name ("Kartik"). Needs the cast. */
  storyboardShortNames: { panel: number; names: string[] }[];
  /** Attached but left out of a shot's attachment list. */
  videoAttachments: string[];
  /** Shots that leave out, or do not place, a character the beat shows. */
  videoShots: ShotProblem[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namePattern(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  return `(?<![\\p{L}\\p{N}])${words.join('\\s+')}(?![\\p{L}\\p{N}])`;
}

/** Whether the text names the character: the whole name, any case, not inside a longer word. */
export function mentionsName(text: string, name: string): boolean {
  if (!name.trim()) return false;
  return new RegExp(namePattern(name), 'iu').test(text || '');
}

const SIDE_OF_FRAME = /\b(left|right|cent(?:er|re)|middle)\b/i;

/**
 * Whether a storyboard panel places the character: their name followed by a bracket that says which
 * side of frame they are on, as in "Jaksh (left, foreground, kneeling, facing right)".
 */
export function placesInPanel(text: string, name: string): boolean {
  const placed = new RegExp(`${namePattern(name)}\\s*\\(([^)]*)\\)`, 'giu');
  return Array.from((text || '').matchAll(placed)).some((match) => SIDE_OF_FRAME.test(match[1]));
}

/** Whether a video shot's "Positions at 0:00" line places the character. */
export function placesInShot(prompt: string, name: string): boolean {
  const line = (prompt || '').match(/^Positions at 0:00 — (.*)$/m)?.[1] ?? '';
  const entry = line.split(';').find((part) => mentionsName(part, name));
  return Boolean(entry && SIDE_OF_FRAME.test(entry));
}

/**
 * Every name a cast member goes by, mapped to their exact cast name: the full name and each part of
 * a name like "Jaksh's Father - Kartik" ("Jaksh's Father", "Kartik"). A part shared by two members,
 * or equal to another member's full name, is left out.
 */
export function castAliases(cast: CastMember[]): Map<string, string> {
  const full = new Map(cast.map((member) => [normalizeCharacterName(member.name), member.name]));
  const parts = new Map<string, Set<string>>();
  for (const member of cast) {
    for (const part of member.name.split(/\s+[-–—]\s+/)) {
      const key = normalizeCharacterName(part);
      if (!key || full.has(key)) continue;
      parts.set(key, (parts.get(key) || new Set<string>()).add(member.name));
    }
  }
  const aliases = new Map(full);
  for (const [key, owners] of parts) if (owners.size === 1) aliases.set(key, [...owners][0]);
  return aliases;
}

export function buildCastCheckPrompt(input: {
  cast: CastMember[];
  /** The beats to decide. */
  scriptBeats: string;
  beatNumbers: number[];
  /** The beats just before, so the agent knows who is already in the place. Context only. */
  earlierBeats?: string;
  /** Who was where at the end of the beats already read, however long ago they were last mentioned. */
  whereabouts?: Whereabouts[];
}): string {
  const aliases = castAliases(input.cast);
  const cast = input.cast.length
    ? input.cast.map((member) => {
      const about = (member.description || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      const called = member.name.split(/\s+[-–—]\s+/)
        .filter((part) => normalizeCharacterName(part) !== normalizeCharacterName(member.name) &&
          aliases.get(normalizeCharacterName(part)) === member.name);
      return `- "${member.name}"${called.length ? ` (also called ${called.map((name) => `"${name}"`).join(', ')})` : ''}${about ? `: ${about}` : ''}`;
    }).join('\n')
    : 'None.';
  const earlier = input.earlierBeats?.trim()
    ? `EARLIER BEATS (context only, to know who is already present; do not answer for them):
"""
${input.earlierBeats.trim()}
"""

`
    : '';

  const known = input.whereabouts?.length
    ? `WHO IS WHERE before these beats (kept from earlier in the episode, even for characters not mentioned in a long time):
${input.whereabouts.map((entry) => `- "${entry.name}": ${entry.place}`).join('\n')}

`
    : '';

  return `You are the continuity supervisor for a 3D animated children's series. Each beat below is one camera shot. For every beat, decide which characters that shot shows, so exactly those characters' reference sheets are attached to its storyboard panel and video clip.

EPISODE CAST (exact names):
${cast}

HOW TO DECIDE:
1. Track who is present. Follow the beats in order: a character is present in a place from the moment they are there until the script moves them away. Characters stay present across beats even when a beat's ACTION does not name them again.${known ? ' Start from WHO IS WHERE: a character listed there is still in that place until the script moves them.' : ''}${earlier ? ' Use the EARLIER BEATS to know who is already there.' : ''}
2. Decide who the shot shows, from the ACTION, DIALOGUE and CAMERA lines:
   - The character who acts, and anyone who speaks on camera.
   - The characters they speak to, look at, touch, hand something to or react with, when those characters are present.
   - A character the ACTION says arrives, enters, returns, or is looked at, gasped at or reacted to: the shot shows them, unless the CAMERA line names only someone else ("push-in on Sonal's face").
   - Characters travelling together in a vehicle (a family in a jeep or car) are all shown whenever the vehicle is in frame and anyone in it acts or speaks, wide shots included.
   - Characters behind a wall, in another room or far off and alone in a landscape shot are shown only when the CAMERA framing can see them.
   - Everyone present for a group moment ("the family gathers", "they all", "the children") and in wide or medium wide shots of the group.
   - In a close-up, extreme close-up, POV or insert, only the character or object the camera isolates.
3. Leave out characters who are somewhere else, have left, are only mentioned or remembered, or are heard off-screen (O.S. or V.O.). Never add a cast member only because they are in the episode: keep each list as small as the shot allows.
4. Match short names, nicknames, roles, relations and pronouns ("Kartik", "Papa", "his mother", "she", "the children") to the cast member they mean, and answer with that member's exact name, character for character.
5. A visible character who is not in the cast goes in "not_in_cast" by the name the script uses. Crowds, unnamed extras, animals and objects are left out.

${known}${earlier}BEATS TO DECIDE:
"""
${(input.scriptBeats || '').trim()}
"""

Return ONLY valid JSON, one entry per beat in this order ${JSON.stringify(input.beatNumbers)}:
{
  "beats": [
    { "beat_number": ${input.beatNumbers[0] ?? 1}, "present": ["Exact Cast Name"], "on_screen": ["Exact Cast Name"], "not_in_cast": [], "why": "a few words" }
  ],
  "where_after": [
    { "name": "Exact Cast Name", "place": "where they are after the last beat, in a few words" }
  ]
}

In "where_after", list every cast member whose place is known after the last beat, including those kept from WHO IS WHERE and not mentioned since. Leave out anyone whose place is unknown.`;
}

/** The agent's "where_after", by exact cast name. Unknown names and empty places are dropped. */
export function parseWhereabouts(value: unknown, cast: CastMember[]): Whereabouts[] {
  const entries = (value as { where_after?: unknown } | null)?.where_after;
  if (!Array.isArray(entries)) return [];
  const aliases = castAliases(cast);
  const result: Whereabouts[] = [];
  for (const entry of entries as { name?: unknown; place?: unknown }[]) {
    if (typeof entry?.name !== 'string' || typeof entry.place !== 'string') continue;
    const name = aliases.get(normalizeCharacterName(entry.name));
    const place = entry.place.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (name && place && !result.some((item) => item.name === name)) result.push({ name, place });
  }
  return result;
}

/**
 * The record carried to the next batch: the newer reads first, then anyone only the older record
 * knew about. Presence is context, not a decision to show someone, so nobody known is dropped.
 */
export function mergeWhereabouts(...records: Whereabouts[][]): Whereabouts[] {
  const result: Whereabouts[] = [];
  for (const record of records) {
    for (const entry of record) if (!result.some((item) => item.name === entry.name)) result.push(entry);
  }
  return result;
}

/**
 * The agent's answer, with every name mapped to its exact cast name (short names included). Names
 * that match no cast member are returned in `unknown` so the agent can be asked again; they are
 * never attached.
 */
export function parseBeatCast(value: unknown, cast: CastMember[], beatNumbers: number[]): { beats: BeatCast[]; unknown: string[] } {
  const answer = value as { beats?: { beat_number?: unknown; on_screen?: unknown; not_in_cast?: unknown; present?: unknown }[] } | null;
  if (!answer || !Array.isArray(answer.beats) || answer.beats.length !== beatNumbers.length) {
    throw new Error(`The character check must answer for exactly ${beatNumbers.length} beat(s).`);
  }
  const aliases = castAliases(cast);
  const unknown = new Set<string>();
  const names = (list: unknown) => (Array.isArray(list) ? list : [])
    .filter((name): name is string => typeof name === 'string' && Boolean(name.trim()));

  const beats = answer.beats.map((entry, index): BeatCast => {
    if (Number(entry?.beat_number) !== beatNumbers[index]) {
      throw new Error(`The character check answered out of order near beat ${beatNumbers[index]}.`);
    }
    const onScreen: string[] = [];
    const add = (exact: string) => { if (!onScreen.includes(exact)) onScreen.push(exact); };
    for (const name of names(entry.on_screen)) {
      const exact = aliases.get(normalizeCharacterName(name));
      if (exact) add(exact);
      else unknown.add(name.trim());
    }
    // A cast member listed outside the cast under a short name ("Sonal") is still that cast member.
    const notInCast: string[] = [];
    for (const name of names(entry.not_in_cast)) {
      const exact = aliases.get(normalizeCharacterName(name));
      if (exact) add(exact);
      else if (!notInCast.includes(name.trim())) notInCast.push(name.trim());
    }
    const present = Array.from(new Set(names(entry.present)
      .flatMap((name) => { const exact = aliases.get(normalizeCharacterName(name)); return exact ? [exact] : []; })));
    for (const name of onScreen) if (!present.includes(name)) present.push(name);
    return { beat: beatNumbers[index], onScreen, notInCast, present };
  });
  return { beats, unknown: Array.from(unknown) };
}

/**
 * Two independent reads combined: a character counts as on screen only when both reads say so. The
 * check adds characters to scenes and prompts, so a borderline call from one read never forces
 * someone into a shot.
 */
export function agreedBeatCast(first: BeatCast[], second: BeatCast[]): BeatCast[] {
  return first.map((beat, index) => {
    const other = second[index];
    if (!other || other.beat !== beat.beat) return { ...beat, onScreen: [], notInCast: [], present: [] };
    const has = (list: string[] | undefined, name: string) => (list || []).some((item) => normalizeCharacterName(item) === normalizeCharacterName(name));
    // Shown when both reads show them, or when one shows them and both agree they are in the place:
    // the reads then differ only on framing, and leaving a present character out is the worse mistake.
    const present = (beat.present || beat.onScreen).filter((name) => has(other.present || other.onScreen, name));
    const candidates = [...beat.onScreen, ...other.onScreen.filter((name) => !has(beat.onScreen, name))];
    const onScreen = candidates.filter((name) => (has(beat.onScreen, name) && has(other.onScreen, name)) || has(present, name));
    return { beat: beat.beat, onScreen, notInCast: beat.notInCast.filter((name) => has(other.notInCast, name)), present };
  });
}

const OFF_SCREEN = /\(\s*(?:O\.?\s*S\.?|V\.?\s*O\.?|off[- ]?screen)\s*\)/i;

/**
 * Cast members who speak in a beat's dialogue ("Tilli: "Oasis!""), unless their line is marked
 * off-screen with (O.S.) or (V.O.). A character who speaks is in the shot.
 */
export function dialogueSpeakers(dialogue: string, cast: CastMember[]): string[] {
  const aliases = castAliases(cast);
  const speakers: string[] = [];
  const label = /(?:^|["”>)\]\s])([\p{L}][\p{L}\p{N}' .\-–—]{0,48}?)\s*(\([^)]*\))?\s*:\s*(?=["“])/gu;
  for (const match of (dialogue || '').matchAll(label)) {
    if (match[2] && OFF_SCREEN.test(match[2])) continue;
    const exact = aliases.get(normalizeCharacterName(match[1]));
    if (exact && !speakers.includes(exact)) speakers.push(exact);
  }
  return speakers;
}

/** Adds each beat's on-screen speakers to who the beat shows. Beats are matched to the scene's beat script in order. */
export function withSpeakers(beats: BeatCast[], scene: { scriptBeats: string; beatNumbers?: number[]; description: string }, cast: CastMember[]): BeatCast[] {
  const scripted = sceneBeats(scene);
  return beats.map((beat, index) => {
    const source = scripted.find((item) => item.number === beat.beat) ?? scripted[index];
    const speakers = source ? dialogueSpeakers(source.dialogue, cast) : [];
    const added = speakers.filter((name) => !beat.onScreen.includes(name));
    if (!added.length) return beat;
    return { ...beat, onScreen: [...beat.onScreen, ...added], present: Array.from(new Set([...(beat.present || []), ...added])) };
  });
}

/**
 * Cast members a text names, by exact name: full names first, then short names ("Kartik"), so
 * "Jaksh's Father - Kartik" does not also count as "Jaksh".
 */
export function castNamedIn(text: string, cast: CastMember[]): string[] {
  const aliases = Array.from(castAliases(cast)).sort((a, b) => b[0].length - a[0].length);
  let rest = text || '';
  const named: string[] = [];
  for (const [alias, exact] of aliases) {
    const pattern = new RegExp(namePattern(alias), 'giu');
    if (!pattern.test(rest)) continue;
    if (!named.includes(exact)) named.push(exact);
    rest = rest.replace(pattern, ' ');
  }
  return named;
}

/**
 * Splits an episode's scenes, in order, into groups of whole scenes of at most
 * `CAST_CHECK_BEATS_PER_CALL` beats (a longer scene stands alone). Each group carries the scenes just
 * before it, about `contextBeats` beats, so the agent knows who is already present.
 */
export function castCheckChunks<T extends { beatNumbers: number[] }>(scenes: T[], contextBeats = 6): { scenes: T[]; earlier: T[] }[] {
  const groups: T[][] = [];
  let count = 0;
  for (const scene of scenes) {
    const current = groups[groups.length - 1];
    if (!current || count + scene.beatNumbers.length > CAST_CHECK_BEATS_PER_CALL) {
      groups.push([scene]);
      count = scene.beatNumbers.length;
    } else {
      current.push(scene);
      count += scene.beatNumbers.length;
    }
  }
  let start = 0;
  return groups.map((group) => {
    const earlier: T[] = [];
    let beats = 0;
    for (let i = start - 1; i >= 0 && beats < contextBeats; i--) {
      earlier.unshift(scenes[i]);
      beats += scenes[i].beatNumbers.length;
    }
    start += group.length;
    return { scenes: group, earlier };
  });
}

const CHARACTERS_LINE = /^[ \t]*\**Characters\**[ \t]*:[ \t]*(.*)$/im;

/** The prompt's Characters line, null when it has none. */
export function charactersLine(prompt: string): string | null {
  return (prompt || '').match(CHARACTERS_LINE)?.[1] ?? null;
}

function withoutLine(text: string, line: RegExp): string {
  return (text || '').replace(line, '');
}

export function findCharacterIssues(input: {
  beats: BeatCast[];
  /** Characters attached to the scene. */
  linked: string[];
  storyboardPrompt: string;
  videoPrompt?: string | null;
  /** The episode cast. When given, a cast member the storyboard panels draw must also be attached. */
  cast?: CastMember[];
}): SceneCharacterIssues {
  const isLinked = (name: string) => input.linked.some((linked) => normalizeCharacterName(linked) === normalizeCharacterName(name));
  // The image model draws everyone a panel names; without their sheet it invents their looks.
  const drawnPanels = storyboardPanels(input.storyboardPrompt || '');
  const drawnText = drawnPanels.size
    ? Array.from(drawnPanels.values()).join('\n')
    : withoutLine(input.storyboardPrompt || '', CHARACTERS_LINE);
  const drawn = input.cast ? castNamedIn(drawnText, input.cast) : [];
  const onScreen = Array.from(new Set([...input.beats.flatMap((beat) => beat.onScreen), ...drawn]));
  const shown = new Set(onScreen.map(normalizeCharacterName));

  const missingLinks = onScreen.filter((name) => !isLinked(name));
  const extraLinks = input.linked.filter((name) => !shown.has(normalizeCharacterName(name)));
  const notInCast = Array.from(new Set(input.beats.flatMap((beat) => beat.notInCast)));
  // Everyone who should be in the images: the attached characters plus those the script shows.
  const expected = [...input.linked, ...missingLinks];

  const prompt = input.storyboardPrompt || '';
  const line = charactersLine(prompt);
  const storyboardLine = prompt.trim() ? expected.filter((name) => line === null || !mentionsName(line, name)) : [];

  // Panel N shows the scene's Nth beat. A prompt without numbered panels (an older single frame)
  // is checked as a whole.
  const panels = storyboardPanels(prompt);
  const promptBody = withoutLine(prompt, CHARACTERS_LINE);
  const panelProblems: PanelProblem[] = prompt.trim()
    ? input.beats.flatMap((beat, index) => {
      const text = panels.size ? panels.get(index + 1) ?? '' : promptBody;
      const missing = beat.onScreen.filter((name) => !mentionsName(text, name));
      const unplaced = beat.onScreen.filter((name) => mentionsName(text, name) && !placesInPanel(text, name));
      return missing.length || unplaced.length ? [{ panel: index + 1, beat: beat.beat, missing, unplaced }] : [];
    })
    : [];

  // Reference sheets are matched by exact name, so every panel, spare ones too, uses it.
  const shortNamed = (text: string) => (input.cast ? castNamedIn(text, input.cast) : []).filter((name) => !mentionsName(text, name));
  const storyboardShortNames = !prompt.trim() || !input.cast
    ? []
    : panels.size
      ? Array.from(panels).flatMap(([panel, text]) => {
        const names = shortNamed(text);
        return names.length ? [{ panel, names }] : [];
      })
      : (() => {
        const names = shortNamed(promptBody);
        return names.length ? [{ panel: 1, names }] : [];
      })();

  const plan = parseShotPlan(input.videoPrompt);
  const videoAttachments = new Set<string>();
  const videoShots: ShotProblem[] = [];
  for (const shot of plan?.shots || []) {
    const attachments = shot.prompt.match(/^Attachments:.*$/m)?.[0] ?? '';
    for (const name of expected) if (!mentionsName(attachments, name)) videoAttachments.add(name);
    const beat = input.beats.find((item) => item.beat === shot.beat);
    const body = withoutLine(shot.prompt, /^Attachments:.*$/m);
    const missing = (beat?.onScreen || []).filter((name) => !mentionsName(body, name));
    const unplaced = (beat?.onScreen || []).filter((name) => mentionsName(body, name) && !placesInShot(shot.prompt, name));
    if (missing.length || unplaced.length) videoShots.push({ shot: shot.shot, beat: shot.beat ?? shot.shot, missing, unplaced });
  }

  return {
    missingLinks,
    extraLinks,
    notInCast,
    storyboardLine,
    storyboardPanels: panelProblems,
    storyboardShortNames,
    videoAttachments: Array.from(videoAttachments),
    videoShots,
  };
}

const problemCount = (items: { missing: string[]; unplaced: string[] }[]) =>
  items.reduce((total, item) => total + item.missing.length + item.unplaced.length, 0);

/** Problems the check can fix itself. Extra links and characters outside the cast need a person. */
export function fixableIssueCount(issues: SceneCharacterIssues): number {
  return issues.missingLinks.length + issues.storyboardLine.length + problemCount(issues.storyboardPanels) +
    issues.storyboardShortNames.reduce((total, panel) => total + panel.names.length, 0) +
    issues.videoAttachments.length + problemCount(issues.videoShots);
}

export function storyboardNeedsFix(issues: SceneCharacterIssues): boolean {
  return issues.storyboardLine.length > 0 || issues.storyboardPanels.length > 0 || issues.storyboardShortNames.length > 0;
}

export function videoNeedsFix(issues: SceneCharacterIssues): boolean {
  return issues.videoAttachments.length > 0 || issues.videoShots.length > 0;
}

function list(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
}

function problemSentence(where: string, problem: { missing: string[]; unplaced: string[] }): string {
  const parts = [
    problem.missing.length ? `does not name ${list(problem.missing)}` : '',
    problem.unplaced.length ? `does not say where ${list(problem.unplaced)} ${problem.unplaced.length === 1 ? 'is' : 'are'} in frame` : '',
  ].filter(Boolean);
  return `${where} ${parts.join(' and ')}.`;
}

/** One plain sentence per problem, for the report. */
export function describeIssues(issues: SceneCharacterIssues): string[] {
  return [
    ...(issues.missingLinks.length ? [`${list(issues.missingLinks)} ${issues.missingLinks.length === 1 ? 'is' : 'are'} in the script but not attached to the scene.`] : []),
    ...(issues.storyboardLine.length ? [`The storyboard prompt's Characters line leaves out ${list(issues.storyboardLine)}.`] : []),
    ...issues.storyboardPanels.map((panel) => problemSentence(`Storyboard panel ${panel.panel} (beat ${panel.beat})`, panel)),
    ...issues.storyboardShortNames.map((panel) => `Storyboard panel ${panel.panel} calls ${list(panel.names)} by a short name.`),
    ...(issues.videoAttachments.length ? [`The video prompts do not attach the sheet of ${list(issues.videoAttachments)}.`] : []),
    ...issues.videoShots.map((shot) => problemSentence(`Video shot ${shot.shot} (beat ${shot.beat})`, shot)),
  ];
}

/** Problems that need a person: the check never removes links or adds characters to the cast. */
export function describeWarnings(issues: SceneCharacterIssues): string[] {
  return [
    ...(issues.extraLinks.length ? [`${list(issues.extraLinks)} ${issues.extraLinks.length === 1 ? 'is' : 'are'} attached but on screen in none of the scene's beats. Remove ${issues.extraLinks.length === 1 ? 'it' : 'them'} if that is right.`] : []),
    ...(issues.notInCast.length ? [`${list(issues.notInCast)} ${issues.notInCast.length === 1 ? 'is' : 'are'} on screen but not in the episode cast, so no sheet can be attached. Add ${issues.notInCast.length === 1 ? 'the character' : 'them'} to the episode's characters.`] : []),
  ];
}

/**
 * Writes the exact cast name where a panel that should show a character calls them by a short name
 * ("Sonal" for "Jaksh's Mother - Sonal"). Reference sheets are matched by exact name.
 */
export function withExactNames(prompt: string, beats: BeatCast[], cast: CastMember[]): string {
  const aliases = castAliases(cast);
  const shortNames = (name: string) => Array.from(aliases)
    .filter(([key, exact]) => exact === name && key !== normalizeCharacterName(name))
    .map(([key]) => key);
  const fix = (text: string, names: string[]) => names.reduce((out, name) => (mentionsName(out, name)
    ? out
    : shortNames(name).reduce((current, alias) => current.replace(new RegExp(namePattern(alias), 'giu'), name), out)), text);

  // Each panel: who its beat shows, plus any cast member it already names (spare panels have no beat).
  const panels = storyboardPanels(prompt);
  if (panels.size) {
    let result = prompt;
    for (const [panel, text] of panels) {
      const names = Array.from(new Set([...(beats[panel - 1]?.onScreen || []), ...castNamedIn(text, cast)]));
      const fixed = fix(text, names);
      if (fixed !== text) result = result.replace(text, fixed);
    }
    return result;
  }
  // An older single frame: everything but the Characters line.
  const body = withoutLine(prompt, CHARACTERS_LINE);
  const names = Array.from(new Set([...beats.flatMap((beat) => beat.onScreen), ...castNamedIn(body, cast)]));
  const line = prompt.match(CHARACTERS_LINE)?.[0] ?? '';
  const at = line ? prompt.indexOf(line) : -1;
  if (at < 0) return fix(prompt, names);
  return fix(prompt.slice(0, at), names) + line + fix(prompt.slice(at + line.length), names);
}

/** The storyboard prompt with its Characters line listing exactly these characters. */
export function withCharactersLine(prompt: string, names: string[]): string {
  const content = names.length
    ? `${names.join(', ')}. Each appears as exactly one individual, matching the attached reference images.`
    : 'None.';
  if (CHARACTERS_LINE.test(prompt)) {
    return prompt.replace(CHARACTERS_LINE, (whole, current: string) => whole.slice(0, whole.length - current.length) + content);
  }
  const setting = prompt.search(/^[ \t]*\**Setting\**[ \t]*:/im);
  if (setting < 0) return prompt;
  return `${prompt.slice(0, setting)}Characters: ${content}\n\n${prompt.slice(setting)}`;
}

export function buildStoryboardRevisionPrompt(input: {
  storyboardPrompt: string;
  scriptBeats: string;
  panels: PanelProblem[];
}): string {
  // An older single-frame prompt has no numbered panels; its one shot is described as a whole.
  const hasPanels = storyboardPanels(input.storyboardPrompt).size > 0;
  const quoted = (names: string[]) => names.map((name) => `"${name}"`).join(', ');
  const fixes = input.panels.map((panel) => {
    const where = hasPanels ? `Panel ${panel.panel} (beat ${panel.beat})` : `The shot (beat ${panel.beat})`;
    return `- ${where}: ${[
      panel.missing.length ? `name and place ${quoted(panel.missing)}` : '',
      panel.unplaced.length ? `place ${quoted(panel.unplaced)}` : '',
    ].filter(Boolean).join('; ')}.`;
  }).join('\n');

  return `You are a storyboard artist correcting one storyboard image prompt for a 3D animated children's series. Some characters the script shows are not named in their panels, or their place in frame is not stated, which makes the image and video models put them in odd places or merge their bodies. Change as little as possible.

FIX THESE PANELS:
${fixes}

RULES:
- If the panel already shows the character under a short name, nickname, role word or pronoun ("Kartik", "Dad", "his mother", "she"), replace those words with the exact name. Otherwise add the character and what they are doing in that beat.
- Write each exact name character for character, without quotes. Reference sheets are matched by these names.
- Right after a character's first name in a panel, put their place in brackets: side of frame (left, center or right), depth (foreground, midground or background), pose and facing, for example "Jaksh (left, foreground, kneeling, facing right)". Do this for every character in the panels you fix, including ones already named there.
- Place characters apart so they never overlap, and keep each character on the same side of frame from panel to panel unless the action moves them. Take positions from the beat and from the other panels.
- Never describe looks (species, colors, face, hair, body, outfit): attached reference sheets define them.
- Keep every other line word for word: the style line, the Characters, Objects and Setting lines, the lighting line, the panels you are not fixing and the closing line.
- Keep the layout, the number of panels and the panel numbering. Never add panel labels or numbers to a single-frame prompt. Each panel stays one sentence that starts with its shot size and angle.
- Keep the whole prompt under 300 words.

THE SCENE'S BEATS (context only):
"""
${(input.scriptBeats || '').trim()}
"""

CURRENT PROMPT:
"""
${input.storyboardPrompt}
"""

Return ONLY valid JSON: { "storyboard_prompt": "the corrected prompt, newlines escaped" }`;
}

/** The agent's corrected prompt. A revision that changes the panel layout is rejected: clips open on their panel number. */
export function parseRevisedStoryboardPrompt(value: unknown, original: string): string {
  const prompt = (value as { storyboard_prompt?: unknown } | null)?.storyboard_prompt;
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('The corrected storyboard prompt is missing.');
  const panels = (text: string) => Array.from(storyboardPanels(text).keys()).join(',');
  if (panels(prompt) !== panels(original)) throw new Error('The corrected storyboard prompt changed the panel layout.');
  return prompt.trim();
}

/** The beats the check reads: the scene's beat script, numbered like the scene. */
export function checkedBeatNumbers(scene: { scriptBeats: string; beatNumbers?: number[]; description: string }): number[] {
  return sceneBeats(scene).map((beat, index) => beat.number ?? scene.beatNumbers?.[index] ?? index + 1);
}
