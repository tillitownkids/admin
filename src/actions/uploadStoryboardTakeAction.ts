"use server";

import { supabase } from "@/lib/supabase";
import { STORYBOARDS_BUCKET } from "@/lib/storage";
import { GeneratedImageHistoryError, recordGeneratedImageVersion } from "@/lib/generatedImageHistory";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 25 * 1024 * 1024;

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Step 1 of uploading a storyboard image made outside the app: a one-time link the browser sends the
 * file to directly, so large images never pass through the server (Vercel caps request bodies).
 */
export async function startStoryboardUploadAction(
  sceneId: string,
  contentType: string,
  size: number
): Promise<Result<{ bucket: string; path: string; token: string }>> {
  if (!UUID_PATTERN.test(sceneId)) return { ok: false, error: "The scene could not be identified." };
  const ext = IMAGE_TYPES[contentType];
  if (!ext) return { ok: false, error: "Upload a PNG, JPEG or WebP image." };
  if (!(size > 0) || size > MAX_BYTES) return { ok: false, error: "The image must be smaller than 25 MB." };

  const path = `${sceneId}_upload_${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from(STORYBOARDS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: `The upload could not be started: ${error?.message || "no upload link"}.` };
  return { ok: true, bucket: STORYBOARDS_BUCKET, path, token: data.token };
}

/** Step 2: records the uploaded file as a take of the scene and puts it in use. */
export async function finishStoryboardUploadAction(sceneId: string, path: string): Promise<Result<object>> {
  // Only a file this scene's own upload link created can be recorded.
  if (!UUID_PATTERN.test(sceneId) || !new RegExp(`^${sceneId}_upload_\\d+\\.(png|jpg|webp)$`).test(path)) {
    return { ok: false, error: "The uploaded file does not belong to this scene." };
  }
  const { data } = supabase.storage.from(STORYBOARDS_BUCKET).getPublicUrl(path);
  const stored = await fetch(data.publicUrl, { method: "HEAD" }).catch(() => null);
  if (!stored?.ok) return { ok: false, error: "The image did not finish uploading. Try again." };

  try {
    await recordGeneratedImageVersion({
      ownerType: "scene_storyboard",
      ownerId: sceneId,
      publicUrl: data.publicUrl,
      storagePath: path,
      storageBucket: STORYBOARDS_BUCKET,
      // An uploaded image has no generator reference.
      providerIdentifier: null,
      promptUsed: null,
      use: "always",
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof GeneratedImageHistoryError) return { ok: false, error: error.message };
    console.error("Failed to record an uploaded storyboard image:", error);
    return { ok: false, error: "The image was uploaded but could not be saved as a take. Try again." };
  }
}
