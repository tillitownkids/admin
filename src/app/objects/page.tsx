"use client";

import { useId, useState } from "react";
import { Package } from "lucide-react";
import { LibraryManager, type LibraryExtraFields, type LibraryItem } from "@/components/library/LibraryManager";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { labelClass } from "@/lib/styles";
import { PROP_KINDS, propSheetPrompt, type PropKind } from "@/lib/propSheet";

// Objects are stored as props (see src/lib/propSheet.ts).
type PropItem = LibraryItem & { kind?: PropKind; story_id?: string | null; episode_title?: string | null; suggest_permanent?: boolean };
type Episode = { id: string; title: string };

function KindAndEpisodeFields({
  values,
  setValues,
  episodes,
}: {
  values: Record<string, unknown>;
  setValues: (values: Record<string, unknown>) => void;
  episodes: Episode[];
}) {
  const kindLabel = useId();
  const episodeLabel = useId();
  const kind = (values.kind as PropKind) || "permanent";
  const storyId = (values.story_id as string) || "";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <p id={kindLabel} className={labelClass}>Kind</p>
        <Select
          value={kind}
          onValueChange={(next) => setValues({ ...values, kind: next })}
          items={PROP_KINDS.map(({ value, label }) => ({ value, label }))}
        >
          <SelectTrigger aria-labelledby={kindLabel} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {PROP_KINDS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{PROP_KINDS.find((option) => option.value === kind)?.hint}</p>
      </div>

      {kind === "episode" && (
        <div className="space-y-2">
          <p id={episodeLabel} className={labelClass}>Episode</p>
          <Select
            value={storyId}
            onValueChange={(next) => setValues({ ...values, story_id: next })}
            items={episodes.map((episode) => ({ value: episode.id, label: episode.title }))}
          >
            <SelectTrigger aria-labelledby={episodeLabel} className="w-full">
              <SelectValue placeholder="Choose the episode" />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {episodes.map((episode) => (
                <SelectItem key={episode.id} value={episode.id}>{episode.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Switch the kind to Permanent later to reuse it in other episodes; its sheet is kept.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ObjectsPage() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  const extraFields: LibraryExtraFields = {
    initial: (item) => ({
      kind: (item as PropItem | null)?.kind || "permanent",
      story_id: (item as PropItem | null)?.story_id || "",
    }),
    render: (values, setValues) => <KindAndEpisodeFields values={values} setValues={setValues} episodes={episodes} />,
    validate: (values) => (values.kind === "episode" && !values.story_id ? "Choose the episode this object belongs to." : null),
    cardLabel: (item) => {
      const prop = item as PropItem;
      if (prop.kind !== "episode") return "Permanent";
      const episode = `This episode only · ${prop.episode_title || "Unknown episode"}`;
      // Object detection expects it to return; switching the kind to Permanent promotes it.
      return prop.suggest_permanent ? `${episode} · likely to return, consider Permanent` : episode;
    },
  };

  return (
    <LibraryManager
      resourceName="Object"
      resourceNamePlural="Objects"
      apiPath="/api/props"
      listKey="props"
      itemKey="prop"
      ownerType="prop_reference"
      icon={Package}
      description="Vehicles, bags, tents and other objects, each with a reference sheet so it looks the same in every storyboard and clip."
      namePlaceholder="e.g., Family car"
      descriptionPlaceholder="What this object looks like: shape, colors, materials, size, and details that should stay consistent..."
      sheetPrompt={propSheetPrompt}
      extraFields={extraFields}
      onListLoaded={(data) => setEpisodes(Array.isArray(data.episodes) ? (data.episodes as Episode[]) : [])}
    />
  );
}
