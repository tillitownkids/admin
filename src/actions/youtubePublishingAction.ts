"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  getYouTubeVideoStatus,
  revokeYouTubeToken,
  uploadVideoToYouTube,
} from "@/lib/youtube";

type PrivacyStatus = "private" | "unlisted" | "public";

export interface PublishVideoInput {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: PrivacyStatus;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function validatePublishInput(input: PublishVideoInput) {
  const title = input.title.trim();
  const description = input.description.trim();
  const tags = input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 30);
  const allowedPrivacy: PrivacyStatus[] = ["private", "unlisted", "public"];

  if (!input.videoId) throw new Error("A stitched video is required.");
  if (!title) throw new Error("Video title is required.");
  if (title.length > 100) throw new Error("YouTube titles cannot exceed 100 characters.");
  if (description.length > 5000) throw new Error("YouTube descriptions cannot exceed 5,000 characters.");
  if (!allowedPrivacy.includes(input.privacyStatus)) throw new Error("Invalid privacy setting.");

  return {
    ...input,
    title,
    description,
    tags,
    categoryId: input.categoryId.trim() || "1",
  };
}

export async function publishVideoToYouTubeAction(rawInput: PublishVideoInput) {
  let uploadId: string | null = null;

  try {
    const user = await getAuthenticatedUser();
    if (!user) return { success: false, error: "You must be signed in." };

    const input = validatePublishInput(rawInput);
    const [connection, video] = await Promise.all([
      prisma.youTubeConnection.findUnique({ where: { id: "primary" } }),
      prisma.video.findUnique({ where: { id: input.videoId } }),
    ]);

    if (!connection) return { success: false, error: "Connect a YouTube channel first." };
    if (connection.channel_id !== input.channelId) return { success: false, error: "The connected channel changed. Refresh the page and review the upload again." };
    if (!video) return { success: false, error: "The stitched video no longer exists." };
    const existingUpload = await prisma.youTubeUpload.findUnique({
      where: { video_id_channel_id: { video_id: video.id, channel_id: connection.channel_id } },
    });
    if (existingUpload?.youtube_video_id) {
      return { success: false, error: "This stitched video has already been uploaded to YouTube." };
    }
    if (existingUpload && ["queued", "uploading", "processing", "published"].includes(existingUpload.status)) {
      return { success: false, error: "This video already has an active YouTube upload." };
    }

    const upload = await prisma.$transaction(async (tx) => {
      const current = await tx.youTubeUpload.findUnique({
        where: { video_id_channel_id: { video_id: video.id, channel_id: connection.channel_id } },
      });
      if (current && (current.youtube_video_id || current.status !== "failed")) {
        throw new Error("This video already has an upload on this channel. Refresh the page.");
      }
      return tx.youTubeUpload.upsert({
      where: { video_id_channel_id: { video_id: video.id, channel_id: connection.channel_id } },
      create: {
        video_id: video.id,
        channel_id: connection.channel_id,
        title: input.title,
        description: input.description,
        tags: input.tags,
        category_id: input.categoryId,
        privacy_status: input.privacyStatus,
        made_for_kids: input.madeForKids,
        contains_synthetic_media: input.containsSyntheticMedia,
        status: "uploading",
        progress: 0,
        accepted_by: user.id,
      },
      update: {
        title: input.title,
        description: input.description,
        tags: input.tags,
        category_id: input.categoryId,
        privacy_status: input.privacyStatus,
        made_for_kids: input.madeForKids,
        contains_synthetic_media: input.containsSyntheticMedia,
        status: "uploading",
        progress: 0,
        error_message: null,
        accepted_by: user.id,
        updated_at: new Date(),
      },
      });
    }, { isolationLevel: "Serializable" });
    uploadId = upload.id;

    let lastSavedProgress = 0;
    const youtubeVideo = await uploadVideoToYouTube({
      refreshToken: connection.refresh_token,
      sourceUrl: video.video_url,
      title: input.title,
      description: input.description,
      tags: input.tags,
      categoryId: input.categoryId,
      privacyStatus: input.privacyStatus,
      madeForKids: input.madeForKids,
      containsSyntheticMedia: input.containsSyntheticMedia,
      onProgress: (progress) => {
        if (progress - lastSavedProgress < 10) return;
        lastSavedProgress = progress;
        void prisma.youTubeUpload.update({
          where: { id: upload.id },
          data: { progress, updated_at: new Date() },
        }).catch((error) => console.error("Failed to save YouTube upload progress:", error));
      },
    });

    await prisma.youTubeUpload.update({
      where: { id: upload.id },
      data: {
        youtube_video_id: youtubeVideo.id,
        youtube_url: youtubeVideo.url,
        status: "processing",
        progress: 100,
        error_message: null,
        uploaded_at: new Date(),
        updated_at: new Date(),
      },
    });

    revalidatePath("/video-approval");
    return { success: true, youtubeUrl: youtubeVideo.url };
  } catch (error) {
    const message = errorMessage(error, "YouTube upload failed.");
    console.error("YouTube upload failed:", error);

    if (uploadId) {
      await prisma.youTubeUpload.update({
        where: { id: uploadId },
        data: {
          status: "failed",
          error_message: message,
          updated_at: new Date(),
        },
      }).catch((updateError) => console.error("Failed to save YouTube upload error:", updateError));
    }

    revalidatePath("/video-approval");
    return { success: false, error: message };
  }
}

