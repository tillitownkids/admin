import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data: story, error } = await supabase.from('Story').select('*').eq('id', id).single();
    if (error || !story) throw new Error(error?.message || 'Story not found');
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

    const { 
      topic, 
      concept, 
      overview, 
      storyOverview, 
      lesson, 
      teachLesson, 
      content, 
      contentHtml, 
      contentText, 
      production_stage, 
      previous_story_id, 
      featuredCharacterIds 
    } = body;

    const updatePayload: Record<string, any> = {};

    if (topic !== undefined) updatePayload.topic = topic;
    if (content !== undefined || contentHtml !== undefined || contentText !== undefined) {
      updatePayload.content = content || contentHtml || contentText;
    }
    if (concept !== undefined) updatePayload.concept = concept;
    if (storyOverview !== undefined || overview !== undefined) {
      updatePayload.storyOverview = storyOverview || overview;
    }
    if (teachLesson !== undefined || lesson !== undefined) {
      updatePayload.teachLesson = teachLesson || lesson;
    }
    if (production_stage !== undefined) updatePayload.production_stage = production_stage;
    if (previous_story_id !== undefined) updatePayload.previous_story_id = previous_story_id;

    let story = null;

    if (Object.keys(updatePayload).length > 0) {
      // 1. Try extended update
      try {
        const { data, error } = await supabase
          .from('Story')
          .update(updatePayload)
          .eq('id', id)
          .select()
          .single();
        if (!error && data) {
          story = data;
        }
      } catch (e) {}

      // 2. Core update fallback
      if (!story) {
        const corePayload: Record<string, any> = {};
        if (updatePayload.topic !== undefined) corePayload.topic = updatePayload.topic;
        if (updatePayload.content !== undefined) corePayload.content = updatePayload.content;

        if (Object.keys(corePayload).length > 0) {
          const { data, error } = await supabase
            .from('Story')
            .update(corePayload)
            .eq('id', id)
            .select()
            .single();
          if (!error && data) story = data;
        }
      }
    }

    if (Array.isArray(featuredCharacterIds)) {
      const { error: deleteError } = await supabase.from('StoryCharacter').delete().eq('story_id', id);
      if (!deleteError && featuredCharacterIds.length > 0) {
        const rows = featuredCharacterIds.map((characterId: string) => ({ story_id: id, character_id: characterId }));
        await supabase.from('StoryCharacter').insert(rows);
      }
    }

    if (!story) {
      const { data } = await supabase.from('Story').select('*').eq('id', id).single();
      story = data;
    }

    return NextResponse.json({ story });
  } catch (error: any) {
    console.error("Error updating story:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
