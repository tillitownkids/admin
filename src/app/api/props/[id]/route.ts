import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { errorText, linkPropToEpisode, storeGeneratedPropSheet } from '@/lib/props';
import { recordGeneratedImageVersion } from '@/lib/generatedImageHistory';
import { isPropKind } from '@/lib/propSheet';

// One object (stored as a prop). See src/lib/propSheet.ts.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: prop, error } = await supabase.from('Prop').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: errorText(error, 'The object could not be loaded.') }, { status: 500 });
  if (!prop) return NextResponse.json({ error: 'Object not found.' }, { status: 404 });
  return NextResponse.json({ prop });
}

/**
 * Edits an object. Switching an episode object to permanent promotes it: it leaves its episode's
 * ownership, keeps its sheet, and stays linked to the episodes it already appears in.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { data: existing, error: loadError } = await supabase.from('Prop').select('*').eq('id', id).maybeSingle();
    if (loadError) throw loadError;
    if (!existing) return NextResponse.json({ error: 'Object not found.' }, { status: 404 });

    const kind = body.kind ?? existing.kind;
    if (!isPropKind(kind)) return NextResponse.json({ error: 'Choose permanent or this episode only.' }, { status: 400 });
    const storyId = kind === 'episode'
      ? (typeof body.story_id === 'string' && body.story_id ? body.story_id : existing.story_id)
      : null;
    if (kind === 'episode' && !storyId) return NextResponse.json({ error: 'Choose the episode this object belongs to.' }, { status: 400 });

    const stored = await storeGeneratedPropSheet(body.generated_image_url, body.magnific_identifier);
    const update: Record<string, unknown> = { kind, story_id: storyId, updated_at: new Date().toISOString() };
    // A permanent object no longer needs the detection agent's suggestion to promote it.
    if (kind === 'permanent') update.suggest_permanent = false;
    if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
    if (typeof body.description === 'string') update.description = body.description;
    if (body.reference_image_url !== undefined) update.reference_image_url = body.reference_image_url;
    if (body.magnific_identifier !== undefined) update.magnific_identifier = body.magnific_identifier;
    if (stored) update.generated_image_url = stored.publicUrl;

    const { data: prop, error } = await supabase.from('Prop').update(update).eq('id', id).select().single();
    if (error) throw error;
    if (prop.story_id) await linkPropToEpisode(prop.id, prop.story_id);

    if (stored) {
      await recordGeneratedImageVersion({
        ownerType: 'prop_generated',
        ownerId: prop.id,
        publicUrl: stored.publicUrl,
        storagePath: stored.storagePath,
        storageBucket: stored.storageBucket,
        providerIdentifier: body.magnific_identifier ?? null,
        promptUsed: prop.description,
      });
    }
    return NextResponse.json({ prop });
  } catch (error) {
    console.error('Error updating object:', error);
    return NextResponse.json({ error: errorText(error, 'The object could not be saved.') }, { status: 500 });
  }
}

/** Deletes an object; its episode and scene links go with it. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase.from('Prop').delete().eq('id', id);
  if (error) {
    console.error('Error deleting object:', error);
    return NextResponse.json({ error: errorText(error, 'The object could not be deleted.') }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
