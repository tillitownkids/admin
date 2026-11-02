"use server";

import { supabase } from "@/lib/supabase";
import { SCENE_VIDEOS_BUCKET } from "@/lib/storage";
import { ClipTakeError, addClipTake } from "@/lib/sceneClips";
import { listPromptVersions, type PromptVersion } from "@/lib/promptHistory";
import { SequenceWriteError, restorePromptVersion, updateSequenceBeats } from "@/lib/sequenceWrites";
import {
  SequenceNoteError,
  addSequenceNote,
  listSequenceNotes,
  setSequenceNoteStatus,
  type NoteKind,
  type NoteStatus,
  type SequenceNote,
} from "@/lib/sequenceNotes";

// Server actions of the Sequence workspace. Writes are recorded as the admin's ("admin" author).

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof SequenceWriteError || error instanceof SequenceNoteError || error instanceof ClipTakeError) {
    return { ok: false, error: error.message };
  }
  console.error(fallback, error);
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

export async function listSequenceNotesAction(filter: { storyId?: string; sceneId?: string }): Promise<Result<{ available: boolean; notes: SequenceNote[] }>> {
  try {
    return { ok: true, ...(await listSequenceNotes(filter)) };
  } catch (error) {
    return failure(error, "Notes could not be loaded.");
  }
}

export async function addSequenceNoteAction(input: { sceneId: string; kind: NoteKind; body: string; mediaUrl?: string | null }): Promise<Result<{ note: SequenceNote }>> {
  try {
    if (!UUID_PATTERN.test(input.sceneId)) return { ok: false, error: "The sequence could not be identified." };
    const kind: NoteKind = input.kind === "note" ? "note" : "issue";
    return { ok: true, note: await addSequenceNote({ ...input, kind, author: "admin" }) };
  } catch (error) {
    return failure(error, "The note could not be saved.");
  }
}

export async function setSequenceNoteStatusAction(noteId: string, status: NoteStatus): Promise<Result<{ note: SequenceNote }>> {
  try {
    return { ok: true, note: await setSequenceNoteStatus(noteId, status === "resolved" ? "resolved" : "open") };
  } catch (error) {
    return failure(error, "The note could not be updated.");
  }
}

export async function listPromptVersionsAction(sceneId: string): Promise<Result<{ available: boolean; versions: PromptVersion[] }>> {
  try {
    return { ok: true, ...(await listPromptVersions(sceneId)) };
  } catch (error) {
    return failure(error, "The history could not be loaded.");
  }
}

export async function restorePromptVersionAction(versionId: string): Promise<Result<{ note?: string }>> {
  try {
    const result = await restorePromptVersion(versionId, "admin");
    return { ok: true, note: result && "scriptNote" in result ? result.scriptNote : undefined };
  } catch (error) {
    return failure(error, "The version could not be restored.");
  }
}

/** Saves a sequence's beats and copies them into the episode's script. */
export async function saveSequenceBeatsAction(sceneId: string, markdown: string): Promise<Result<{ note?: string }>> {
  try {
    const { scriptNote } = await updateSequenceBeats(sceneId, markdown, "admin");
    return { ok: true, note: scriptNote };
  } catch (error) {
    return failure(error, "The beats could not be saved.");
  }
}

const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
const MAX_CLIP_BYTES = 500 * 1024 * 1024;

/**
 * Step 1 of uploading a clip made outside the admin: a one-time link the browser sends the file to
 * directly, so large clips never pass through the server.
 */
export async function startClipUploadAction(sceneId: string, contentType: string, size: number): Promise<Result<{ bucket: string; path: string; token: string }>> {
  if (!UUID_PATTERN.test(sceneId)) return { ok: false, error: "The sequence could not be identified." };
  const ext = VIDEO_TYPES[contentType];
  if (!ext) return { ok: false, error: "Upload an MP4, MOV or WebM clip." };
  if (!(size > 0) || size > MAX_CLIP_BYTES) return { ok: false, error: "The clip must be smaller than 500 MB." };
  const path = `${sceneId}_upload_${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from(SCENE_VIDEOS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: `The upload could not be started: ${error?.message || "no upload link"}.` };
  return { ok: true, bucket: SCENE_VIDEOS_BUCKET, path, token: data.token };
}

/** Step 2: the uploaded file becomes a take of the sequence's clip (and the clip in use if it has none). */
export async function finishClipUploadAction(sceneId: string, path: string): Promise<Result<{ inUse: boolean }>> {
  if (!UUID_PATTERN.test(sceneId) || !new RegExp(`^${sceneId}_upload_\\d+\\.(mp4|mov|webm)$`).test(path)) {
    return { ok: false, error: "The uploaded file does not belong to this sequence." };
  }
  const { data } = supabase.storage.from(SCENE_VIDEOS_BUCKET).getPublicUrl(path);
  const stored = await fetch(data.publicUrl, { method: "HEAD" }).catch(() => null);
  if (!stored?.ok) return { ok: false, error: "The clip did not finish uploading. Try again." };
  try {
    const result = await addClipTake(sceneId, data.publicUrl, { stored: true });
    return { ok: true, inUse: result.inUse === data.publicUrl };
  } catch (error) {
    return failure(error, "The clip was uploaded but could not be saved as a take.");
  }
}
