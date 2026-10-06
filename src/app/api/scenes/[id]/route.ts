import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { prisma } from '@/lib/prisma';

import { processAndUploadStoryboardImage, processAndUploadSceneVideo } from '@/lib/storage';
import { parseShotPlan, serializeShotPlan } from '@/lib/sceneShots';

// The generator's own link is temporary. A clip left on it disappears later and breaks stitching.
const TEMPORARY_CLIP_WARNING = 'The clip was saved, but copying it to permanent storage failed, so it is on a temporary link that will stop working. Regenerate this clip to store it properly.';

async function loadVideoPrompt(id: string): Promise<string | null> {
  const { data, error } = await supabase.from('Scene').select('video_prompt').eq('id', id).maybeSingle();
  if (!error && data) return data.video_prompt;
  const scene = await prisma.scene.findUnique({ where: { id }, select: { video_prompt: true } });
  return scene?.video_prompt ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      storyboard_prompt,
      storyboard_image_url,
      storyboard_status,
      beats_status,
      description,
      magnific_identifier,
      video_prompt,
      video_url,
      video_magnific_identifier,
      script_beats,
      beat_numbers,
      shot_clip,
    } = body;

    const updatePayload: Record<string, any> = { updated_at: new Date() };
    let warning: string | undefined;
    if (storyboard_prompt !== undefined) updatePayload.storyboard_prompt = storyboard_prompt;
    if (script_beats !== undefined) updatePayload.script_beats = script_beats;
    if (beat_numbers !== undefined) updatePayload.beat_numbers = beat_numbers;

    if (storyboard_image_url !== undefined) {
      let permanentUrl = storyboard_image_url;
      if (storyboard_image_url && typeof storyboard_image_url === 'string' && storyboard_image_url.startsWith('http')) {
        try {
          permanentUrl = await processAndUploadStoryboardImage(storyboard_image_url, magnific_identifier, id);
        } catch (err) {
          console.warn('Failed to upload storyboard image to permanent storage, using original URL:', err);
        }
      }
      updatePayload.storyboard_image_url = permanentUrl;
    }

    if (storyboard_status !== undefined) updatePayload.storyboard_status = storyboard_status;
    if (beats_status !== undefined) updatePayload.beats_status = beats_status;
    if (description !== undefined) updatePayload.description = description;
    if (magnific_identifier !== undefined) updatePayload.magnific_identifier = magnific_identifier;
    if (video_prompt !== undefined) updatePayload.video_prompt = video_prompt;

    if (video_url !== undefined) {
      let permanentVideoUrl = video_url;
      if (video_url && typeof video_url === 'string' && video_url.startsWith('http')) {
        try {
          permanentVideoUrl = await processAndUploadSceneVideo(video_url, video_magnific_identifier, id);
        } catch (err) {
          console.warn('Failed to upload scene video to permanent storage, using original URL:', err);
          warning = TEMPORARY_CLIP_WARNING;
        }
      }
      updatePayload.video_url = permanentVideoUrl;
    }

    // In a shot clip update the identifier belongs to the shot, not to the scene's unique column.
    if (video_magnific_identifier !== undefined && shot_clip === undefined) updatePayload.video_magnific_identifier = video_magnific_identifier;

    // One generated shot clip. It is merged into the scene's shot plan here, on the
    // server, so each save starts from the stored plan rather than a client copy.
    if (shot_clip !== undefined) {
      const clipUrl = shot_clip?.video_url;
      if (typeof clipUrl !== 'string' || !clipUrl.startsWith('http')) {
        return NextResponse.json({ error: 'shot_clip.video_url must be a video URL.' }, { status: 400 });
      }
      const plan = parseShotPlan(await loadVideoPrompt(id));
      const shot = plan?.shots.find((item) => item.shot === Number(shot_clip.shot));
      if (!plan || !shot) {
        return NextResponse.json({ error: `Scene has no planned shot ${shot_clip?.shot}.` }, { status: 400 });
      }

      const clipIdentifier = shot_clip.video_magnific_identifier || null;
      let permanentClipUrl = clipUrl;
      try {
        // A new file name per generation, so a regenerated clip never reuses a cached URL.
        permanentClipUrl = await processAndUploadSceneVideo(clipUrl, `shot${shot.shot}_${clipIdentifier || Date.now()}`, id);
      } catch (err) {
        console.warn('Failed to upload shot clip to permanent storage, using original URL:', err);
        warning = TEMPORARY_CLIP_WARNING;
      }
      shot.videoUrl = permanentClipUrl;
      shot.magnificId = clipIdentifier;
      updatePayload.video_prompt = serializeShotPlan(plan);
      // video_url keeps meaning "this scene has video" for readers that predate shots.
      updatePayload.video_url = plan.shots.find((item) => item.videoUrl)?.videoUrl ?? null;
    }




    let scene: any = null;

    // 1. Try Prisma update first
    try {
      scene = await prisma.scene.update({
        where: { id },
        data: updatePayload,
      });
    } catch (e) {
      console.warn('Prisma update failed, attempting Supabase fallback for scene:', id, e);
    }

    // 2. Try Supabase update fallback
    if (!scene) {
      const supabasePayload = {
        ...updatePayload,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('Scene')
        .update(supabasePayload)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        scene = data;
      } else if (error) {
        console.error('Supabase update scene error:', error);
      }
    }

    if (!scene) {
      throw new Error(`Failed to update scene ${id}`);
    }

    return NextResponse.json({ scene, warning });
  } catch (error: any) {
    console.error("Error updating scene:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
