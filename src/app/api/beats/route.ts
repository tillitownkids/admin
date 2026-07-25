import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sceneId = searchParams.get('sceneId');

    let query = supabase.from('Beat').select('*').order('order_index', { ascending: true });
    if (sceneId) query = query.eq('scene_id', sceneId);

    const { data: beats, error } = await query;
    if (error) throw error;
    return NextResponse.json({ beats });
  } catch (error: any) {
    console.error("Error fetching beats:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sceneId, items } = body as {
      sceneId: string;
      items: {
        beat_number: number;
        action: string;
        camera: string;
        motion: string;
        dialogue: string;
        sfx: string;
        order_index: number;
      }[];
    };

    if (!sceneId || !items?.length) {
      return NextResponse.json({ error: 'sceneId and items are required' }, { status: 400 });
    }

    const rows = items.map((item) => ({
      scene_id: sceneId,
      beat_number: item.beat_number,
      action: item.action || '',
      camera: item.camera || '',
      motion: item.motion || '',
      dialogue: item.dialogue || '',
      sfx: item.sfx || '',
      order_index: item.order_index,
    }));

    const { data: beats, error } = await supabase
      .from('Beat')
      .insert(rows)
      .select();

    if (error) throw error;

    return NextResponse.json({ beats });
  } catch (error: any) {
    console.error("Error creating beats:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
