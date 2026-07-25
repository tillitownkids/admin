import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action, camera, motion, dialogue, sfx } = body;

    const updatePayload: Record<string, string> = { updated_at: new Date().toISOString() };
    if (action !== undefined) updatePayload.action = action;
    if (camera !== undefined) updatePayload.camera = camera;
    if (motion !== undefined) updatePayload.motion = motion;
    if (dialogue !== undefined) updatePayload.dialogue = dialogue;
    if (sfx !== undefined) updatePayload.sfx = sfx;

    const { data: beat, error } = await supabase
      .from('Beat')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ beat });
  } catch (error: any) {
    console.error("Error updating beat:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
