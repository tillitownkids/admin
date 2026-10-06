"use server";

import { prisma } from "@/lib/prisma";
import { deleteFullEpisodeVideoFromStorage } from "@/lib/storage";
import { DEFAULT_STITCHER_TIMEOUT_MS, describeStitcherError, parseStitcherResponse } from "@/lib/stitcher";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export interface StitchVideosInput {
  storyId: string;
  title: string;
  videoUrls: string[];
  sceneIds: string[];
  /** One label per clip, in the same order as videoUrls, used to name a clip in an error. */
  clipLabels?: string[];
}

export async function getAllEpisodeVideosAction() {
  try {
    const videos = await prisma.video.findMany({
      include: {
        Story: {
          select: {
            topic: true,
            episode_number: true,
          },
        },
        YouTubeUpload: true,
      },
      orderBy: { created_at: "desc" },
    });

    return { success: true, videos };
  } catch (err: unknown) {
    console.error("Failed to fetch stitched videos:", err);
    return {
      success: false,
      videos: [],
      error: getErrorMessage(err, "Failed to fetch stitched videos"),
    };
  }
}

export async function getEpisodeVideosAction(storyId: string) {
  try {
    if (!storyId) {
      return { success: false, error: "Story ID is required" };
    }

    const videos = await prisma.video.findMany({
      where: { story_id: storyId },
      orderBy: { created_at: 'desc' }
    });

    return { success: true, videos };
  } catch (err: unknown) {
    console.error("Failed to fetch episode videos:", err);
    return { success: false, videos: [], error: getErrorMessage(err, "Failed to fetch videos") };
  }
}

export async function deleteEpisodeVideoAction(videoId: string) {
  try {
    if (!videoId) return { success: false, error: "Video ID required" };

    const video = await prisma.video.findUnique({
      where: { id: videoId }
    });

    if (!video) return { success: false, error: "Video not found" };

    if (video.video_url) {
      await deleteFullEpisodeVideoFromStorage(video.video_url);
    }

    await prisma.video.delete({
      where: { id: videoId }
    });

    return { success: true };
  } catch (err: unknown) {
    console.error("Failed to delete video:", err);
    return { success: false, error: getErrorMessage(err, "Failed to delete video") };
  }
}

// The stitcher downloads every clip by its link, so one dead link fails the whole episode.
// Checking first lets the error name the clip instead.
async function unreachableClips(videoUrls: string[], clipLabels?: string[]): Promise<string[]> {
  const results = await Promise.all(videoUrls.map(async (url, index) => {
    const label = clipLabels?.[index] || `Clip ${index + 1}`;
    try {
      const res = await fetch(url, {
        headers: { Range: "bytes=0-0" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      await res.body?.cancel();
      return res.ok ? null : `${label} (HTTP ${res.status})`;
    } catch (err: unknown) {
      return `${label} (${getErrorMessage(err, "unreachable")})`;
    }
  }));
  return results.filter((result): result is string => result !== null);
}

export async function stitchEpisodeVideosAction(input: StitchVideosInput) {
  const { storyId, title, videoUrls, sceneIds, clipLabels } = input;

  if (!storyId || !videoUrls || videoUrls.length === 0) {
    return { success: false, error: "No video URLs provided for stitching." };
  }

  const stitcherServiceUrl = process.env.STITCHER_SERVICE_URL || "http://localhost:3001/stitch";
  const timeoutMs = parseInt(process.env.STITCHER_TIMEOUT_MS || String(DEFAULT_STITCHER_TIMEOUT_MS), 10);

  try {
    const unreachable = await unreachableClips(videoUrls, clipLabels);
    if (unreachable.length > 0) {
      return {
        success: false,
        error: `Nothing was sent to the stitcher because ${unreachable.length === 1 ? "this clip" : "these clips"} could not be downloaded: ${unreachable.join("; ")}. Regenerate ${unreachable.length === 1 ? "it" : "them"} in Video Production.`,
      };
    }

    const res = await fetch(stitcherServiceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId, title, videoUrls, sceneIds }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const finalVideoUrl = parseStitcherResponse(res.status, await res.text());

    const videoRecord = await prisma.video.create({
      data: {
        story_id: storyId,
        title: title || "Full Episode Render",
        video_url: finalVideoUrl,
        scene_ids: sceneIds || [],
        status: "ready",
      },
    });

    return { success: true, video: videoRecord };
  } catch (err: unknown) {
    console.error("Failed to stitch episode videos via microservice:", err);
    return {
      success: false,
      error: describeStitcherError(err, stitcherServiceUrl, timeoutMs),
    };
  }
}
