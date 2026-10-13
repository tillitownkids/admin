"use server";

import { supabase } from "@/lib/supabase";
import { normalizeCharacterName } from "@/lib/characterNames";

// The Assets step: the characters, locations and objects (props) an episode uses.

export type AssetType = "character" | "location" | "object";

export interface AssetCard {
  id: string;
  name: string;
  description: string;
  /** The reference sheet in use, else the uploaded reference image. */
  imageUrl: string | null;
  /** Has a generated sheet with its generator reference, which images and clips need. */
  hasSheet: boolean;
  /** Scenes of this episode that use it. */
  sceneCount: number;
  /** Objects only. */
  kind?: "permanent" | "episode";
  suggestPermanent?: boolean;
}

/** A library entry offered by the search. */
export interface LibraryOption {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  hasSheet: boolean;
}

export interface EpisodeAssets {
  characters: AssetCard[];
  locations: AssetCard[];
  objects: AssetCard[];
  /** Library entries not yet in the episode, for the search to attach. */
  available: Record<AssetType, LibraryOption[]>;
}

interface LibraryRow {
  id: string;
  name: string;
  description: string | null;
  generated_image_url: string | null;
  reference_image_url: string | null;
  magnific_identifier: string | null;
  kind?: string;
  story_id?: string | null;
  suggest_permanent?: boolean;
}

function card(row: LibraryRow, sceneCount: number): AssetCard {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    imageUrl: row.generated_image_url || row.reference_image_url || null,
    hasSheet: Boolean(row.magnific_identifier),
    sceneCount,
  };
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function option(row: LibraryRow): LibraryOption {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    imageUrl: row.generated_image_url || row.reference_image_url || null,
    hasSheet: Boolean(row.magnific_identifier),
  };
}

export async function getEpisodeAssetsAction(storyId: string): Promise<{ ok: true; assets: EpisodeAssets } | { ok: false; error: string }> {
  const [cast, places, objectLinks, scenes, characters, locations, objects] = await Promise.all([
    supabase.from("StoryCharacter").select("character_id").eq("story_id", storyId),
    supabase.from("EpisodeLocation").select("id, location_id").eq("story_id", storyId),
    supabase.from("StoryProp").select("prop_id").eq("story_id", storyId),
    supabase.from("Scene").select("id, episode_location_id").eq("story_id", storyId),
    supabase.from("Character").select("id, name, description, generated_image_url, reference_image_url, magnific_identifier"),
    supabase.from("Location").select("id, name, description, generated_image_url, reference_image_url, magnific_identifier"),
    supabase.from("Prop").select("id, name, description, generated_image_url, reference_image_url, magnific_identifier, kind, story_id, suggest_permanent"),
  ]);
  const failed = [cast, places, scenes, characters, locations].find((result) => result.error);
  if (failed?.error) return { ok: false, error: `The episode's assets could not be loaded: ${failed.error.message}` };

  const sceneIds = (scenes.data || []).map((scene) => scene.id as string);
  const [sceneCast, sceneObjects] = sceneIds.length
    ? await Promise.all([
        supabase.from("SceneCharacter").select("character_id").in("scene_id", sceneIds),
        supabase.from("SceneProp").select("prop_id").in("scene_id", sceneIds),
      ])
    : [{ data: [] }, { data: [] }];
  const count = (rows: { [key: string]: unknown }[] | null, key: string, id: string) => (rows || []).filter((row) => row[key] === id).length;

  const castIds = new Set((cast.data || []).map((row) => row.character_id as string));
  const placeByLocation = new Map((places.data || []).map((row) => [row.location_id as string, row.id as string]));
  const objectIds = new Set((objectLinks.data || []).map((row) => row.prop_id as string));
  const allCharacters = (characters.data || []) as LibraryRow[];
  const allLocations = (locations.data || []) as LibraryRow[];
  // Objects are optional: without their tables the step shows none.
  const allObjects = (objects.error ? [] : objects.data || []) as LibraryRow[];

  return {
    ok: true,
    assets: {
      characters: allCharacters.filter((row) => castIds.has(row.id))
        .map((row) => card(row, count(sceneCast.data, "character_id", row.id))).sort(byName),
      locations: allLocations.filter((row) => placeByLocation.has(row.id))
        .map((row) => card(row, count(scenes.data, "episode_location_id", placeByLocation.get(row.id)!))).sort(byName),
      objects: allObjects.filter((row) => objectIds.has(row.id))
        .map((row) => ({
          ...card(row, count(sceneObjects.data, "prop_id", row.id)),
          kind: row.kind === "episode" ? "episode" as const : "permanent" as const,
          suggestPermanent: row.kind === "episode" && Boolean(row.suggest_permanent),
        })).sort(byName),
      available: {
        character: allCharacters.filter((row) => !castIds.has(row.id)).map(option).sort(byName),
        location: allLocations.filter((row) => !placeByLocation.has(row.id)).map(option).sort(byName),
        // Another episode's own objects are not offered; permanent ones are.
        object: allObjects.filter((row) => !objectIds.has(row.id) && row.kind !== "episode").map(option).sort(byName),
      },
    },
  };
}

