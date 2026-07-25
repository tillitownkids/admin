import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description } = body;

    const updatePayload: Record<string, string> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;

    const { data: location, error } = await supabase
      .from('Location')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ location });
  } catch (error: any) {
    console.error("Error updating location:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
