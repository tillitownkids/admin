"use server";

import { prisma } from "@/lib/prisma";
import { uploadFullEpisodeVideo, deleteFullEpisodeVideoFromStorage } from "@/lib/storage";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

function getFfmpegPath(): string {
  if (process.env.FFMPEG_PATH) {
    return process.env.FFMPEG_PATH;
  }
  try {
    // eval('require') avoids Next.js Turbopack bundling errors for dynamic binary paths
    const installer = eval("require")("@ffmpeg-installer/ffmpeg");
    if (installer?.path) {
      return installer.path;
    }
  } catch (err) {
    console.warn("Could not resolve @ffmpeg-installer/ffmpeg dynamically:", err);
  }
  return "ffmpeg";
}

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

  const tempDir = path.join(/*turbopackIgnore: true*/ os.tmpdir(), `ffmpeg_stitch_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const outputFile = path.join(/*turbopackIgnore: true*/ tempDir, `stitched_${Date.now()}.mp4`);

  try {
    // Construct FFmpeg arguments with direct Supabase HTTPS URLs
    const ffmpegArgs: string[] = ['-y'];

    for (const url of videoUrls) {
      ffmpegArgs.push('-i', url);
    }

    const n = videoUrls.length;
    // Construct filter_complex stream concatenation including video and audio streams
    let filterString = '';
    for (let i = 0; i < n; i++) {
      filterString += `[${i}:v][${i}:a]`;
    }
    filterString += `concat=n=${n}:v=1:a=1[outv][outa]`;

    ffmpegArgs.push('-filter_complex', filterString);
    ffmpegArgs.push('-map', '[outv]');
    ffmpegArgs.push('-map', '[outa]');
    ffmpegArgs.push('-c:v', 'libx264');
    ffmpegArgs.push('-preset', 'fast');
    ffmpegArgs.push('-crf', '22');
    ffmpegArgs.push('-c:a', 'aac');
    ffmpegArgs.push('-b:a', '192k');
    ffmpegArgs.push('-pix_fmt', 'yuv420p');
    ffmpegArgs.push(outputFile);

    // Spawn FFmpeg binary process
    await new Promise<void>((resolve, reject) => {
      const ffmpegProc = spawn(getFfmpegPath(), ffmpegArgs, {
        windowsHide: true,
      });

      let stderrLogs = '';

      ffmpegProc.stderr.on('data', (data) => {
        stderrLogs += data.toString();
      });

      ffmpegProc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          console.error("FFmpeg process failed:", stderrLogs);
          reject(new Error(`FFmpeg exited with code ${code}. ${stderrLogs.slice(-300)}`));
        }
      });

      ffmpegProc.on('error', (err) => {
        reject(err);
      });
    });

    if (!fs.existsSync(outputFile)) {
      throw new Error("FFmpeg completed but output MP4 file was not generated.");
    }

    const outputBuffer = fs.readFileSync(outputFile);

    // Upload stitched video to Supabase Storage
    const publicUrl = await uploadFullEpisodeVideo(outputBuffer, storyId, title);

    // Save record to database Video table
    const videoRecord = await prisma.video.create({
      data: {
        story_id: storyId,
        title: title || "Full Episode Render",
        video_url: publicUrl,
        scene_ids: sceneIds || [],
        status: "ready",
      }
    });

    return { success: true, video: videoRecord };
  } catch (err: any) {
    console.error("Failed to stitch episode videos:", err);
    return { success: false, error: err?.message || "Failed to stitch episode videos." };
  } finally {
    // Instant cleanup: Delete temporary local files
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanErr) {
      console.warn("Temp folder cleanup warning:", cleanErr);
    }
  }
}
