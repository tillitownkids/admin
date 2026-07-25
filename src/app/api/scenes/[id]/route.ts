import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { storyboard_prompt, storyboard_status, beats_status, description } = body;

    const updatePayload: Record<string, string> = { updated_at: new Date().toISOString() };
    if (storyboard_prompt !== undefined) updatePayload.storyboard_prompt = storyboard_prompt;
    if (storyboard_status !== undefined) updatePayload.storyboard_status = storyboard_status;
    if (beats_status !== undefined) updatePayload.beats_status = beats_status;
    if (description !== undefined) updatePayload.description = description;

    const { data: scene, error } = await supabase
      .from('Scene')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ scene });
  } catch (error: any) {
    console.error("Error updating scene:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
