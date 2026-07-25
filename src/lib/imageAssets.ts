import { supabase } from '@/lib/supabase';

export type ImageOwnerType =
  | 'character_reference'
  | 'location_reference'
  | 'episode_location_stylesheet'
  | 'scene_storyboard';

interface OwnerMapping {
  table: string;
  urlColumn: string;
  statusColumn?: string;
}

const OWNER_TABLE_MAP: Record<ImageOwnerType, OwnerMapping> = {
  character_reference: { table: 'Character', urlColumn: 'reference_image_url' },
  location_reference: { table: 'Location', urlColumn: 'reference_image_url' },
  episode_location_stylesheet: { table: 'EpisodeLocation', urlColumn: 'stylesheet_image_url', statusColumn: 'status' },
  scene_storyboard: { table: 'Scene', urlColumn: 'storyboard_image_url', statusColumn: 'storyboard_status' },
};

interface RecordImageAssetInput {
  ownerType: ImageOwnerType;
  ownerId: string;
  storagePath: string;
  publicUrl: string;
  source: 'upload' | 'generated';
  promptUsed?: string | null;
}

/**
 * Single write-path for "this owner now has a new current image": inserts the
 * ImageAsset history row and updates the owner's denormalized url/status column.
 * Used by both the AI-generate route and the manual-upload route.
 */
export async function recordImageAsset(input: RecordImageAssetInput) {
  const { ownerType, ownerId, storagePath, publicUrl, source, promptUsed } = input;

  await supabase
    .from('ImageAsset')
    .update({ is_selected: false })
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId);

  const { data: imageAsset, error } = await supabase
    .from('ImageAsset')
    .insert([{
      owner_type: ownerType,
      owner_id: ownerId,
      storage_path: storagePath,
      public_url: publicUrl,
      source,
      prompt_used: promptUsed ?? null,
      is_selected: true,
    }])
    .select()
    .single();
  if (error) throw error;

  const mapping = OWNER_TABLE_MAP[ownerType];
  const updatePayload: Record<string, string> = { [mapping.urlColumn]: publicUrl };
  if (mapping.statusColumn) {
    updatePayload[mapping.statusColumn] = 'generated';
  }

  const { error: updateError } = await supabase
    .from(mapping.table)
    .update(updatePayload)
    .eq('id', ownerId);
  if (updateError) throw updateError;

  return imageAsset;
}
