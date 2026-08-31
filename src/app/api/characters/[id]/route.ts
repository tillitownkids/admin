import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let character: any = null;
    try {
      character = await prisma.character.findUnique({
        where: { id }
      });
    } catch {
      const { data, error } = await supabase
        .from('Character')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      character = data;
    }

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    return NextResponse.json({ character });
  } catch (error: any) {
    console.error("Error fetching character:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, reference_image_url, magnific_identifier, generated_image_url } = body;

    const updatePayload: Record<string, any> = { updated_at: new Date() };
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;
    if (reference_image_url !== undefined) updatePayload.reference_image_url = reference_image_url;
    if (magnific_identifier !== undefined) updatePayload.magnific_identifier = magnific_identifier;
    if (generated_image_url !== undefined) updatePayload.generated_image_url = generated_image_url;

    let character: any = null;
    try {
      character = await prisma.character.update({
        where: { id },
        data: updatePayload
      });
    } catch (e) {
      console.warn('Prisma character update failed, falling back to Supabase:', e);
    }

    if (!character) {
      const supabasePayload = {
        ...updatePayload,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('Character')
        .update(supabasePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      character = data;
    }

    return NextResponse.json({ character });
  } catch (error: any) {
    console.error("Error updating character:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    try {
      await prisma.character.delete({ where: { id } });
    } catch {
      const { error } = await supabase
        .from('Character')
        .delete()
        .eq('id', id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting character:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