type Result = { ok: true } | { ok: false; error: string };

/** Adds a library character, location or permanent object to the episode. */
export async function addEpisodeAssetAction(storyId: string, type: AssetType, id: string): Promise<Result> {
  if (type === "character") {
    const { error } = await supabase.from("StoryCharacter").upsert([{ story_id: storyId, character_id: id }], { onConflict: "story_id,character_id" });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  if (type === "location") {
    const { data: existing } = await supabase.from("EpisodeLocation").select("order_index").eq("story_id", storyId);
    const order = Math.max(-1, ...(existing || []).map((row) => Number(row.order_index) || 0)) + 1;
    const { error } = await supabase.from("EpisodeLocation").upsert(
      [{ story_id: storyId, location_id: id, order_index: order }],
      { onConflict: "story_id,location_id", ignoreDuplicates: true },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await supabase.from("StoryProp").upsert([{ story_id: storyId, prop_id: id }], { onConflict: "story_id,prop_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

const TABLE: Record<AssetType, "Character" | "Location" | "Prop"> = { character: "Character", location: "Location", object: "Prop" };

/**
 * Creates a new library character, location or object and attaches it to the episode. A name the
 * library already has (ignoring case and spacing) is attached instead, so no duplicate is made.
 */
export async function createEpisodeAssetAction(
  storyId: string,
  type: AssetType,
  input: { name: string; description: string; kind?: "permanent" | "episode" },
): Promise<{ ok: true; name: string; existed: boolean } | { ok: false; error: string }> {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Give it a name." };

  // Only objects have a kind and an owning episode.
  const { data, error: libraryError } = await supabase.from(TABLE[type]).select(type === "object" ? "id, name, kind, story_id" : "id, name");
  if (libraryError) return { ok: false, error: libraryError.message };
  const library = (data || []) as unknown as { id: string; name: string; kind?: string; story_id?: string | null }[];
  // Another episode's own object with the same name is a different object, so it does not count.
  const same = library.find((row) => normalizeCharacterName(row.name) === normalizeCharacterName(name)
    && !(type === "object" && row.kind === "episode" && row.story_id !== storyId));
  if (same) {
    const attached = await addEpisodeAssetAction(storyId, type, same.id);
    return attached.ok ? { ok: true, name: same.name, existed: true } : attached;
  }

  const kind = type === "object" ? input.kind || "episode" : undefined;
  const row = {
    name,
    description: input.description.trim(),
    ...(type === "object" ? { kind, story_id: kind === "episode" ? storyId : null } : {}),
  };
  const { data: created, error } = await supabase.from(TABLE[type]).insert([row]).select("id").single();
  if (error) return { ok: false, error: error.message };
  const attached = await addEpisodeAssetAction(storyId, type, created.id);
  return attached.ok ? { ok: true, name, existed: false } : attached;
}

/**
 * Removes an asset from the episode. A character or object also leaves this episode's scenes, so its
 * sheet stops going to their images and clips. A location that scenes use is kept, because removing it
 * would delete those scenes. An episode-only object is deleted, since it belongs to no other episode.
 */
export async function removeEpisodeAssetAction(storyId: string, type: AssetType, id: string): Promise<Result> {
  const { data: scenes, error: sceneError } = await supabase.from("Scene").select("id, episode_location_id").eq("story_id", storyId);
  if (sceneError) return { ok: false, error: sceneError.message };
  const sceneIds = (scenes || []).map((scene) => scene.id as string);

  if (type === "location") {
    const { data: link } = await supabase.from("EpisodeLocation").select("id").eq("story_id", storyId).eq("location_id", id).maybeSingle();
    if (!link) return { ok: true };
    const used = (scenes || []).filter((scene) => scene.episode_location_id === link.id).length;
    if (used) return { ok: false, error: `${used} scene${used === 1 ? " is" : "s are"} set in this location, so it stays. Plan the storyboard again without it first.` };
    const { error } = await supabase.from("EpisodeLocation").delete().eq("id", link.id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  if (type === "character") {
    if (sceneIds.length) {
      const { error } = await supabase.from("SceneCharacter").delete().eq("character_id", id).in("scene_id", sceneIds);
      if (error) return { ok: false, error: error.message };
    }
    const { error } = await supabase.from("StoryCharacter").delete().eq("story_id", storyId).eq("character_id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const { data: prop } = await supabase.from("Prop").select("kind, story_id").eq("id", id).maybeSingle();
  if (prop?.kind === "episode" && prop.story_id === storyId) {
    // Its episode and scene links go with it.
    const { error } = await supabase.from("Prop").delete().eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  if (sceneIds.length) {
    const { error } = await supabase.from("SceneProp").delete().eq("prop_id", id).in("scene_id", sceneIds);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await supabase.from("StoryProp").delete().eq("story_id", storyId).eq("prop_id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
