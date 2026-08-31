import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { prisma } from '@/lib/prisma';

import { processAndUploadStoryboardImage, processAndUploadSceneVideo } from '@/lib/storage';

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
    } = body;

    const updatePayload: Record<string, any> = { updated_at: new Date() };
    if (storyboard_prompt !== undefined) updatePayload.storyboard_prompt = storyboard_prompt;

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
        }
      }
      updatePayload.video_url = permanentVideoUrl;
    }

    if (video_magnific_identifier !== undefined) updatePayload.video_magnific_identifier = video_magnific_identifier;




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

    return NextResponse.json({ scene });
  } catch (error: any) {
    console.error("Error updating scene:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
