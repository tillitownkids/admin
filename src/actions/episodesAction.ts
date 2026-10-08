"use server";

import { supabase } from "@/lib/supabase";
import { episodeTitle, type EpisodeProgress } from "@/lib/episodeSteps";
import { sceneClips } from "@/lib/sceneShots";

export interface EpisodeSummary {
  id: string;
  title: string;
  /** Position by creation date, oldest first. Stories all carry episode_number "1". */
  number: number;
  updatedAt: string;
  scriptId: string | null;
  progress: EpisodeProgress;
}

interface StoryRow { id: string; topic: string | null; content?: string | null; generated_at: string }
interface ScriptRow { id: string; story_id: string | null; generated_at: string }
interface SceneRow {
  story_id: string | null;
  storyboard_image_url: string | null;
  video_url: string | null;
  video_prompt: string | null;
  updated_at: string;
}
interface VideoRow { id: string; story_id: string | null; created_at: string | null }
interface UploadRow { video_id: string; status: string }

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as T[];
}

function summarize(
  stories: StoryRow[],
  scripts: ScriptRow[],
  scenes: SceneRow[],
  videos: VideoRow[],
  uploads: UploadRow[],
): EpisodeSummary[] {
  const publishedVideoIds = new Set(uploads.filter((upload) => upload.status === "published").map((upload) => upload.video_id));
  const oldestFirst = [...stories].sort((a, b) => a.generated_at.localeCompare(b.generated_at));

  return oldestFirst.map((story, index) => {
    // Scripts arrive newest first, so the first match is the current script.
    const script = scripts.find((item) => item.story_id === story.id) || null;
    const storyScenes = scenes.filter((scene) => scene.story_id === story.id);
    const storyVideos = videos.filter((video) => video.story_id === story.id);
    const lastChange = [
      story.generated_at,
      script?.generated_at,
      ...storyScenes.map((scene) => scene.updated_at),
      ...storyVideos.map((video) => video.created_at),
    ].filter((value): value is string => Boolean(value)).sort().pop()!;

    return {
      id: story.id,
      title: episodeTitle(story),
      number: index + 1,
      updatedAt: lastChange,
      scriptId: script?.id ?? null,
      progress: {
        hasScript: Boolean(script),
        scenes: storyScenes.length,
        scenesWithImage: storyScenes.filter((scene) => scene.storyboard_image_url).length,
        scenesWithClip: storyScenes.filter((scene) => sceneClips(scene).clips.length > 0).length,
        stitchedVideos: storyVideos.length,
        publishedVideos: storyVideos.filter((video) => publishedVideoIds.has(video.id)).length,
      },
    };
  });
}

async function loadEpisodes(storyId?: string): Promise<EpisodeSummary[]> {
  // Numbering needs every story, so stories are never filtered; the rest is.
  let scriptQuery = supabase.from("Script").select("id,story_id,generated_at").order("generated_at", { ascending: false });
  let sceneQuery = supabase.from("Scene").select("story_id,storyboard_image_url,video_url,video_prompt,updated_at");
  let videoQuery = supabase.from("Video").select("id,story_id,created_at");
  if (storyId) {
    scriptQuery = scriptQuery.eq("story_id", storyId);
    sceneQuery = sceneQuery.eq("story_id", storyId);
    videoQuery = videoQuery.eq("story_id", storyId);
  }
  const [stories, scripts, scenes, videos] = await Promise.all([
    rows<StoryRow>(supabase.from("Story").select(storyId ? "id,topic,generated_at" : "id,topic,content,generated_at")),
    rows<ScriptRow>(scriptQuery),
    rows<SceneRow>(sceneQuery),
    rows<VideoRow>(videoQuery),
  ]);
  const uploads = videos.length
    ? await rows<UploadRow>(supabase.from("YouTubeUpload").select("video_id,status").in("video_id", videos.map((video) => video.id)))
    : [];
  if (storyId) {
    const [own] = await rows<{ id: string; content: string | null }>(supabase.from("Story").select("id,content").eq("id", storyId));
    const story = stories.find((item) => item.id === storyId);
    if (story && own) story.content = own.content;
  }
  return summarize(stories, scripts, scenes, videos, uploads);
}

/** Every episode with where it stands, most recently changed first. */
export async function getEpisodesAction(): Promise<{ success: true; episodes: EpisodeSummary[] } | { success: false; error: string }> {
  try {
    const episodes = await loadEpisodes();
    return { success: true, episodes: episodes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
  } catch (error) {
    console.error("Error loading episodes:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not load episodes." };
  }
}

export interface EpisodeDetail extends EpisodeSummary {
  characters: { id: string; name: string; hasReference: boolean }[];
  locations: { id: string; name: string; hasReference: boolean }[];
}

/** One episode, plus the cast and locations its steps draw on. */
export async function getEpisodeAction(storyId: string): Promise<{ success: true; episode: EpisodeDetail } | { success: false; error: string }> {
  try {
    const episode = (await loadEpisodes(storyId)).find((item) => item.id === storyId);
    if (!episode) return { success: false, error: "This episode no longer exists." };

    const [cast, places] = await Promise.all([
      rows<{ Character: { id: string; name: string; magnific_identifier: string | null } | null }>(
        supabase.from("StoryCharacter").select("Character(id,name,magnific_identifier)").eq("story_id", storyId)
      ),
      rows<{ Location: { id: string; name: string; magnific_identifier: string | null } | null }>(
        supabase.from("EpisodeLocation").select("Location(id,name,magnific_identifier)").eq("story_id", storyId).order("order_index", { ascending: true })
      ),
    ]);

    return {
      success: true,
      episode: {
        ...episode,
        characters: cast.flatMap((row) => (row.Character ? [{ id: row.Character.id, name: row.Character.name, hasReference: Boolean(row.Character.magnific_identifier) }] : [])),
        locations: places.flatMap((row) => (row.Location ? [{ id: row.Location.id, name: row.Location.name, hasReference: Boolean(row.Location.magnific_identifier) }] : [])),
      },
    };
  } catch (error) {
    console.error("Error loading episode:", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not load this episode." };
  }
}
