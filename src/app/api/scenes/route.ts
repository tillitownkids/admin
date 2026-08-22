import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const episodeLocationId = searchParams.get('episodeLocationId');
    const storyId = searchParams.get('storyId') || searchParams.get('story_id');

    let query = supabase.from('Scene').select('*').order('order_index', { ascending: true });
    if (episodeLocationId) query = query.eq('episode_location_id', episodeLocationId);
    if (storyId) query = query.eq('story_id', storyId);

    const { data: scenes, error } = await query;
    if (error) throw error;
    return NextResponse.json({ scenes });
  } catch (error: any) {
    console.error("Error fetching scenes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { episodeLocationId, storyId, items } = body as {
      episodeLocationId: string;
      storyId?: string;
      items: { scene_number: number; description: string; order_index: number; story_id?: string }[];
    };

    if (!episodeLocationId || !items?.length) {
      return NextResponse.json({ error: 'episodeLocationId and items are required' }, { status: 400 });
    }

    const rows = items.map((item) => ({
      story_id: storyId || item.story_id || null,
      episode_location_id: episodeLocationId,
      scene_number: item.scene_number,
      description: item.description,
      order_index: item.order_index,
    }));

    const { data: scenes, error } = await supabase
      .from('Scene')
      .insert(rows)
      .select();

    if (error) throw error;

    return NextResponse.json({ scenes });
  } catch (error: any) {
    console.error("Error creating scenes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
