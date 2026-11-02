import { supabase } from '@/lib/supabase';
import { processAndUploadSceneVideo } from '@/lib/storage';
import { addShotTake, parseShotPlan, serializeShotPlan, type SceneShotPlan } from '@/lib/sceneShots';

// A clip becomes a take of a sequence's planned clip. Used by the scene PATCH route (generated
// clips), clip uploads and the MCP server (clips Claude made in Magnific).

// The generator's own link is temporary. A clip left on it disappears later and breaks stitching.
export const TEMPORARY_CLIP_WARNING = 'The clip was saved, but copying it to permanent storage failed, so it is on a temporary link that will stop working. Regenerate this clip to store it properly.';

export class ClipTakeError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

/**
 * The sequence's plan with the clip added as a take of the given shot (copied to permanent storage
 * first unless `stored`). Nothing is saved here. A take becomes the clip in use only when the shot
 * has none, so an earlier choice is never replaced.
 */
export async function planWithClipTake(input: {
  sceneId: string;
  videoPrompt: string | null;
  shot: number;
  url: string;
  identifier?: string | null;
  /** The file is already in the scene-clips bucket (an upload). */
  stored?: boolean;
}): Promise<{ plan: SceneShotPlan; warning?: string }> {
  if (typeof input.url !== 'string' || !input.url.startsWith('http')) throw new ClipTakeError('The clip must be a video URL.');
  const plan = parseShotPlan(input.videoPrompt);
  const shot = plan?.shots.find((item) => item.shot === Number(input.shot));
  if (!plan || !shot) throw new ClipTakeError(`The sequence has no planned clip ${input.shot}. Plan the clip first.`);

  const identifier = input.identifier || null;
  let url = input.url;
  let warning: string | undefined;
  if (!input.stored) {
    try {
      // A new file name per generation, so a regenerated clip never reuses a cached URL.
      url = await processAndUploadSceneVideo(input.url, `shot${shot.shot}_${identifier || Date.now()}`, input.sceneId);
    } catch (error) {
      console.warn('Failed to upload a clip to permanent storage, using the original URL:', error);
      warning = TEMPORARY_CLIP_WARNING;
    }
  }
  const take = { url, magnificId: identifier, createdAt: new Date().toISOString() };
  plan.shots = plan.shots.map((item) => (item === shot ? addShotTake(item, take) : item));
  return { plan, warning };
}

/** Adds a clip as a take of the sequence's clip and saves it. */
export async function addClipTake(sceneId: string, url: string, options: { identifier?: string | null; shot?: number; stored?: boolean } = {}) {
  const { data: scene, error } = await supabase.from('Scene').select('id, video_prompt').eq('id', sceneId).maybeSingle();
  if (error) throw new ClipTakeError(error.message, 500);
  if (!scene) throw new ClipTakeError('The sequence no longer exists.', 404);
  const { plan, warning } = await planWithClipTake({
    sceneId, videoPrompt: scene.video_prompt, shot: options.shot ?? 1, url, identifier: options.identifier, stored: options.stored,
  });
  const { error: saveError } = await supabase.from('Scene').update({
    video_prompt: serializeShotPlan(plan),
    // video_url keeps meaning "this sequence has video" for readers that predate shots.
    video_url: plan.shots.find((item) => item.videoUrl)?.videoUrl ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', sceneId);
  if (saveError) throw new ClipTakeError(saveError.message, 500);
  const inUse = plan.shots.find((item) => item.shot === (options.shot ?? 1))?.videoUrl;
  return { plan, warning, inUse };
}
