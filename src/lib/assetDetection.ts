// Detecting an episode's characters and locations from its story: the ones the library already has
// are attached, new ones are created. Objects have their own agent (src/lib/propSheet.ts).

import { findExistingByName } from '@/lib/characterNames';

export type DetectableAsset = 'character' | 'location';

export interface LibraryAsset {
  id: string;
  name: string;
  description: string;
}

export type AssetDecision =
  | { name: string; action: 'attach'; asset: LibraryAsset }
  | { name: string; action: 'create'; description: string };

/** At most this many per run, so a confused answer cannot flood the library. */
export const MAX_DETECTED_ASSETS = 12;

function storyText(content: string): string {
  return (content || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

export function buildAssetDetectionPrompt(type: DetectableAsset, story: string, library: LibraryAsset[]): string {
  const known = library.length
    ? library.map((item) => `- "${item.name}": ${item.description || 'no description'}`).join('\n')
    : 'None yet.';
  const task = type === 'character'
    ? `List every character who appears in the story: seen or heard on screen, not only mentioned. Leave out crowds, unnamed extras and animals that are only scenery.`
    : `List every distinct physical location the story takes place in, in the order they first appear. A location is a place a scene is set in (a room, a street, a campsite), not an object in it.`;
  const look = type === 'character'
    ? `two or three sentences on how they look: age, build, skin, hair, clothing, colors. Describe a person or creature only; never invent robot parts, wheels, glowing eyes or powers the story does not state.`
    : `one or two sentences on how the place looks: setting, architecture, landscape, colors, light. If it is a real place, describe it as it really looks.`;
  const label = type === 'character' ? 'CHARACTER' : 'LOCATION';

  return `You are preparing a 3D animated children's episode for production. ${task}

${label} LIBRARY (every ${type} the series already has):
${known}

For each ${type}:
- "name": the name the story uses.
- "library_name": the exact library name when it is the same ${type}, even if the story calls it something shorter or by a role ("Dad" can be "Jaksh's Father - Kartik"). Copy it exactly from the library. Otherwise null.
- "description": only for a ${type} that is not in the library: ${look} Consistent with the story.

List at most ${MAX_DETECTED_ASSETS}.

STORY:
"""
${storyText(story)}
"""

Your answer is read by a program: reply with JSON only.
{"items": [{"name": "...", "library_name": null, "description": "..."}]}`;
}

/**
 * The agent's answer, checked against the library: a made-up library name is ignored, and a new name
 * that already fits a library entry is attached instead, so detection never makes a duplicate. An
 * item with no library match and no description is dropped.
 */
export function parseAssetDecisions(value: unknown, library: LibraryAsset[]): AssetDecision[] {
  const list = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) throw new Error('The answer has no list.');
  const decisions: AssetDecision[] = [];
  const seen = new Set<string>();
  for (const item of list.slice(0, MAX_DETECTED_ASSETS)) {
    const name = typeof item?.name === 'string' ? item.name.replace(/\s+/g, ' ').trim() : '';
    if (!name) continue;
    const libraryName = typeof item?.library_name === 'string' ? item.library_name.trim() : '';
    const existing = (libraryName ? library.find((asset) => asset.name === libraryName) : undefined) ?? findExistingByName(name, library);
    const key = existing ? `id:${existing.id}` : `new:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (existing) {
      decisions.push({ name, action: 'attach', asset: existing });
      continue;
    }
    const description = typeof item?.description === 'string' ? item.description.trim() : '';
    if (description) decisions.push({ name, action: 'create', description });
  }
  return decisions;
}
