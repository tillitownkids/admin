import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { stylesheet_prompt, status } = body;

    const updatePayload: Record<string, string> = { updated_at: new Date().toISOString() };
    if (stylesheet_prompt !== undefined) updatePayload.stylesheet_prompt = stylesheet_prompt;
    if (status !== undefined) updatePayload.status = status;

    const { data: episodeLocation, error } = await supabase
      .from('EpisodeLocation')
      .update(updatePayload)
      .eq('id', id)
      .select('*, Location(*)')
      .single();

    if (error) throw error;

    return NextResponse.json({ episodeLocation });
  } catch (error: any) {
    console.error("Error updating episode location:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
