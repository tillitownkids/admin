"use server";

import { supabase } from "@/lib/supabase";
import { FULL_EPISODES_BUCKET, storageLocationFromUrl } from "@/lib/storage";
import { resetStoryboardAction } from "@/actions/resetStoryboardAction";

/**
 * Deletes an episode with everything made for it: scenes with their images, clips and takes (rows and
 * files), stitched episodes and their files, its script, and its episode-only objects. Library
 * characters, locations and permanent objects are kept, and a video already published to YouTube stays
 * there.
 */
export async function deleteEpisodeAction(storyId: string): Promise<{ success: true } | { success: false; error: string }> {
  if (!storyId) return { success: false, error: "No episode was given." };

  // Scenes first, with their stored images and clips.
  const scenes = await resetStoryboardAction(storyId);
  if (!scenes.success) return { success: false, error: scenes.error };

  // Stitched episode files; their rows go with the story.
  const { data: videos, error: videoError } = await supabase.from("Video").select("video_url").eq("story_id", storyId);
  if (videoError) return { success: false, error: `The stitched episodes could not be read: ${videoError.message}` };
  const paths = (videos || []).flatMap((video) => {
    const location = video.video_url ? storageLocationFromUrl(video.video_url) : null;
    return location?.bucket === FULL_EPISODES_BUCKET ? [location.path] : [];
  });
  if (paths.length) {
    const { error } = await supabase.storage.from(FULL_EPISODES_BUCKET).remove(paths);
    if (error) console.error("Failed to remove stitched episode files:", error);
  }

  // A later episode that continues this one keeps its own story, without the link back.
  const { error: unlinkError } = await supabase.from("Story").update({ previous_story_id: null }).eq("previous_story_id", storyId);
  if (unlinkError) return { success: false, error: `Episodes continuing this one could not be unlinked: ${unlinkError.message}` };

  // The rest goes with the story: script, cast and location links, stitched episodes and their
  // YouTube upload records, object links and episode-only objects.
  const { error } = await supabase.from("Story").delete().eq("id", storyId);
  if (error) return { success: false, error: `The episode could not be deleted: ${error.message}` };
  return { success: true };
}