export async function refreshYouTubeUploadStatusAction(uploadId: string) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { success: false, error: "You must be signed in." };

    const [connection, upload] = await Promise.all([
      prisma.youTubeConnection.findUnique({ where: { id: "primary" } }),
      prisma.youTubeUpload.findUnique({ where: { id: uploadId } }),
    ]);

    if (!connection) return { success: false, error: "YouTube is not connected." };
    if (!upload?.youtube_video_id) return { success: false, error: "This upload has no YouTube video ID." };
    if (upload.channel_id !== connection.channel_id) {
      return { success: false, error: "Connect the channel that owns this upload to refresh its status." };
    }

    const status = await getYouTubeVideoStatus(connection.refresh_token, upload.youtube_video_id, upload.channel_id);
    if (!status || status.uploadStatus === "deleted") {
      // The SDK verified the token's channel before looking up the video.
      // Compare the saved ID as well so a stale refresh cannot reset a new upload.
      await prisma.youTubeUpload.updateMany({
        where: { id: upload.id, channel_id: upload.channel_id, youtube_video_id: upload.youtube_video_id },
        data: {
          status: "failed",
          youtube_video_id: null,
          youtube_url: null,
          uploaded_at: null,
          progress: 0,
          error_message: "This video is no longer available on its YouTube channel. You can upload it again.",
          updated_at: new Date(),
        },
      });
      revalidatePath("/video-approval");
      return { success: true, status: "failed" };
    }
    const failed = status.processingStatus === "failed" || status.processingStatus === "terminated" || status.uploadStatus === "failed" || status.uploadStatus === "rejected";
    const published = status.processingStatus === "succeeded" || status.uploadStatus === "processed";

    await prisma.youTubeUpload.update({
      where: { id: upload.id },
      data: {
        status: failed ? "failed" : published ? "published" : "processing",
        error_message: failed ? status.failureReason || "YouTube processing failed." : null,
        updated_at: new Date(),
      },
    });

    revalidatePath("/video-approval");
    return { success: true, status: failed ? "failed" : published ? "published" : "processing" };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not refresh YouTube status.") };
  }
}

export async function disconnectYouTubeAction() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return { success: false, error: "You must be signed in." };

    const connection = await prisma.youTubeConnection.findUnique({ where: { id: "primary" } });
    if (!connection) return { success: true };

    await revokeYouTubeToken(connection.refresh_token).catch((error) => {
      console.warn("Google token revocation failed; removing the local connection:", error);
    });
    await prisma.youTubeConnection.delete({ where: { id: "primary" } });
    revalidatePath("/video-approval");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not disconnect YouTube.") };
  }
}
