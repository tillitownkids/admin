"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Loader2, MapPin, Package, Plus, ScanSearch, Sparkles, Trash2, Users } from "lucide-react";

import {
  addEpisodeAssetAction,
  detectEpisodeAssetsAction,
  removeEpisodeAssetAction,
  type AssetCard,
  type AssetType,
  type EpisodeAssets,
} from "@/actions/episodeAssetsAction";
import { detectEpisodeObjectsAction } from "@/actions/propsAction";
import { ButtonLink } from "@/components/ButtonLink";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SECTIONS: { type: AssetType; key: "characters" | "locations" | "objects"; title: string; singular: string; library: string; icon: typeof Users }[] = [
  { type: "character", key: "characters", title: "Characters", singular: "character", library: "/characters", icon: Users },
  { type: "location", key: "locations", title: "Locations", singular: "location", library: "/locations", icon: MapPin },
  { type: "object", key: "objects", title: "Objects", singular: "object", library: "/objects", icon: Package },
];

// Batch sheet generation takes ids by kind; objects are stored as props.
const BATCH_KEY: Record<AssetType, "characterIds" | "locationIds" | "propIds"> = {
  character: "characterIds",
  location: "locationIds",
  object: "propIds",
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function AssetTile({
  asset,
  type,
  busy,
  onGenerate,
  onRemove,
}: {
  asset: AssetCard;
  type: AssetType;
  busy: boolean;
  onGenerate: () => void;
  onRemove: () => void;
}) {
  const removeNote = type === "location"
    ? (asset.sceneCount ? `${plural(asset.sceneCount, "scene")} ${asset.sceneCount === 1 ? "is" : "are"} set here, so it cannot be removed until the storyboard is planned without it.` : "It stays in the Locations library.")
    : type === "object" && asset.kind === "episode"
    ? "This object belongs only to this episode, so it is deleted with its sheet."
    : `It is also taken out of ${asset.sceneCount ? plural(asset.sceneCount, "scene") : "this episode's scenes"}, and stays in the library.`;

  return (
    <Card size="sm" className="overflow-hidden pt-0">
      <div className="flex aspect-video items-center justify-center bg-muted">
        {asset.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.imageUrl} alt={asset.name} className="size-full object-cover" />
        ) : (
          <span className="text-xs text-muted-foreground">No image yet</span>
        )}
      </div>
      <CardContent className="space-y-2">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{asset.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {asset.hasSheet ? (
              <Badge variant="outline"><Check />Sheet ready</Badge>
            ) : (
              <Badge variant="destructive"><AlertTriangle />No sheet</Badge>
            )}
            {asset.kind && <Badge variant="secondary">{asset.kind === "episode" ? "This episode only" : "Permanent"}</Badge>}
            {asset.suggestPermanent && <Badge variant="outline" title="Likely to return; make it permanent in Objects">Recurring?</Badge>}
            <Badge variant="outline">{asset.sceneCount ? plural(asset.sceneCount, "scene") : "No scenes yet"}</Badge>
          </div>
        </div>
        {asset.description && <p className="line-clamp-3 text-sm text-muted-foreground">{asset.description}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {!asset.hasSheet && (
            <ConfirmButton
              size="sm"
              variant="outline"
              disabled={busy}
              title={`Generate a reference sheet for ${asset.name}?`}
              description={asset.description.trim() ? "The sheet is generated from the description. It spends image credits." : "This has no description yet, so no sheet can be generated. Add one in the library first."}
              confirmLabel="Generate sheet"
              onConfirm={onGenerate}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Generate sheet
            </ConfirmButton>
          )}
          <ConfirmButton
            size="sm"
            variant="ghost"
            disabled={busy}
            destructive
            title={`Remove ${asset.name} from this episode?`}
            description={removeNote}
            confirmLabel="Remove"
            onConfirm={onRemove}
          >
            <Trash2 />
            Remove
          </ConfirmButton>
        </div>
      </CardContent>
    </Card>
  );
}

function AddFromLibrary({
  options,
  singular,
  disabled,
  onAdd,
}: {
  options: { id: string; name: string }[];
  singular: string;
  disabled: boolean;
  onAdd: (id: string) => void;
}) {
  const labelId = useId();
  const [choice, setChoice] = useState("");
  if (!options.length) return null;
  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="sr-only">Add a {singular} from the library</span>
      <Select value={choice} onValueChange={(value) => setChoice(String(value ?? ""))} items={options.map((option) => ({ value: option.id, label: option.name }))}>
        <SelectTrigger size="sm" aria-labelledby={labelId} className="w-56">
          <SelectValue placeholder={`Add a ${singular} from the library`} />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !choice}
        onClick={() => {
          onAdd(choice);
          setChoice("");
        }}
      >
        <Plus />
        Add
      </Button>
    </div>
  );
}

/**
 * The Assets step: every character, location and object the episode uses, with its reference sheet.
 * Storyboard images and clips send these sheets as references, so each needs one before images are made.
 */
