"use server";

import { supabase } from "@/lib/supabase";
import { parseShotPlan, shotTakes } from "@/lib/sceneShots";
import { SCENE_VIDEOS_BUCKET, STORYBOARDS_BUCKET, storageLocationFromUrl } from "@/lib/storage";

// Only a scene's own files are removed. Character and location sheets and stitched episodes live
// in other buckets and are never touched.
const SCENE_BUCKETS = new Set([STORYBOARDS_BUCKET, SCENE_VIDEOS_BUCKET]);

interface SceneAssetsRow {
  id: string;
  storyboard_image_url: string | null;
  video_url: string | null;
  video_prompt: string | null;
}

/**
 * Deletes every scene of an episode with everything generated for it: image prompts, storyboard
 * images and their takes, shot plans, video clips and their takes. Used when the storyboard is
 * planned again, so the new plan starts clean.
 */
export async function resetStoryboardAction(storyId: string): Promise<
  { success: true; deletedScenes: number; deletedFiles: number } | { success: false; error: string }
> {
  if (!storyId) return { success: false, error: "No episode was given." };

  // Scenes belong to the story directly or through one of its locations.
  const { data: locations, error: locationError } = await supabase
    .from("EpisodeLocation").select("id").eq("story_id", storyId);
  if (locationError) return { success: false, error: `The old storyboard could not be read: ${locationError.message}` };
  const locationIds = (locations || []).map((location) => location.id as string);

  const filter = locationIds.length
    ? `story_id.eq.${storyId},episode_location_id.in.(${locationIds.join(",")})`
    : `story_id.eq.${storyId}`;
  const { data: scenes, error: sceneError } = await supabase
    .from("Scene").select("id, storyboard_image_url, video_url, video_prompt").or(filter);
  if (sceneError) return { success: false, error: `The old storyboard could not be read: ${sceneError.message}` };
  const rows = (scenes || []) as SceneAssetsRow[];
  if (!rows.length) return { success: true, deletedScenes: 0, deletedFiles: 0 };
  const sceneIds = rows.map((scene) => scene.id);

  const { data: imageTakes, error: takeError } = await supabase
    .from("ImageAsset").select("public_url, storage_bucket, storage_path")
    .eq("owner_type", "scene_storyboard").in("owner_id", sceneIds);
  if (takeError) return { success: false, error: `The old storyboard images could not be read: ${takeError.message}` };

  // Every stored file of these scenes, by bucket.
  const files = new Map<string, Set<string>>();
  const addFile = (bucket: string | null | undefined, path: string | null | undefined) => {
    if (!bucket || !path || path.startsWith("http") || !SCENE_BUCKETS.has(bucket)) return;
    if (!files.has(bucket)) files.set(bucket, new Set());
    files.get(bucket)!.add(path);
  };
  const addUrl = (url: string | null | undefined) => {
    const location = url ? storageLocationFromUrl(url) : null;
    if (location) addFile(location.bucket, location.path);
  };
  for (const take of imageTakes || []) {
    addFile(take.storage_bucket, take.storage_path);
    addUrl(take.public_url);
  }
  for (const scene of rows) {
    addUrl(scene.storyboard_image_url);
    addUrl(scene.video_url);
    for (const shot of parseShotPlan(scene.video_prompt)?.shots || []) {
      for (const take of shotTakes(shot)) addUrl(take.url);
    }
  }

  // Records first: once they are gone nothing points at the files, even if a file removal fails.
  const { error: deleteTakesError } = await supabase
    .from("ImageAsset").delete().eq("owner_type", "scene_storyboard").in("owner_id", sceneIds);
  if (deleteTakesError) return { success: false, error: `The old storyboard images could not be deleted: ${deleteTakesError.message}` };
  // Deleting a scene also removes its character links.
  const { error: deleteScenesError } = await supabase.from("Scene").delete().in("id", sceneIds);
  if (deleteScenesError) return { success: false, error: `The old scenes could not be deleted: ${deleteScenesError.message}` };

  let deletedFiles = 0;
  for (const [bucket, paths] of files) {
    const { data, error } = await supabase.storage.from(bucket).remove(Array.from(paths));
    if (error) console.error(`Failed to remove old storyboard files from ${bucket}:`, error);
    else deletedFiles += data?.length ?? 0;
  }
  return { success: true, deletedScenes: sceneIds.length, deletedFiles };
}
