import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { data: locations, error } = await supabase
      .from('Location')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ locations });
  } catch (error: any) {
    console.error("Error fetching locations:", error);
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

    const { data: location, error } = await supabase
      .from('Location')
      .insert([{
        name,
        description: description || '',
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ location });
  } catch (error: any) {
    console.error("Error creating location:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
