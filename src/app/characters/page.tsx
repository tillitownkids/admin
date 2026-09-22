"use client";

import { Users } from "lucide-react";
import { LibraryManager } from "@/components/library/LibraryManager";

export default function CharactersPage() {
  return (
    <LibraryManager
      resourceName="Character"
      resourceNamePlural="Characters"
      apiPath="/api/characters"
      listKey="characters"
      itemKey="character"
      ownerType="character_reference"
      icon={Users}
      description="Reusable character references, kept consistent across every episode."
      namePlaceholder="e.g., Tilli"
      descriptionPlaceholder="Describe this character's appearance, personality, and details that should stay consistent..."
    />
  );
}