export function AssetsStep({ storyId, assets }: { storyId: string; assets: EpisodeAssets }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const total = assets.characters.length + assets.locations.length + assets.objects.length;
  const missing = [...assets.characters, ...assets.locations, ...assets.objects].filter((asset) => !asset.hasSheet).length;

  // Runs one change, reports it, and reloads the step.
  const act = async (key: string, work: () => Promise<string>) => {
    setBusy(key);
    setMessage(null);
    try {
      setMessage({ error: false, text: await work() });
      router.refresh();
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "That did not work. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const generateSheets = (type: AssetType, items: AssetCard[]) => act(`sheets-${type}-${items.map((item) => item.id).join(",")}`, async () => {
    const res = await fetch("/api/references/generate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [BATCH_KEY[type]]: items.map((item) => item.id) }),
    });
    const data = await res.json().catch(() => ({}));
    const failed: { error?: string }[] = Array.isArray(data.failed) ? data.failed : [];
    if (!res.ok && !failed.length) throw new Error(data.error || `The sheets could not be generated (HTTP ${res.status}).`);
    if (failed.length) throw new Error(`Some sheets failed: ${failed.map((item) => item.error).join("; ")}`);
    return `${plural(items.length, "sheet")} generated.`;
  });

  const remove = (type: AssetType, asset: AssetCard) => act(`remove-${asset.id}`, async () => {
    const result = await removeEpisodeAssetAction(storyId, type, asset.id);
    if (!result.ok) throw new Error(result.error);
    return `${asset.name} was removed from this episode.`;
  });

  const add = (type: AssetType, id: string, name: string) => act(`add-${type}`, async () => {
    const result = await addEpisodeAssetAction(storyId, type, id);
    if (!result.ok) throw new Error(result.error);
    return `${name} was added to this episode.`;
  });

  // The detect buttons: an agent reads the story, attaches what the library has and creates the rest.
  const find = (type: AssetType, title: string) => act(`find-${type}`, async () => {
    const result = type === "object" ? await detectEpisodeObjectsAction(storyId) : await detectEpisodeAssetsAction(storyId, type);
    if (!result.ok) throw new Error(result.error);
    if (!result.created.length && !result.linked.length) {
      return type === "object" ? "No objects in this story need a reference sheet." : `No ${title.toLowerCase()} were found in the story.`;
    }
    return [
      result.created.length ? `New: ${result.created.join(", ")}.` : null,
      result.linked.length ? `From the library: ${result.linked.join(", ")}.` : null,
    ].filter(Boolean).join(" ");
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-sm text-muted-foreground">
          {total === 0
            ? "No characters, locations or objects are linked to this episode yet."
            : missing === 0
            ? `All ${plural(total, "asset")} have a reference sheet.`
            : `${missing} of ${plural(total, "asset")} still need a reference sheet. Storyboard images and clips use these sheets, so generate them before making images.`}
        </p>
        <ButtonLink href={`/episodes/${storyId}/script`} variant={missing === 0 && total > 0 ? "default" : "outline"}>
          Continue to Script
          <ArrowRight />
        </ButtonLink>
      </div>

      {message && (
        <Alert variant={message.error ? "destructive" : "default"}>
          {message.error ? <AlertTriangle /> : <Check />}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {SECTIONS.map(({ type, key, title, singular, library, icon: Icon }) => {
        const items = assets[key];
        const withoutSheet = items.filter((asset) => !asset.hasSheet && asset.description.trim());
        const sectionBusy = busy !== null;
        return (
          <section key={type} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Icon className="size-4" />
                {title}
                <span className="font-normal text-muted-foreground">({items.length})</span>
                <Link href={library} className="text-xs font-normal text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  open library
                </Link>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" disabled={sectionBusy} onClick={() => find(type, title)} title={`Read the story, attach the ${title.toLowerCase()} the library has, and create new ones`}>
                  {busy === `find-${type}` ? <Loader2 className="animate-spin" /> : <ScanSearch />}
                  Find {title.toLowerCase()} in the story
                </Button>
                {withoutSheet.length > 0 && (
                  <ConfirmButton
                    size="sm"
                    variant="outline"
                    disabled={sectionBusy}
                    title={`Generate ${plural(withoutSheet.length, "sheet")}?`}
                    description={`One reference sheet each for ${withoutSheet.map((asset) => asset.name).join(", ")}. Each spends image credits and can take a minute.`}
                    confirmLabel="Generate sheets"
                    onConfirm={() => generateSheets(type, withoutSheet)}
                  >
                    {busy?.startsWith(`sheets-${type}`) ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Generate {plural(withoutSheet.length, "missing sheet")}
                  </ConfirmButton>
                )}
                <AddFromLibrary
                  options={assets.available[type]}
                  singular={singular}
                  disabled={sectionBusy}
                  onAdd={(id) => add(type, id, assets.available[type].find((option) => option.id === id)?.name || "It")}
                />
              </div>
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {`No ${title.toLowerCase()} linked yet. Find them in the story, or add one from the library.`}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((asset) => (
                  <AssetTile
                    key={asset.id}
                    asset={asset}
                    type={type}
                    busy={busy !== null}
                    onGenerate={() => {
                      if (asset.description.trim()) generateSheets(type, [asset]);
                    }}
                    onRemove={() => remove(type, asset)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
