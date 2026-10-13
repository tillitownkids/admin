// Completing an episode's cast: characters the character check sees on screen who are not in the
// episode's cast are matched to the character library, or created when they are genuinely new.

import { findExistingByName } from '@/lib/characterNames';

export interface LibraryCharacter {
  id: string;
  name: string;
  description: string;
}

export type CastDecision =
  | { name: string; action: 'attach'; character: LibraryCharacter }
  | { name: string; action: 'create'; description: string }
  | { name: string; action: 'skip' };

function storyText(content: string): string {
  return (content || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

export function buildCastCompletionPrompt(input: { names: string[]; library: LibraryCharacter[]; story: string }): string {
  const library = input.library.length
    ? input.library.map((character) => `- "${character.name}": ${character.description || 'no description'}`).join('\n')
    : 'None.';
  return `You are the casting director for a 3D animated children's series. The script of one episode shows these characters on screen, but they are not in the episode's cast yet:
${input.names.map((name) => `- "${name}"`).join('\n')}

CHARACTER LIBRARY (every character the series already has):
${library}

For each name, decide:
- "library_name": the exact library name when it is the same character, even if the script calls them something shorter or by their role ("Kartik" or "Dad" can be "Jaksh's Father - Kartik"). Copy the name exactly from the library.
- "skip": true when it is not one specific character: a crowd, an unnamed extra, an animal that is only scenery, or an object.
- Otherwise it is a new character: give "description", two or three sentences on how they look (age, build, skin, hair, clothing, colors), consistent with the story. Describe a person or creature only; never invent robot parts, wheels, glowing eyes or powers the story does not state.

EPISODE STORY:
"""
${storyText(input.story)}
"""

Your answer is read by a program: reply with JSON only.
{"characters": [{"name": "name as given above", "library_name": null, "skip": false, "description": ""}]}`;
}

/**
 * The agent's decisions, checked against the library. A library name the agent made up is ignored, and
 * a "new" character whose name already fits a library character is attached instead, so the check can
 * never create a duplicate.
 */
export function parseCastDecisions(value: unknown, names: string[], library: LibraryCharacter[]): CastDecision[] {
  const list = (value as { characters?: unknown } | null)?.characters;
  if (!Array.isArray(list)) throw new Error('The cast answer is missing.');
  const byName = new Map(list
    .filter((item) => typeof item?.name === 'string')
    .map((item) => [item.name.trim().toLowerCase(), item as { library_name?: unknown; skip?: unknown; description?: unknown }]));

  return names.map((name): CastDecision => {
    const answer = byName.get(name.trim().toLowerCase());
    const libraryName = typeof answer?.library_name === 'string' ? answer.library_name.trim() : '';
    const named = libraryName ? library.find((character) => character.name === libraryName) : undefined;
    const existing = named ?? findExistingByName(name, library);
    if (existing) return { name, action: 'attach', character: existing };
    if (!answer || answer.skip === true) return { name, action: 'skip' };
    const description = typeof answer.description === 'string' ? answer.description.trim() : '';
    return description ? { name, action: 'create', description } : { name, action: 'skip' };
  });
}
