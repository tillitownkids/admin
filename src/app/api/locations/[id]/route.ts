import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { prisma } from '@/lib/prisma';
import { processAndUploadLocationSheetAsset, type StoredImageAsset } from '@/lib/storage';
import { recordGeneratedImageVersion } from '@/lib/generatedImageHistory';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let targetId = id;
    let location;

    try {
      location = await prisma.location.findUnique({
        where: { id: targetId }
      });
      if (!location) {
        const epLoc = await prisma.episodeLocation.findUnique({
          where: { id: targetId },
          include: { Location: true }
        });
        if (epLoc?.Location) {
          location = epLoc.Location;
        }
      }
    } catch {
      const { data } = await supabase
        .from('Location')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();

      if (data) {
        location = data;
      } else {
        const { data: epLoc } = await supabase
          .from('EpisodeLocation')
          .select('*, Location(*)')
          .eq('id', targetId)
          .maybeSingle();

        if (epLoc?.Location) {
          location = epLoc.Location;
        }
      }
    }

    if (!location) {
      return NextResponse.json({ error: `Location not found for ID: ${id}` }, { status: 404 });
    }

    return NextResponse.json({ location });
  } catch (error: any) {
    console.error("Error fetching location:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    let { name, description, reference_image_url, magnific_identifier, generated_image_url } = body;
    let generatedAsset: StoredImageAsset | null = null;

    if (generated_image_url && typeof generated_image_url === 'string' && generated_image_url.startsWith('http')) {
      try {
        generatedAsset = await processAndUploadLocationSheetAsset(generated_image_url, magnific_identifier);
        generated_image_url = generatedAsset.publicUrl;
      } catch (uploadErr) {
        console.error('Failed to re-host generated_image_url in Supabase storage:', uploadErr);
        generatedAsset = {
          publicUrl: generated_image_url,
          storageBucket: null,
          storagePath: generated_image_url,
        };
      }
    }

    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;
    if (reference_image_url !== undefined) updatePayload.reference_image_url = reference_image_url;
    if (magnific_identifier !== undefined) updatePayload.magnific_identifier = magnific_identifier;
    if (generated_image_url !== undefined) updatePayload.generated_image_url = generated_image_url;


    let targetLocationId = id;

    // Check if id directly exists in Location table or EpisodeLocation table
    let locationExists = await prisma.location.findUnique({
      where: { id: targetLocationId }
    }).catch(() => null);

    if (!locationExists) {
      const epLoc = await prisma.episodeLocation.findUnique({
        where: { id: targetLocationId }
      }).catch(() => null);

      if (epLoc?.location_id) {
        targetLocationId = epLoc.location_id;
        locationExists = await prisma.location.findUnique({
          where: { id: targetLocationId }
        }).catch(() => null);
      }
    }

    // Fallback via Supabase if Prisma query missed
    if (!locationExists) {
      const { data: locData } = await supabase
        .from('Location')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (locData) {
        targetLocationId = locData.id;
        locationExists = locData;
      } else {
        const { data: epLocData } = await supabase
          .from('EpisodeLocation')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (epLocData?.location_id) {
          targetLocationId = epLocData.location_id;
          locationExists = await supabase
            .from('Location')
            .select('*')
            .eq('id', targetLocationId)
            .maybeSingle()
            .then(res => res.data);
        }
      }
    }

    if (!locationExists || !targetLocationId) {
      return NextResponse.json({ error: `Location not found for ID: ${id}` }, { status: 404 });
    }

    let location;
    try {
      location = await prisma.location.update({
        where: { id: targetLocationId },
        data: updatePayload
      });
    } catch {
      const { data, error } = await supabase
        .from('Location')
        .update(updatePayload)
        .eq('id', targetLocationId)
        .select()
        .single();

      if (error) throw error;
      location = data;
    }

    if (generatedAsset && generated_image_url) {
      await recordGeneratedImageVersion({
        ownerType: 'location_generated',
        ownerId: targetLocationId,
        publicUrl: generated_image_url,
        storagePath: generatedAsset.storagePath,
        storageBucket: generatedAsset.storageBucket,
        providerIdentifier: magnific_identifier ?? null,
        promptUsed: location.description,
      });
    }

    return NextResponse.json({ location });
  } catch (error: any) {
    console.error("Error updating location:", error);
    return NextResponse.json({ error: error.message || 'Failed to update location' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let targetLocationId = id;

    const locExists = await prisma.location.findUnique({ where: { id: targetLocationId } }).catch(() => null);
    if (!locExists) {
      const epLoc = await prisma.episodeLocation.findUnique({ where: { id: targetLocationId } }).catch(() => null);
      if (epLoc?.location_id) {
        targetLocationId = epLoc.location_id;
      }
    }

    try {
      // 1. Delete associated EpisodeLocation entries first to satisfy foreign key constraint
      await prisma.episodeLocation.deleteMany({
        where: { location_id: targetLocationId }
      });
      // 2. Delete the location
      await prisma.location.delete({
        where: { id: targetLocationId }
      });
    } catch {
      // Supabase fallback
      await supabase
        .from('EpisodeLocation')
        .delete()
        .eq('location_id', targetLocationId);

      const { error } = await supabase
        .from('Location')
        .delete()
        .eq('id', targetLocationId);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting location:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
