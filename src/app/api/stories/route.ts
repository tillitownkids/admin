import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { data: stories, error } = await supabase
      .from('Story')
      .select('*')
      .order('generated_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ stories });
  } catch (error: any) {
    console.error("Error fetching stories:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topic, episode_number, generation_type, mode, content, status } = body;

    const { data: story, error } = await supabase
      .from('Story')
      .insert([
        {
          topic: topic || "",
          episode_number: episode_number?.toString() || "1",
          generation_type: generation_type || "new",
          mode: mode || "single",
          content: content || "",
          status: status || "success"
        }
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ story });
  } catch (error: any) {
    console.error("Error creating story:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
