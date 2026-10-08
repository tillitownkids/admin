"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronDown, ImageIcon, Loader2, MapPin, Plus, User } from "lucide-react";

import { ButtonLink } from "@/components/ButtonLink";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TakeCountSelect, TakePicker, type Take } from "@/components/TakePicker";
import type { EpisodeLocationRow, SceneRow } from "@/components/episode-production/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import type { GeneratedImageTake } from "@/lib/generatedImageHistory";

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

/**
 * Storyboard images, built from each scene's saved prompt and its reference sheets. Every generated
 * image is kept as a take; the scene uses the one that was chosen.
 */
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
  const [takesPerRun, setTakesPerRun] = useState(1);
  const [progress, setProgress] = useState<string | null>(null);
  const [takesByScene, setTakesByScene] = useState<Record<string, Take[]>>({});
  const [takeBusy, setTakeBusy] = useState<string | null>(null);
  // Prompt edits not saved yet, each remembered with the saved prompt it was started from.
  const [drafts, setDrafts] = useState<Record<string, { source: string; text: string }>>({});
  const [savingPrompt, setSavingPrompt] = useState<string | null>(null);

  const sceneIds = scenes.map((scene) => scene.id).sort().join(",");
  const loadTakes = useCallback(async () => {
    if (!sceneIds) return;
    try {
      const res = await fetch(`/api/generated-image-history?ownerType=scene_storyboard&ownerIds=${sceneIds}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const assets: GeneratedImageTake[] = (await res.json()).assets || [];
      const grouped: Record<string, Take[]> = {};
      for (const asset of assets) {
        (grouped[asset.owner_id] ||= []).push({
          key: asset.id ?? `current-${asset.owner_id}`,
          url: asset.public_url,
          createdAt: asset.created_at,
          inUse: asset.is_selected,
          deletable: asset.id !== null,
        });
      }
      setTakesByScene(grouped);
    } catch (error) {
      // The images in use still show from the scenes themselves; only the other takes are missing.
      console.error("Could not load storyboard takes:", error);
    }
  }, [sceneIds]);

  useEffect(() => {
    (async () => {
      await loadTakes();
    })();
  }, [loadTakes]);

  const sortedScenes = [...scenes].sort((a, b) => a.scene_number - b.scene_number || a.order_index - b.order_index);
  const pendingScenes = sortedScenes.filter((scene) => !scene.storyboard_image_url);
  const imageCount = sortedScenes.length - pendingScenes.length;
  const isWorking = Object.keys(working).length > 0;

  const savedPrompt = (scene: SceneRow) => scene.storyboard_prompt || "";
  // The unsaved edit of a scene's prompt, or null. An edit stops counting once the saved prompt changes under it.
  const draftOf = (scene: SceneRow) => {
    const draft = drafts[scene.id];
    return draft && draft.source === savedPrompt(scene) && draft.text !== draft.source ? draft.text : null;
  };

  const persistPrompt = async (scene: SceneRow, text: string) => {
    const res = await fetch(`/api/scenes/${scene.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyboard_prompt: text }),
    });
    return res.ok;
  };

  const savePrompt = async (scene: SceneRow, text: string) => {
    setSavingPrompt(scene.id);
    setSceneErrors((previous) => ({ ...previous, [scene.id]: "" }));
    try {
      if (!(await persistPrompt(scene, text))) throw new Error("The prompt could not be saved. Try again.");
      await onChanged();
    } catch (error) {
      setSceneErrors((previous) => ({ ...previous, [scene.id]: error instanceof Error ? error.message : "The prompt could not be saved. Try again." }));
    } finally {
      setSavingPrompt(null);
    }
  };

  // The image request: the scene's prompt plus the reference sheet of every character and of its location.
  const buildPayloadItem = (scene: SceneRow, prompt: string) => {
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
      imagePrompt: prompt || scene.description || "",
      references: {
        characters,
        locations: location ? { [location.Location.name]: location.Location.magnific_identifier! } : {},
      },
    };
  };

  // One round: a single request for one image per scene, each saved as a take straight away.
  const generateRound = async (ready: SceneRow[], items: ReturnType<typeof buildPayloadItem>[]) => {
    const res = await fetch(STORYBOARD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenes: items }),
    });
    if (!res.ok) throw new Error(`The image service answered with HTTP ${res.status}.`);
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
    const problems: Record<string, string> = {};
    const matched = new Set<string>();
    for (const [index, item] of returned.entries()) {
      const itemId = item?.id || item?.sceneId || item?.scene_id || item?.result?.id || item?.result?.sceneId;
      const scene = ready.find((candidate) => candidate.id === itemId) || ready[index];
      const url = extractImageUrl(item);
      if (!scene || !url || matched.has(scene.id)) continue;
      matched.add(scene.id);

      const save = await fetch("/api/generated-image-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerType: "scene_storyboard",
          ownerId: scene.id,
          imageUrl: url,
          providerIdentifier: extractMagnificIdentifier(item) || undefined,
          promptUsed: items.find((candidate) => candidate.id === scene.id)?.imagePrompt || "",
        }),
      });
      const result = await save.json().catch(() => ({}));
      if (save.ok) {
        saved += 1;
        if (result.warning) problems[scene.id] = result.warning;
      } else {
        problems[scene.id] = `The image was generated but could not be saved (${result.error || `HTTP ${save.status}`}). Generate it again.`;
      }
    }
    for (const scene of ready) {
      if (!matched.has(scene.id)) problems[scene.id] = "The image service returned no image for this scene. Try again.";
    }
    return { saved, problems };
  };

  // Generates `takesPerRun` takes for each of the given scenes.
  const generate = async (targets: SceneRow[]) => {
    setNotice(null);
    setSceneErrors((previous) => {
      const next = { ...previous };
      targets.forEach((scene) => delete next[scene.id]);
      return next;
    });

    // A scene that cannot be prepared is reported on its own row; the rest still run.
    setWorking(Object.fromEntries(targets.map((scene) => [scene.id, true])));
    const ready: SceneRow[] = [];
    const items: ReturnType<typeof buildPayloadItem>[] = [];
    const blocked: Record<string, string> = {};
    for (const scene of targets) {
      try {
        const draft = draftOf(scene);
        const item = buildPayloadItem(scene, draft ?? savedPrompt(scene));
        if (draft !== null) {
          if (!draft.trim()) throw new Error("The image prompt is empty. Write a prompt, or discard the edit.");
          // An edited prompt is saved before it is used, so the image and the saved prompt always match.
          if (!(await persistPrompt(scene, draft))) throw new Error("The edited prompt could not be saved, so no image was generated. Try again.");
        }
        items.push(item);
        ready.push(scene);
      } catch (error) {
        blocked[scene.id] = error instanceof Error ? error.message : "This scene could not be prepared.";
      }
    }
    if (Object.keys(blocked).length > 0) setSceneErrors((previous) => ({ ...previous, ...blocked }));
    if (ready.length === 0) {
      setWorking({});
      return;
    }

    const expected = ready.length * takesPerRun;
    const hadImage = ready.some((scene) => scene.storyboard_image_url);
    let saved = 0;
    setWorking(Object.fromEntries(ready.map((scene) => [scene.id, true])));
    try {
      for (let round = 1; round <= takesPerRun; round += 1) {
        if (takesPerRun > 1) setProgress(`Generating take ${round} of ${takesPerRun}…`);
        const result = await generateRound(ready, items);
        saved += result.saved;
        if (Object.keys(result.problems).length > 0) setSceneErrors((previous) => ({ ...previous, ...result.problems }));
        // Each round shows as soon as it lands.
        await Promise.all([onChanged(), loadTakes()]);
      }
      const chooseHint = hadImage
        ? " A new take is not used until you choose it."
        : takesPerRun > 1
        ? " Each scene uses its first take until you choose another."
        : "";
      setNotice(
        saved === expected
          ? { type: "success", text: `${plural(saved, "image")} generated and saved.${chooseHint}` }
          : { type: "error", text: `${saved} of ${plural(expected, "image")} generated and saved. The scenes that failed say why.` }
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The images could not be generated.";
      setNotice({ type: "error", text: `${reason} ${saved > 0 ? `${plural(saved, "image")} had already been saved.` : "Nothing was generated."}` });
    } finally {
      setWorking({});
      setProgress(null);
    }
  };

  const chooseTake = async (scene: SceneRow, take: Take) => {
    setTakeBusy(take.key);
    setSceneErrors((previous) => ({ ...previous, [scene.id]: "" }));
    try {
      const res = await fetch(`/api/generated-image-history/${take.key}`, { method: "PATCH" });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || `The take could not be put in use (HTTP ${res.status}).`);
      await Promise.all([onChanged(), loadTakes()]);
      setNotice({
        type: "success",
        text: scene.video_url
          ? `Scene ${scene.scene_number} now uses the chosen image. Its clips were made from another take and may no longer match.`
          : `Scene ${scene.scene_number} now uses the chosen image.`,
      });
    } catch (error) {
      setSceneErrors((previous) => ({ ...previous, [scene.id]: error instanceof Error ? error.message : "The take could not be put in use." }));
    } finally {
      setTakeBusy(null);
    }
  };

  const deleteTake = async (scene: SceneRow, take: Take) => {
    setTakeBusy(take.key);
    setSceneErrors((previous) => ({ ...previous, [scene.id]: "" }));
    try {
      const res = await fetch(`/api/generated-image-history/${take.key}`, { method: "DELETE" });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || `The take could not be deleted (HTTP ${res.status}).`);
      await loadTakes();
    } catch (error) {
      setSceneErrors((previous) => ({ ...previous, [scene.id]: error instanceof Error ? error.message : "The take could not be deleted." }));
    } finally {
      setTakeBusy(null);
    }
  };

  const takeWord = takesPerRun === 1 ? "take" : "takes";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="text-sm text-muted-foreground">
            {imageCount} of {plural(sortedScenes.length, "scene")} {imageCount === 1 ? "has" : "have"} an image.
          </p>
          <TakeCountSelect value={takesPerRun} onChange={setTakesPerRun} disabled={isWorking} />
        </div>
        {pendingScenes.length > 0 ? (
          <ConfirmButton
            disabled={isWorking}
            title={`Generate ${plural(pendingScenes.length * takesPerRun, "storyboard image")}?`}
            description={`${takesPerRun === 1 ? "One image" : `${takesPerRun} takes`} for each of the ${plural(pendingScenes.length, "scene")} that ${pendingScenes.length === 1 ? "has" : "have"} none yet. Each image spends image credits, and the whole run can take several minutes.`}
            confirmLabel={`Generate ${plural(pendingScenes.length * takesPerRun, "image")}`}
            onConfirm={() => generate(pendingScenes)}
          >
            {isWorking ? <Loader2 className="animate-spin" /> : <ImageIcon />}
            Generate remaining images ({pendingScenes.length * takesPerRun})
          </ConfirmButton>
        ) : (
          <ConfirmButton
            variant="outline"
            disabled={isWorking || sortedScenes.length === 0}
            title={`Generate ${plural(sortedScenes.length * takesPerRun, "new take")}?`}
            description={`${takesPerRun === 1 ? "One more take" : `${takesPerRun} more takes`} for each of the ${plural(sortedScenes.length, "scene")}. The images in use stay in use until you choose a different take. Each image spends image credits.`}
            confirmLabel={`Generate ${plural(sortedScenes.length * takesPerRun, "take")}`}
            onConfirm={() => generate(sortedScenes)}
          >
            {isWorking ? <Loader2 className="animate-spin" /> : <Plus />}
            New {takeWord} for every scene
          </ConfirmButton>
        )}
      </div>

      {progress && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" />
          {progress}
        </p>
      )}

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
          const takes = takesByScene[scene.id] || [];
          const draft = draftOf(scene);
          return (
            <li key={scene.id} className="grid grid-cols-1 gap-4 py-5 md:grid-cols-[280px_1fr]">
              {scene.storyboard_image_url ? (
                <a
                  href={scene.storyboard_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open the full image in a new tab"
                  className="block self-start overflow-hidden rounded-lg border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={scene.storyboard_image_url} alt={`Storyboard for scene ${scene.scene_number}`} className="aspect-video w-full object-cover" />
                </a>
              ) : (
                <div className="flex aspect-video items-center justify-center self-start rounded-lg border border-dashed border-border text-xs text-muted-foreground">
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
                    <Button variant="outline" size="sm" onClick={() => generate([scene])} disabled={isWorking}>
                      {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                      {takesPerRun === 1 ? "New take" : `${takesPerRun} new takes`}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => generate([scene])} disabled={isWorking}>
                      {busy ? <Loader2 className="animate-spin" /> : <ImageIcon />}
                      {takesPerRun === 1 ? "Generate image" : `Generate ${takesPerRun} takes`}
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
                        {draft !== null ? "Edit image prompt (not saved)" : "Edit image prompt"}
                        <ChevronDown className="transition-transform group-data-[panel-open]/trigger:rotate-180" />
                      </Button>
                    }
                  />
                  <CollapsibleContent>
                    <div className="mt-1 max-w-[80ch] space-y-2">
                      <Textarea
                        value={draft ?? savedPrompt(scene)}
                        onChange={(event) => setDrafts((previous) => ({ ...previous, [scene.id]: { source: savedPrompt(scene), text: event.target.value } }))}
                        disabled={isWorking || savingPrompt === scene.id}
                        aria-label={`Image prompt for scene ${scene.scene_number}`}
                        placeholder="Describe the storyboard image for this scene"
                        className="max-h-96 leading-relaxed"
                      />
                      {draft !== null ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">Not saved yet. Generating a take saves it first.</p>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={savingPrompt === scene.id}
                              onClick={() => setDrafts((previous) => {
                                const next = { ...previous };
                                delete next[scene.id];
                                return next;
                              })}
                            >
                              Discard
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => savePrompt(scene, draft)} disabled={isWorking || savingPrompt === scene.id || !draft.trim()}>
                              {savingPrompt === scene.id ? <Loader2 className="animate-spin" /> : <Check />}
                              Save prompt
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {savedPrompt(scene)
                            ? "Change the prompt, then generate a new take to see the result. Takes already made are kept."
                            : "No prompt is saved for this scene, so its title is used. Write one to control the image."}
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {takes.length > 1 && (
                <div className="space-y-2 md:col-span-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{takes.length} takes.</span> Clips are generated from the one in use.
                  </p>
                  <TakePicker
                    kind="image"
                    subject={`storyboard image for scene ${scene.scene_number}`}
                    takes={takes}
                    busyKey={takeBusy}
                    disabled={isWorking}
                    onUse={(take) => chooseTake(scene, take)}
                    onDelete={(take) => deleteTake(scene, take)}
                  />
                </div>
              )}
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
