"use client";

import { MapPin } from "lucide-react";
import { LibraryManager } from "@/components/library/LibraryManager";

export default function LocationsPage() {
  return (
    <LibraryManager
      resourceName="Location"
      resourceNamePlural="Locations"
      apiPath="/api/locations"
      listKey="locations"
      itemKey="location"
      ownerType="location_reference"
      icon={MapPin}
      description="Reusable location references, kept visually consistent across every episode."
      namePlaceholder="e.g., Candy Forest"
      descriptionPlaceholder="What this place looks like, its mood, and any details that should stay consistent..."
    />
  );
}
