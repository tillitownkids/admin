import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    let stories;
    try {
      const { data, error } = await supabase
        .from('Story')
        .select('*')
        .order('generated_at', { ascending: false });
      if (!error && data) {
        stories = data;
      }
    } catch (e) {}

    if (!stories) {
      stories = await prisma.story.findMany({
        orderBy: { generated_at: 'desc' }
      });
    }

    return NextResponse.json({ stories });
  } catch (error: any) {
    console.error("Error fetching stories:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topic, concept, storyOverview, teachLesson, episode_number, generation_type, mode, content, status } = body;

    const payload = {
      topic: topic || "",
      concept: concept || "",
      storyOverview: storyOverview || "",
      teachLesson: teachLesson || "",
      episode_number: episode_number?.toString() || "1",
      generation_type: generation_type || "new",
      mode: mode || "single",
      content: content || "",
      status: status || "success"
    };

    let story;
    try {
      const { data, error } = await supabase
        .from('Story')
        .insert([payload])
        .select()
        .single();
      if (!error && data) {
        story = data;
      }
    } catch (e) {}

    if (!story) {
      story = await prisma.story.create({
        data: payload
      });
    }

    return NextResponse.json({ story });
  } catch (error: any) {
    console.error("Error creating story:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
