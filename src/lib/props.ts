import { supabase } from '@/lib/supabase';
import { processAndUploadPropSheetAsset, type StoredImageAsset } from '@/lib/storage';

// Server helpers for objects (vehicles, bags, tents...), stored as props. See src/lib/propSheet.ts.

/** Copies a generated sheet to permanent storage; a temporary link is kept if the copy fails. */
export async function storeGeneratedPropSheet(url: unknown, identifier: unknown): Promise<StoredImageAsset | null> {
  if (typeof url !== 'string' || !url.startsWith('http')) return null;
  try {
    return await processAndUploadPropSheetAsset(url, typeof identifier === 'string' ? identifier : null);
  } catch (error) {
    console.error('Failed to copy an object sheet to permanent storage:', error);
    return { publicUrl: url, storageBucket: null, storagePath: url };
  }
}

/** Records that an object appears in an episode. */
export async function linkPropToEpisode(propId: string, storyId: string) {
  const { error } = await supabase.from('StoryProp').upsert([{ story_id: storyId, prop_id: propId }], { onConflict: 'story_id,prop_id' });
  if (error) throw error;
}

/** Supabase errors are plain objects, not Error instances. */
export function errorText(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}
