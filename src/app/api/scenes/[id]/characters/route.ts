import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data: sceneCharacters, error } = await supabase
      .from('SceneCharacter')
      .select('*, Character(*)')
      .eq('scene_id', id);

    if (error) throw error;
    return NextResponse.json({ sceneCharacters });
  } catch (error: any) {
    console.error("Error fetching scene characters:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { characterId } = body;

    if (!characterId) {
      return NextResponse.json({ error: 'characterId is required' }, { status: 400 });
    }

    const { data: sceneCharacter, error } = await supabase
      .from('SceneCharacter')
      .insert([{ scene_id: id, character_id: characterId }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ sceneCharacter });
  } catch (error: any) {
    console.error("Error adding scene character:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get('characterId');

    if (!characterId) {
      return NextResponse.json({ error: 'characterId query param is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('SceneCharacter')
      .delete()
      .eq('scene_id', id)
      .eq('character_id', characterId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error removing scene character:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
