import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { supabase } from '@/lib/supabase';
import { processAndUploadLocationSheet } from '@/lib/storage';

export async function GET(req: NextRequest) {
  try {
    let locations;
    try {
      locations = await prisma.location.findMany({
        orderBy: { created_at: 'desc' }
      });
    } catch {
      const { data, error } = await supabase
        .from('Location')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      locations = data;
    }
    return NextResponse.json({ locations });
  } catch (error: any) {
    console.error("Error fetching locations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { name, description, reference_image_url, magnific_identifier, generated_image_url } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (generated_image_url && typeof generated_image_url === 'string' && generated_image_url.startsWith('http')) {
      try {
        generated_image_url = await processAndUploadLocationSheet(generated_image_url, magnific_identifier);
      } catch (uploadErr) {
        console.error('Failed to re-host generated_image_url in Supabase storage:', uploadErr);
      }
    }

    const dataPayload: Record<string, any> = {
      name,
      description: description || '',
    };
    if (reference_image_url !== undefined) dataPayload.reference_image_url = reference_image_url;
    if (magnific_identifier !== undefined) dataPayload.magnific_identifier = magnific_identifier;
    if (generated_image_url !== undefined) dataPayload.generated_image_url = generated_image_url;


    let location;
    try {
      location = await prisma.location.create({
        data: dataPayload as any
      });
    } catch (prismaErr) {
      console.warn("Prisma location creation failed, falling back to Supabase:", prismaErr);
      const { data, error } = await supabase
        .from('Location')
        .insert([dataPayload])
        .select()
        .single();

      if (error) throw error;
      location = data;
    }

    return NextResponse.json({ location });
  } catch (error: any) {
    console.error("Error creating location:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
