import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data: story, error } = await supabase.from('Story').select('*').eq('id', id).single();
    if (error) throw error;
    return NextResponse.json({ story });
  } catch (error: any) {
    console.error("Error fetching story:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { production_stage, previous_story_id, featuredCharacterIds } = body;

    const updatePayload: Record<string, string | null> = {};
    if (production_stage !== undefined) updatePayload.production_stage = production_stage;
    if (previous_story_id !== undefined) updatePayload.previous_story_id = previous_story_id;

    let story = null;
    if (Object.keys(updatePayload).length > 0) {
      const { data, error } = await supabase
        .from('Story')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      story = data;
    }

    if (Array.isArray(featuredCharacterIds)) {
      const { error: deleteError } = await supabase.from('StoryCharacter').delete().eq('story_id', id);
      if (deleteError) throw deleteError;
      if (featuredCharacterIds.length > 0) {
        const rows = featuredCharacterIds.map((characterId: string) => ({ story_id: id, character_id: characterId }));
        const { error: joinError } = await supabase.from('StoryCharacter').insert(rows);
        if (joinError) throw joinError;
      }
    }

    if (!story) {
      const { data, error } = await supabase.from('Story').select('*').eq('id', id).single();
      if (error) throw error;
      story = data;
    }

    return NextResponse.json({ story });
  } catch (error: any) {
    console.error("Error updating story:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
