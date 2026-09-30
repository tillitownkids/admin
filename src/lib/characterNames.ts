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
