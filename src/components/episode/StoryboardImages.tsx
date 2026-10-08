"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronDown, ImageIcon, Loader2, MapPin, RefreshCw, User } from "lucide-react";

import { ButtonLink } from "@/components/ButtonLink";
import { ConfirmButton } from "@/components/ConfirmButton";
import type { EpisodeLocationRow, SceneRow } from "@/components/episode-production/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const STORYBOARD_WEBHOOK = "https://automation.tillitown.com/webhook/generate-storyboard";

// The workflow's response shape varies with how it is configured; these read every shape seen so far.
function extractImageUrl(data: any): string | null {
  if (!data) return null;
  if (typeof data === "string" && data.startsWith("http")) return data;
  const d = data.json || data;

  if (d.results?.url) return d.results.url;
  if (d.results?.thumbnailUrl) return d.results.thumbnailUrl;
  if (Array.isArray(d.results) && d.results[0]?.url) return d.results[0].url;
  if (d.url) return d.url;
  if (d.imageUrl) return d.imageUrl;
  if (d.thumbnailUrl) return d.thumbnailUrl;

  const nested = Array.isArray(d.result?.scenes) ? d.result.scenes : Array.isArray(d.scenes) ? d.scenes : null;
  if (nested?.[0]) {
    const url = extractImageUrl(nested[0]);
    if (url) return url;
  }

  if (d.result?.results?.url) return d.result.results.url;
  if (d.result?.results?.thumbnailUrl) return d.result.results.thumbnailUrl;
  if (Array.isArray(d.result?.results) && d.result.results[0]?.url) return d.result.results[0].url;
  if (d.result?.url) return d.result.url;
  if (Array.isArray(data) && data[0]) return extractImageUrl(data[0]);
  return null;
}

function extractMagnificIdentifier(data: any): string | null {
  if (!data || typeof data === "string") return null;
  const d = data.json || data;

  if (d.identifier) return d.identifier;
  if (d.magnific_identifier) return d.magnific_identifier;
  if (d.magnific_id) return d.magnific_id;
  if (d.results?.identifier) return d.results.identifier;

  const nested = Array.isArray(d.result?.scenes) ? d.result.scenes : Array.isArray(d.scenes) ? d.scenes : null;
  if (nested?.[0]) {
    const id = extractMagnificIdentifier(nested[0]);
    if (id) return id;
  }

  if (d.result?.identifier) return d.result.identifier;
  if (d.result?.results?.identifier) return d.result.results.identifier;
  if (Array.isArray(data) && data[0]) return extractMagnificIdentifier(data[0]);
  return null;
}

