import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { prisma } from '@/lib/prisma';
import { processAndUploadCharacterSheetAsset, type StoredImageAsset } from '@/lib/storage';
import { recordGeneratedImageVersion } from '@/lib/generatedImageHistory';

export async function GET(req: NextRequest) {
  try {
    let characters: any = null;
    try {
      characters = await prisma.character.findMany({
        orderBy: { created_at: 'desc' }
      });
    } catch (e) {}

    if (!characters || characters.length === 0) {
      const { data, error } = await supabase
        .from('Character')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      characters = data;
    }

    return NextResponse.json({ characters: characters || [] });
  } catch (error: any) {
    console.error("Error fetching characters:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, reference_image_url, magnific_identifier, generated_image_url: sourceGeneratedImageUrl } = body;
    let generated_image_url = sourceGeneratedImageUrl;
    let generatedAsset: StoredImageAsset | null = null;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (typeof generated_image_url === 'string' && generated_image_url.startsWith('http')) {
      try {
        generatedAsset = await processAndUploadCharacterSheetAsset(generated_image_url, magnific_identifier);
        generated_image_url = generatedAsset.publicUrl;
      } catch (uploadErr) {
        console.error('Failed to re-host generated character sheet:', uploadErr);
        generatedAsset = {
          publicUrl: generated_image_url,
          storageBucket: null,
          storagePath: generated_image_url,
        };
      }
    }

    const payload: any = {
      name,
      description: description || '',
    };
    if (reference_image_url !== undefined) payload.reference_image_url = reference_image_url;
    if (generated_image_url !== undefined) payload.generated_image_url = generated_image_url;
    if (magnific_identifier !== undefined) payload.magnific_identifier = magnific_identifier;

    let character: any = null;
    try {
      character = await prisma.character.create({ data: payload });
    } catch (e) {}

    if (!character) {
      const { data, error } = await supabase
        .from('Character')
        .insert([payload])
        .select()
        .single();
      if (error) throw error;
      character = data;
    }

    if (generatedAsset && generated_image_url) {
      await recordGeneratedImageVersion({
        ownerType: 'character_generated',
        ownerId: character.id,
        publicUrl: generated_image_url,
        storagePath: generatedAsset.storagePath,
        storageBucket: generatedAsset.storageBucket,
        providerIdentifier: magnific_identifier ?? null,
        promptUsed: character.description,
      });
    }

    return NextResponse.json({ character });
  } catch (error: any) {
    console.error("Error creating character:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
