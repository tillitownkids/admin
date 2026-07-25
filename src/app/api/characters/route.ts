import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { data: characters, error } = await supabase
      .from('Character')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ characters });
  } catch (error: any) {
    console.error("Error fetching characters:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const { data: character, error } = await supabase
      .from('Character')
      .insert([{
        name,
        description: description || '',
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ character });
  } catch (error: any) {
    console.error("Error creating character:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
