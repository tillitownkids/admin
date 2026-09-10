"use server";

import { prisma } from "@/lib/prisma";
import { deleteFullEpisodeVideoFromStorage } from "@/lib/storage";

export interface StitchVideosInput {
  storyId: string;
  title: string;
  videoUrls: string[];
  sceneIds: string[];
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
  } catch (err: any) {
    console.error("Failed to fetch episode videos:", err);
    return { success: false, videos: [], error: err?.message || "Failed to fetch videos" };
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
  } catch (err: any) {
    console.error("Failed to delete video:", err);
    return { success: false, error: err?.message || "Failed to delete video" };
  }
}

export async function stitchEpisodeVideosAction(input: StitchVideosInput) {
  const { storyId, title, videoUrls, sceneIds } = input;

  if (!storyId || !videoUrls || videoUrls.length === 0) {
    return { success: false, error: "No video URLs provided for stitching." };
  }

  const stitcherServiceUrl = process.env.STITCHER_SERVICE_URL || "http://localhost:3001/stitch";
  // Increased timeout limit to 5 minutes (300,000 ms) to accommodate slow renders or Render cold starts
  const timeoutMs = parseInt(process.env.STITCHER_TIMEOUT_MS || "300000", 10);

  try {
    const res = await fetch(stitcherServiceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId, title, videoUrls, sceneIds }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Stitcher service failed (${res.status}): ${errorText || res.statusText}`);
    }

    const data = await res.json();
    const finalVideoUrl = data.videoUrl || data.url;

    if (!finalVideoUrl) {
      throw new Error(data.error || "Stitcher service completed but failed to return a valid video URL.");
    }

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
  } catch (err: any) {
    console.error("Failed to stitch episode videos via microservice:", err);
    return {
      success: false,
      error: err?.message || "Video stitching failed via microservice.",
    };
  }
}
