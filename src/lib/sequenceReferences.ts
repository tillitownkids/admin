import { supabase } from '@/lib/supabase';
import { isMissingTable } from '@/lib/promptHistory';
import { STORYBOARDS_BUCKET, processAndUploadStoryboardImageAsset, type StoredImageAsset } from '@/lib/storage';

// A sequence's reference images (SequenceReference rows): camera maps, seating maps and other
// references made to fix its storyboard after it failed several times. One can be attached to the
// sequence's storyboard or clip request like a sheet, once it has a Magnific identifier.

export type ReferenceKind = 'camera_map' | 'seating_map' | 'reference';
export const REFERENCE_KINDS: ReferenceKind[] = ['camera_map', 'seating_map', 'reference'];

export interface SequenceReference {
  id: string;
  scene_id: string;
  story_id: string;
  kind: ReferenceKind;
  label: string;
  image_url: string;
  storage_bucket: string | null;
  storage_path: string | null;
  magnific_identifier: string | null;
  note_id: string | null;
  author: 'admin' | 'claude';
  created_at: string;
}

export class SequenceReferenceError extends Error {}

const NOT_SET_UP = 'Reference images are not set up yet: run supabase/migrations/20261106000000_sequence_references.sql in the Supabase SQL editor.';

/** References of one sequence or a whole episode, oldest first. `available` is false until the migration has run. */
export async function listSequenceReferences(filter: { sceneId?: string; storyId?: string }): Promise<{ available: boolean; references: SequenceReference[] }> {
  let query = supabase.from('SequenceReference').select('*').order('created_at', { ascending: true });
  if (filter.sceneId) query = query.eq('scene_id', filter.sceneId);
  else if (filter.storyId) query = query.eq('story_id', filter.storyId);
  else throw new SequenceReferenceError('A sequence or an episode is needed.');
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return { available: false, references: [] };
    throw new SequenceReferenceError(`Reference images could not be loaded: ${error.message}`);
  }
  return { available: true, references: (data || []) as SequenceReference[] };
}

/**
 * Records a reference image for a sequence. An outside image URL is copied into the admin's storage
 * first; a file already uploaded to storage is recorded where it is (`stored`).
 */
export async function recordSequenceReference(input: {
  sceneId: string;
  label: string;
  kind: ReferenceKind;
  imageUrl: string;
  magnificIdentifier?: string | null;
  noteId?: string | null;
  author: 'admin' | 'claude';
  stored?: { bucket: string; path: string };
}): Promise<SequenceReference> {
  const label = input.label.trim();
  if (!label) throw new SequenceReferenceError('Give the reference image a name, e.g. "SEQ 03 camera map".');
  const { data: scene, error: sceneError } = await supabase.from('Scene').select('id, story_id').eq('id', input.sceneId).maybeSingle();
  if (sceneError) throw new SequenceReferenceError(sceneError.message);
  if (!scene?.story_id) throw new SequenceReferenceError('The sequence no longer exists.');

  let location: StoredImageAsset;
  if (input.stored) {
    location = { publicUrl: input.imageUrl, storageBucket: input.stored.bucket, storagePath: input.stored.path };
  } else {
    try {
      location = await processAndUploadStoryboardImageAsset(input.imageUrl, `ref_${label}_${Date.now()}`, input.sceneId);
    } catch (error) {
      throw new SequenceReferenceError(`The image could not be copied into the admin: ${error instanceof Error ? error.message : 'download failed'}.`);
    }
  }
  const { data, error } = await supabase.from('SequenceReference').insert([{
    scene_id: input.sceneId,
    story_id: scene.story_id,
    kind: REFERENCE_KINDS.includes(input.kind) ? input.kind : 'reference',
    label,
    image_url: location.publicUrl,
    storage_bucket: location.storageBucket ?? null,
    storage_path: location.storagePath ?? null,
    magnific_identifier: input.magnificIdentifier || null,
    note_id: input.noteId || null,
    author: input.author,
  }]).select('*').single();
  if (error) throw new SequenceReferenceError(isMissingTable(error) ? NOT_SET_UP : error.message);
  return data as SequenceReference;
}

/** Sets the Magnific identifier of a reference once the image has been uploaded to Magnific. */
export async function setReferenceIdentifier(referenceId: string, identifier: string): Promise<SequenceReference> {
  const { data, error } = await supabase.from('SequenceReference').update({ magnific_identifier: identifier.trim() || null }).eq('id', referenceId).select('*').maybeSingle();
  if (error) throw new SequenceReferenceError(isMissingTable(error) ? NOT_SET_UP : error.message);
  if (!data) throw new SequenceReferenceError('That reference image no longer exists.');
  return data as SequenceReference;
}

/** Removes a reference image and its stored file. Attachment lists naming it then report it as gone. */
export async function deleteSequenceReference(referenceId: string): Promise<void> {
  const { data, error } = await supabase.from('SequenceReference').delete().eq('id', referenceId).select('storage_bucket, storage_path').maybeSingle();
  if (error) throw new SequenceReferenceError(isMissingTable(error) ? NOT_SET_UP : error.message);
  if (data?.storage_bucket === STORYBOARDS_BUCKET && data.storage_path && !data.storage_path.startsWith('http')) {
    const { error: removeError } = await supabase.storage.from(STORYBOARDS_BUCKET).remove([data.storage_path]);
    if (removeError) console.warn('A reference image file could not be removed:', removeError.message);
  }
}

export const REFERENCE_KIND_LABELS: Record<ReferenceKind, string> = {
  camera_map: 'Camera map',
  seating_map: 'Seating map',
  reference: 'Reference',
};