function sceneCharacters(scene: SceneRow) {
  return (scene.SceneCharacter || []).flatMap((link) => (link.Character ? [link.Character] : []));
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** One storyboard image per scene, built from the scene's saved prompt and its reference sheets. */
export function StoryboardImages({
  storyId,
  scenes,
  episodeLocations,
  onChanged,
}: {
  storyId: string;
  scenes: SceneRow[];
  episodeLocations: EpisodeLocationRow[];
  /** Called after an image is saved, so the scenes and the episode's progress reload. */
  onChanged: () => Promise<void> | void;
}) {
  const [working, setWorking] = useState<Record<string, boolean>>({});
  const [sceneErrors, setSceneErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const sortedScenes = [...scenes].sort((a, b) => a.scene_number - b.scene_number || a.order_index - b.order_index);
  const pendingScenes = sortedScenes.filter((scene) => !scene.storyboard_image_url);
  const imageCount = sortedScenes.length - pendingScenes.length;
  const isWorking = Object.keys(working).length > 0;

  // The image request: the scene's prompt plus the reference sheet of every character and of its location.
  const buildPayloadItem = (scene: SceneRow) => {
    const characters: Record<string, string> = {};
    const withoutSheet = sceneCharacters(scene).filter((character) => !character.magnific_identifier).map((character) => character.name);
    if (withoutSheet.length > 0) {
      throw new Error(`${withoutSheet.join(", ")} ${withoutSheet.length === 1 ? "has" : "have"} no reference sheet yet. Generate ${withoutSheet.length === 1 ? "it" : "them"} in Characters, then try again.`);
    }
    for (const character of sceneCharacters(scene)) characters[character.name] = character.magnific_identifier!;

    const location = episodeLocations.find(
      (item) => item.id === scene.episode_location_id || item.Location.name.toLowerCase() === scene.locationName.toLowerCase()
    );
    if (!location && scene.locationName) {
      throw new Error(`The location "${scene.locationName}" is not linked to this episode.`);
    }
    if (location && !location.Location.magnific_identifier) {
      throw new Error(`The location "${location.Location.name}" has no reference sheet yet. Generate it in Locations, then try again.`);
    }

    return {
      id: scene.id,
      imagePrompt: scene.storyboard_prompt || scene.description || "",
      references: {
        characters,
        locations: location ? { [location.Location.name]: location.Location.magnific_identifier! } : {},
      },
    };
  };

  // Generates the given scenes in one request and saves each returned image straight away.
  const generate = async (targets: SceneRow[]) => {
    setNotice(null);
    setSceneErrors((previous) => {
      const next = { ...previous };
      targets.forEach((scene) => delete next[scene.id]);
      return next;
    });

    // A scene with a missing reference sheet is reported on its own row; the rest still run.
    const ready: SceneRow[] = [];
    const items: ReturnType<typeof buildPayloadItem>[] = [];
    const blocked: Record<string, string> = {};
    for (const scene of targets) {
      try {
        items.push(buildPayloadItem(scene));
        ready.push(scene);
      } catch (error) {
        blocked[scene.id] = error instanceof Error ? error.message : "This scene could not be prepared.";
      }
    }
    if (Object.keys(blocked).length > 0) setSceneErrors((previous) => ({ ...previous, ...blocked }));
    if (ready.length === 0) return;

    setWorking(Object.fromEntries(ready.map((scene) => [scene.id, true])));
    try {
      const res = await fetch(STORYBOARD_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes: items }),
      });
      if (!res.ok) throw new Error(`The image service answered with HTTP ${res.status}. Nothing was generated.`);
      const data = await res.json().catch(() => null);

      const returned: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.scenes)
        ? data.scenes
        : Array.isArray(data?.result?.scenes)
        ? data.result.scenes
        : data
        ? [data]
        : [];

      let saved = 0;
      const missing: Record<string, string> = {};
      const matched = new Set<string>();
      for (const [index, item] of returned.entries()) {
        const itemId = item?.id || item?.sceneId || item?.scene_id || item?.result?.id || item?.result?.sceneId;
        const scene = ready.find((candidate) => candidate.id === itemId) || ready[index];
        const url = extractImageUrl(item);
        if (!scene || !url || matched.has(scene.id)) continue;
        matched.add(scene.id);

        const save = await fetch(`/api/scenes/${scene.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storyboard_image_url: url,
            storyboard_status: "generated",
            magnific_identifier: extractMagnificIdentifier(item) || undefined,
          }),
        });
        if (save.ok) saved += 1;
        else missing[scene.id] = `The image was generated but could not be saved (HTTP ${save.status}). Generate it again.`;
      }
      for (const scene of ready) {
        if (!matched.has(scene.id)) missing[scene.id] = "The image service returned no image for this scene. Try again.";
      }
      if (Object.keys(missing).length > 0) setSceneErrors((previous) => ({ ...previous, ...missing }));

      await onChanged();
      setNotice(
        saved === ready.length
          ? { type: "success", text: `${plural(saved, "image")} generated and saved.` }
          : { type: "error", text: `${saved} of ${plural(ready.length, "image")} generated and saved. The scenes that failed say why.` }
      );
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "The images could not be generated." });
    } finally {
      setWorking({});
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {imageCount} of {plural(sortedScenes.length, "scene")} {imageCount === 1 ? "has" : "have"} an image.
        </p>
        {pendingScenes.length > 0 ? (
          <ConfirmButton
            disabled={isWorking}
            title={`Generate ${plural(pendingScenes.length, "storyboard image")}?`}
            description="One image per scene that has none yet. Each image spends image credits, and the whole run can take several minutes."
            confirmLabel={`Generate ${plural(pendingScenes.length, "image")}`}
            onConfirm={() => generate(pendingScenes)}
          >
            {isWorking ? <Loader2 className="animate-spin" /> : <ImageIcon />}
            Generate remaining images ({pendingScenes.length})
          </ConfirmButton>
        ) : (
          <ConfirmButton
            variant="outline"
            disabled={isWorking || sortedScenes.length === 0}
            title={`Regenerate all ${plural(sortedScenes.length, "image")}?`}
            description="Every saved storyboard image is replaced. Clips already generated from the old images are kept, but may no longer match. Each image spends image credits."
            confirmLabel={`Regenerate ${plural(sortedScenes.length, "image")}`}
            onConfirm={() => generate(sortedScenes)}
          >
            {isWorking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Regenerate all images
          </ConfirmButton>
        )}
      </div>

      {notice && (
        <Alert variant={notice.type === "error" ? "destructive" : "default"}>
          {notice.type === "error" ? <AlertTriangle /> : <Check />}
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}

      <ul className="divide-y divide-border border-y border-border">
        {sortedScenes.map((scene) => {
          const characters = sceneCharacters(scene);
          const busy = Boolean(working[scene.id]);
          return (
            <li key={scene.id} className="grid grid-cols-1 gap-4 py-5 md:grid-cols-[280px_1fr]">
              {scene.storyboard_image_url ? (
                <a
                  href={scene.storyboard_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open the full image in a new tab"
                  className="block overflow-hidden rounded-lg border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={scene.storyboard_image_url} alt={`Storyboard for scene ${scene.scene_number}`} className="aspect-video w-full object-cover" />
                </a>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "No image yet"}
                </div>
              )}

              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-medium text-foreground">
                      Scene {scene.scene_number}: {scene.description || "Untitled"}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {scene.locationName && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {scene.locationName}
                        </span>
                      )}
                      {Array.isArray(scene.beat_numbers) && scene.beat_numbers.length > 0 && (
                        <span>{scene.beat_numbers.length === 1 ? `Beat ${scene.beat_numbers[0]}` : `Beats ${scene.beat_numbers[0]} to ${scene.beat_numbers[scene.beat_numbers.length - 1]}`}</span>
                      )}
                    </div>
                  </div>
                  {scene.storyboard_image_url ? (
                    <ConfirmButton
                      variant="outline"
                      size="sm"
                      disabled={isWorking}
                      title={`Regenerate the image for scene ${scene.scene_number}?`}
                      description="The saved image is replaced. Clips already generated from it are kept, but may no longer match. This spends image credits."
                      confirmLabel="Regenerate image"
                      onConfirm={() => generate([scene])}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Regenerate
                    </ConfirmButton>
                  ) : (
                    <Button size="sm" onClick={() => generate([scene])} disabled={isWorking}>
                      {busy ? <Loader2 className="animate-spin" /> : <ImageIcon />}
                      Generate image
                    </Button>
                  )}
                </div>

                {characters.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {characters.map((character) => (
                      <Badge key={character.id} variant={character.magnific_identifier ? "outline" : "destructive"}>
                        <User />
                        {character.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {sceneErrors[scene.id] && (
                  <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {sceneErrors[scene.id]}
                  </p>
                )}

                <Collapsible>
                  <CollapsibleTrigger
                    render={
                      <Button variant="ghost" size="sm" className="group/trigger -ml-2 text-muted-foreground">
                        Image prompt
                        <ChevronDown className="transition-transform group-data-[panel-open]/trigger:rotate-180" />
                      </Button>
                    }
                  />
                  <CollapsibleContent>
                    <p className="mt-1 max-w-[75ch] whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {scene.storyboard_prompt || scene.description || "No prompt saved."}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </li>
          );
        })}
      </ul>

      {imageCount > 0 && (
        <div className="flex justify-end">
          <ButtonLink href={`/episodes/${storyId}/video`} variant={pendingScenes.length === 0 ? "default" : "outline"}>
            Continue to Video
            <ArrowRight />
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
