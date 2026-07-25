import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get('storyId');

    let query = supabase.from('EpisodeLocation').select('*, Location(*)').order('order_index', { ascending: true });
    if (storyId) query = query.eq('story_id', storyId);

    const { data: episodeLocations, error } = await query;
    if (error) throw error;
    return NextResponse.json({ episodeLocations });
  } catch (error: any) {
    console.error("Error fetching episode locations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storyId, items } = body as {
      storyId: string;
      items: { locationId: string; order_index: number; stylesheet_prompt?: string }[];
    };

    if (!storyId || !items?.length) {
      return NextResponse.json({ error: 'storyId and items are required' }, { status: 400 });
    }

    const rows = items.map((item) => ({
      story_id: storyId,
      location_id: item.locationId,
      order_index: item.order_index,
      stylesheet_prompt: item.stylesheet_prompt || '',
    }));

    const { data: episodeLocations, error } = await supabase
      .from('EpisodeLocation')
      .insert(rows)
      .select('*, Location(*)');

    if (error) throw error;

    return NextResponse.json({ episodeLocations });
  } catch (error: any) {
    console.error("Error creating episode locations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
