import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const episodeLocationId = searchParams.get('episodeLocationId');
    const storyId = searchParams.get('storyId') || searchParams.get('story_id');

    let scenes: any = null;

    // 1. Try Prisma query first
    try {
      const where: any = {};
      if (episodeLocationId) where.episode_location_id = episodeLocationId;
      if (storyId) where.story_id = storyId;

      scenes = await prisma.scene.findMany({
        where,
        orderBy: { order_index: 'asc' }
      });
    } catch (e) {}

    // 2. Try Supabase fallback
    if (!scenes || scenes.length === 0) {
      let query = supabase.from('Scene').select('*').order('order_index', { ascending: true });
      if (episodeLocationId) query = query.eq('episode_location_id', episodeLocationId);
      if (storyId) query = query.eq('story_id', storyId);

      const { data, error } = await query;
      if (!error && data) {
        scenes = data;
      }
    }

    return NextResponse.json({ scenes: scenes || [] });
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

    let scenes: any = null;

    try {
      scenes = await prisma.scene.createMany({
        data: rows as any
      });
    } catch (e) {}

    if (!scenes) {
      const { data, error } = await supabase
        .from('Scene')
        .insert(rows)
        .select();

      if (error) throw error;
      scenes = data;
    }

    return NextResponse.json({ scenes });
  } catch (error: any) {
    console.error("Error creating scenes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
