// Objects (vehicles, bags, tents...) are stored as "props": "Object" clashes with JavaScript's
// Object in the Prisma client. The app calls them Objects.

export type PropKind = 'permanent' | 'episode';

export const PROP_KINDS: { value: PropKind; label: string; hint: string }[] = [
  { value: 'permanent', label: 'Permanent', hint: 'Reused across episodes, like the family car or Jaksh\'s backpack.' },
  { value: 'episode', label: 'This episode only', hint: 'Belongs to one episode, like a camping tent or a treasure map.' },
];

export function isPropKind(value: unknown): value is PropKind {
  return value === 'permanent' || value === 'episode';
}

/**
 * The image prompt for an object's reference sheet: the object alone, from several sides, so every
 * storyboard and clip can draw the same design. The description says what the object looks like.
 */
export function propSheetPrompt(description: string): string {
  return `Object reference sheet for a 3D animated children's series, Pixar/DreamWorks style. ${description.trim()}

Show this single object only, with no people or characters: a front view, a side view and a back view, plus one three-quarter view, side by side on a plain light background with soft even lighting. Same object, same colors, same proportions in every view. No text or labels.`;
}

/**
 * Objects per scene sent to image and video generation, on top of the scene's characters and its
 * location. Magnific limits the reference images per generation; raise this once that limit is known.
 */
export const MAX_SCENE_OBJECTS = 2;
/** Objects the detection agent may list for one episode. */
export const MAX_EPISODE_OBJECTS = 8;

export interface DetectedObject {
  name: string;
  description: string;
  /** The story uses an object already in the library. */
  existing: boolean;
  /** Likely to return in later episodes; suggested for promotion to permanent. */
  recurring: boolean;
}

function storyText(content: string): string {
  return (content || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

/** The object detection agent: which objects in an episode need a reference sheet. */
export function buildObjectDetectionPrompt(
  story: string,
  library: { name: string; description: string }[],
  cast: { name: string; description: string }[] = [],
): string {
  const known = library.length
    ? library.map((item) => `- "${item.name}": ${item.description || 'no description'}`).join('\n')
    : 'None yet.';
  const characters = cast.length
    ? `\nCHARACTERS (their sheets already show everything that is part of them; never list any of it as an object):\n${cast.map((item) => `- "${item.name}": ${item.description || 'no description'}`).join('\n')}\n`
    : '';
  return `You are the props master for a 3D animated children's series. Read the episode story and list the physical objects that need a reference sheet, so each looks the same in every storyboard panel and video clip.

An object needs a sheet only when all of these are true:
- It is seen on screen, not only mentioned.
- It appears in more than one moment of the story, or the plot depends on it.
- It has a specific design worth keeping consistent: vehicles, bags, tents, gadgets, toys, special tools, maps, signs, boats.

Never list:
- characters or animals, or anything that is part of a character's body or built-in design (a gadget mounted on a robot, a character's own markings);
- clothes a character always wears;
- places, buildings, rooms, or fixed features of a place such as a fire ring, a fence or a well (those belong to the location's sheet);
- food eaten once, or generic background items such as cups, rocks or trees.

EXISTING OBJECTS LIBRARY:
${known}

If the story uses one of these, return it with its exact name and "existing": true. Never create a second version of an object that is already in the library.
${characters}
For each new object:
- "name": short and specific, in Title Case, for example "Family Car" or "Camping Tent".
- "description": one to three sentences on how it looks only: shape, colors, materials, size compared with a child, distinctive details. Decide one design: never offer alternatives such as "olive or khaki" or "possibly striped". Consistent with the story; no story events. If it is a real-world object, describe it accurately.
- "recurring": false unless the object clearly belongs to a main character or their family and would come back in other adventures (the family car, a character's own backpack). Camping gear, tools and items found or used on one trip are false.

List at most ${MAX_EPISODE_OBJECTS} objects, most important first.

Before answering, check every entry and fix it:
- Is it attached to, mounted on or part of a character? Remove it.
- Is it a fixed part of a place? Remove it.
- Does the description offer a choice ("beige or khaki", "metal or wooden", "possibly")? Rewrite it with one choice.
- Is "recurring" true for gear used only on this trip? Make it false.

STORY:
"""
${storyText(story)}
"""

Your answer is read by a program: reply with the JSON only, never with notes or explanations.
Return ONLY valid JSON:
{"objects": [{"name": "...", "description": "...", "existing": false, "recurring": false}]}
Return {"objects": []} when no object needs a sheet.`;
}

// The model sometimes lists part of a character despite the prompt, and says so itself: "mounted
// permanently on Tilli's chest", "worn by Jaksh". Such entries belong to the character's sheet.
const PART_OF_A_CHARACTER = /\b(worn by|wears|wearing|mounted (permanently )?on|built[- ]into|built[- ]in|attached to (his|her|their|its)|part of (his|her|their|its|the character'?s?)\b)/i;

/** The agent's answer, with invalid, duplicate and part-of-a-character entries dropped. */
export function parseDetectedObjects(value: unknown): DetectedObject[] {
  const list = (value as { objects?: unknown } | null)?.objects;
  if (!Array.isArray(list)) throw new Error('The object list is missing.');
  const seen = new Set<string>();
  const objects: DetectedObject[] = [];
  for (const item of list) {
    const name = typeof item?.name === 'string' ? item.name.replace(/\s+/g, ' ').trim() : '';
    const key = name.toLowerCase();
    const description = typeof item?.description === 'string' ? item.description.trim() : '';
    if (!name || seen.has(key) || PART_OF_A_CHARACTER.test(description)) continue;
    seen.add(key);
    objects.push({
      name,
      description,
      existing: item?.existing === true,
      recurring: item?.recurring === true,
    });
  }
  return objects.slice(0, MAX_EPISODE_OBJECTS);
}
