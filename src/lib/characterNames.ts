export function normalizeCharacterName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// Exact (case/whitespace-insensitive) matching only. Substring matching linked
// "Jaksh's Father - Kartik" to every scene that listed "Jaksh", which sent the
// wrong reference images to storyboard generation.
export function matchCharactersByName<T extends { name: string }>(
  available: T[],
  names: string[]
): { matched: T[]; unmatched: string[] } {
  const byName = new Map(available.map((c) => [normalizeCharacterName(c.name), c]));
  const matched = new Map<string, T>();
  const unmatched: string[] = [];

  for (const name of names) {
    const key = normalizeCharacterName(name);
    const character = byName.get(key);
    if (character) matched.set(key, character);
    else if (key) unmatched.push(name);
  }

  return { matched: [...matched.values()], unmatched };
}

// Words that never identify anyone on their own.
const NAME_FILLER_WORDS = new Set(["the", "a", "an", "of", "and"]);

function nameWords(name: string): string[] {
  return normalizeCharacterName(name).split(/[^\p{L}\p{N}']+/u).filter((word) => word && !NAME_FILLER_WORDS.has(word));
}

/**
 * The library entry a model-written name refers to: the exact name, or else the only entry whose name
 * contains every word of it ("Kartik" is "Jaksh's Father - Kartik", "Nimo" is "Nimo the Bellbird").
 * Models often shorten names, and treating a shortened name as new duplicated characters. Null when
 * nothing matches or the words fit more than one entry, so a person decides.
 */
export function findExistingByName<T extends { name: string }>(name: string, available: T[]): T | null {
  const key = normalizeCharacterName(name);
  if (!key) return null;
  const exact = available.find((item) => normalizeCharacterName(item.name) === key);
  if (exact) return exact;

  const words = nameWords(name);
  if (!words.length) return null;
  const candidates = available.filter((item) => {
    const own = new Set(nameWords(item.name));
    return words.every((word) => own.has(word));
  });
  return candidates.length === 1 ? candidates[0] : null;
}
