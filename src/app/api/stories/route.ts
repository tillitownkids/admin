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

    return NextResponse.json({ stories: stories || [] });
  } catch (error: any) {
    console.error("Error fetching stories:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      topic, 
      concept, 
      overview,
      storyOverview, 
      lesson,
      teachLesson, 
      duration,
      episode_number, 
      generation_type, 
      generationType,
      mode, 
      content, 
      contentHtml,
      status 
    } = body;

    const finalTopic = topic || (concept ? (concept.length > 50 ? concept.slice(0, 50) + "..." : concept) : "Bedtime Story");
    const finalContent = content || contentHtml || "";
    const finalGenerationType = generation_type || generationType || "new";
    const finalEpisodeNumber = episode_number ? String(episode_number) : "1";

    const corePayload: any = {
      topic: finalTopic,
      content: finalContent,
      episode_number: finalEpisodeNumber,
      generation_type: finalGenerationType,
      mode: mode || "single",
      status: status || "success",
      generated_at: new Date().toISOString()
    };

    const extendedPayload: any = {
      ...corePayload,
      concept: concept || "",
      storyOverview: storyOverview || overview || "",
      teachLesson: teachLesson || lesson || ""
    };

    let story = null;

    // 1. Try extended Supabase insert
    try {
      const { data, error } = await supabase
        .from('Story')
        .insert([extendedPayload])
        .select()
        .single();
      if (!error && data) {
        story = data;
      }
    } catch (e) {}

    // 2. Fallback to core Supabase insert
    if (!story) {
      try {
        const { data, error } = await supabase
          .from('Story')
          .insert([corePayload])
          .select()
          .single();
        if (!error && data) {
          story = data;
        }
      } catch (e) {}
    }

    // 3. Fallback to Prisma
    if (!story) {
      try {
        story = await prisma.story.create({
          data: extendedPayload as any
        });
      } catch (e) {
        story = await prisma.story.create({
          data: corePayload as any
        });
      }
    }

    return NextResponse.json({ story });
  } catch (error: any) {
    console.error("Error creating story:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
