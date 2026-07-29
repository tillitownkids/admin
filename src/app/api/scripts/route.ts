import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    let scripts;
    try {
      const { data, error } = await supabase
        .from('Script')
        .select('*')
        .order('generated_at', { ascending: false });
      if (!error && data) {
        scripts = data;
      }
    } catch (e) {}

    if (!scripts) {
      scripts = await prisma.script.findMany({
        orderBy: { generated_at: 'desc' }
      });
    }

    return NextResponse.json({ scripts });
  } catch (error: any) {
    console.error("Error fetching scripts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topic, episode_number, generation_type, mode, content, status } = body;

    const formattedContent = typeof content === 'object' ? JSON.stringify(content) : (content || "{}");

    const payload = {
      topic: topic || "",
      episode_number: episode_number?.toString() || "1",
      generation_type: generation_type || "new",
      mode: mode || "single",
      content: formattedContent,
      status: status || "success"
    };

    let script;
    try {
      const { data, error } = await supabase
        .from('Script')
        .insert([payload])
        .select()
        .single();
      if (!error && data) {
        script = data;
      }
    } catch (e) {}

    if (!script) {
      script = await prisma.script.create({
        data: payload
      });
    }

    return NextResponse.json({ script });
  } catch (error: any) {
    console.error("Error creating script:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
