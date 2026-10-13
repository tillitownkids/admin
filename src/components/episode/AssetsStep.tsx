"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Link2, Loader2, MapPin, Package, Plus, ScanSearch, Search, Sparkles, Trash2, Users } from "lucide-react";

import {
  addEpisodeAssetAction,
  createEpisodeAssetAction,
  removeEpisodeAssetAction,
  type AssetCard,
  type AssetType,
  type EpisodeAssets,
  type LibraryOption,
} from "@/actions/episodeAssetsAction";
import { detectEpisodeObjectsAction } from "@/actions/propsAction";
import { ButtonLink } from "@/components/ButtonLink";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROP_KINDS } from "@/lib/propSheet";

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

// Library entries whose name, or else description, contains every word typed; name matches first.
function searchLibrary(options: LibraryOption[], query: string): LibraryOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const has = (text: string) => words.every((word) => text.toLowerCase().includes(word));
  return [...options.filter((option) => has(option.name)), ...options.filter((option) => !has(option.name) && has(option.description))].slice(0, 6);
}

/** Search the library for a character, location or object to attach, or create it when it is new. */
function AssetSearch({
  type,
  singular,
  options,
  inEpisode,
  disabled,
  onAttach,
  onCreate,
}: {
  type: AssetType;
  singular: string;
  options: LibraryOption[];
  /** Names already in the episode, so a search for one says so instead of offering to create it. */
  inEpisode: string[];
  disabled: boolean;
  onAttach: (option: LibraryOption) => void;
  onCreate: (input: { name: string; description: string; kind?: "permanent" | "episode" }) => void;
}) {
  const kindLabel = useId();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"permanent" | "episode">("episode");

  const name = query.replace(/\s+/g, " ").trim();
  const results = searchLibrary(options, name);
  const alreadyIn = inEpisode.find((item) => item.toLowerCase() === name.toLowerCase());
  const exists = alreadyIn || options.some((option) => option.name.toLowerCase() === name.toLowerCase());
  const reset = () => {
    setQuery("");
    setCreating(false);
    setDescription("");
  };

  return (
    <div className="max-w-xl space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCreating(false);
          }}
          placeholder={`Search ${singular}s to attach, or type a new name`}
          aria-label={`Search ${singular}s`}
          className="pl-8"
          disabled={disabled}
        />
      </div>

      {name && !creating && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {results.map((option) => (
            <li key={option.id} className="flex items-center gap-3 p-2">
              <div className="size-10 shrink-0 overflow-hidden rounded bg-muted">
                {option.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.imageUrl} alt="" className="size-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{option.name}</p>
                <p className="truncate text-xs text-muted-foreground">{option.hasSheet ? "Sheet ready" : "No sheet yet"}{option.description ? ` · ${option.description}` : ""}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  onAttach(option);
                  reset();
                }}
              >
                <Link2 />
                Attach
              </Button>
            </li>
          ))}
          {alreadyIn ? (
            <li className="p-2 text-sm text-muted-foreground">{alreadyIn} is already in this episode.</li>
          ) : !exists ? (
            <li className="p-2">
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setCreating(true)}>
                <Plus />
                Create &ldquo;{name}&rdquo; as a new {singular}
              </Button>
            </li>
          ) : null}
          {!results.length && exists && !alreadyIn && (
            <li className="p-2 text-sm text-muted-foreground">No match.</li>
          )}
        </ul>
      )}

      {creating && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="text-sm font-medium text-foreground">New {singular}: {name}</p>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={type === "location"
              ? "What this place looks like: setting, time of day, mood, details that should stay the same"
              : type === "object"
              ? "What it looks like: shape, colors, materials, size"
              : "What they look like: age, build, skin, hair, clothing, colors"}
            aria-label={`Description of ${name}`}
            className="min-h-20"
          />
          {type === "object" && (
            <div className="flex items-center gap-2 text-sm">
              <span id={kindLabel} className="text-muted-foreground">Kind</span>
              <Select value={kind} onValueChange={(value) => setKind(value === "permanent" ? "permanent" : "episode")} items={PROP_KINDS.map(({ value, label }) => ({ value, label }))}>
                <SelectTrigger size="sm" aria-labelledby={kindLabel} className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {PROP_KINDS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            It is added to the {singular} library and to this episode. Generate its sheet from its card.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={disabled || !description.trim()}
              onClick={() => {
                onCreate({ name, description, ...(type === "object" ? { kind } : {}) });
                reset();
              }}
            >
              <Plus />
              Create and attach
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}
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

  const create = (type: AssetType, input: { name: string; description: string; kind?: "permanent" | "episode" }) => act(`create-${type}`, async () => {
    const result = await createEpisodeAssetAction(storyId, type, input);
    if (!result.ok) throw new Error(result.error);
    return result.existed
      ? `${result.name} was already in the library, so it was attached instead of created.`
      : `${result.name} was created and added to this episode. Generate its sheet from its card.`;
  });

  const findObjects = () => act("find-objects", async () => {
    const result = await detectEpisodeObjectsAction(storyId);
    if (!result.ok) throw new Error(result.error);
    if (!result.created.length && !result.linked.length) return "No objects in this story need a reference sheet.";
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
                {type === "object" && (
                  <Button size="sm" variant="ghost" disabled={sectionBusy} onClick={findObjects} title="Read the story and link or create the objects it needs">
                    {busy === "find-objects" ? <Loader2 className="animate-spin" /> : <ScanSearch />}
                    Find objects in the story
                  </Button>
                )}
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
              </div>
            </div>
            <AssetSearch
              type={type}
              singular={singular}
              options={assets.available[type]}
              inEpisode={items.map((asset) => asset.name)}
              disabled={sectionBusy}
              onAttach={(option) => add(type, option.id, option.name)}
              onCreate={(input) => create(type, input)}
            />
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {type === "object" ? "No objects yet. Find them in the story, or search above to attach or create one." : `No ${title.toLowerCase()} linked yet. Search above to attach or create one.`}
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
