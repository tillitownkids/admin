import { supabase } from '@/lib/supabase';
import { storageLocationFromUrl } from '@/lib/storage';

/**
 * Takes: every image generated for a character sheet, a location sheet or a scene's storyboard is
 * kept as an ImageAsset row. The owner's own image column says which take is in use.
 */
export const GENERATED_IMAGE_OWNER_TYPES = [
  'character_generated',
  'location_generated',
  'scene_storyboard',
] as const;

export type GeneratedImageOwnerType = typeof GENERATED_IMAGE_OWNER_TYPES[number];

const OWNERS: Record<GeneratedImageOwnerType, { table: string; urlColumn: string; extra?: Record<string, string> }> = {
  character_generated: { table: 'Character', urlColumn: 'generated_image_url' },
  location_generated: { table: 'Location', urlColumn: 'generated_image_url' },
  scene_storyboard: { table: 'Scene', urlColumn: 'storyboard_image_url', extra: { storyboard_status: 'generated' } },
};

export interface GeneratedImageVersionInput {
  ownerType: GeneratedImageOwnerType;
  ownerId: string;
  publicUrl: string;
  storagePath: string;
  storageBucket?: string | null;
  providerIdentifier?: string | null;
  promptUsed?: string | null;
  /**
   * 'always' puts this image in use. 'if-none' only does so when the owner has no image yet,
   * so a new take never replaces the one that was chosen.
   */
  use?: 'always' | 'if-none';
}

export interface GeneratedImageTake {
  /** Null for an image that was saved before takes were recorded. */
  id: string | null;
  owner_id: string;
  public_url: string;
  provider_identifier: string | null;
  created_at: string | null;
  /** True for the take the owner currently uses. */
  is_selected: boolean;
}

interface ImageAssetRow {
  id: string;
  owner_type: string;
  owner_id: string;
  storage_path: string;
  storage_bucket: string | null;
  public_url: string;
  provider_identifier: string | null;
  prompt_used: string | null;
  is_selected: boolean;
  created_at: string;
}

interface OwnerImage {
  url: string | null;
  identifier: string | null;
}

export class GeneratedImageHistoryError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'GeneratedImageHistoryError';
  }
}

export function isGeneratedImageOwnerType(value: string | null): value is GeneratedImageOwnerType {
  return GENERATED_IMAGE_OWNER_TYPES.includes(value as GeneratedImageOwnerType);
}

async function loadOwnerImages(ownerType: GeneratedImageOwnerType, ownerIds: string[]): Promise<Map<string, OwnerImage>> {
  const { table, urlColumn } = OWNERS[ownerType];
  const { data, error } = await supabase.from(table).select('*').in('id', ownerIds);
  if (error) throw error;
  const owners = new Map<string, OwnerImage>();
  for (const row of (data || []) as Record<string, string | null>[]) {
    owners.set(row.id as string, { url: row[urlColumn] || null, identifier: row.magnific_identifier || null });
  }
  return owners;
}

async function loadAssets(ownerType: GeneratedImageOwnerType, ownerIds: string[]): Promise<ImageAssetRow[]> {
  const { data, error } = await supabase
    .from('ImageAsset')
    .select('*')
    .eq('owner_type', ownerType)
    .in('owner_id', ownerIds)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data || []) as ImageAssetRow[];
}

async function loadAsset(assetId: string): Promise<ImageAssetRow & { owner_type: GeneratedImageOwnerType }> {
  const { data, error } = await supabase.from('ImageAsset').select('*').eq('id', assetId).maybeSingle();
  if (error) throw error;
  if (!data || !isGeneratedImageOwnerType(data.owner_type)) {
    throw new GeneratedImageHistoryError('That take no longer exists.', 404);
  }
  return data as ImageAssetRow & { owner_type: GeneratedImageOwnerType };
}

async function insertAsset(values: Omit<ImageAssetRow, 'id' | 'created_at' | 'is_selected' | 'prompt_used'> & { prompt_used?: string | null }): Promise<ImageAssetRow> {
  const { data, error } = await supabase
    .from('ImageAsset')
    .insert([{ ...values, source: 'generated', is_selected: false }])
    .select()
    .single();
  if (error) throw error;
  return data as ImageAssetRow;
}

/** Points the owner at this take and keeps the is_selected flags in step with it. */
async function putInUse(asset: ImageAssetRow & { owner_type: GeneratedImageOwnerType }): Promise<void> {
  const { table, urlColumn, extra } = OWNERS[asset.owner_type];
  const { error: ownerError } = await supabase
    .from(table)
    .update({
      [urlColumn]: asset.public_url,
      magnific_identifier: asset.provider_identifier,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq('id', asset.owner_id);
  if (ownerError) throw ownerError;

  const { error: clearError } = await supabase
    .from('ImageAsset')
    .update({ is_selected: false })
    .eq('owner_type', asset.owner_type)
    .eq('owner_id', asset.owner_id)
    .neq('id', asset.id);
  if (clearError) throw clearError;

  const { error: selectError } = await supabase.from('ImageAsset').update({ is_selected: true }).eq('id', asset.id);
  if (selectError) throw selectError;
}

function toTake(asset: ImageAssetRow, owner: OwnerImage | undefined): GeneratedImageTake {
  return {
    id: asset.id,
    owner_id: asset.owner_id,
    public_url: asset.public_url,
    provider_identifier: asset.provider_identifier,
    created_at: asset.created_at,
    is_selected: Boolean(owner?.url) && owner?.url === asset.public_url,
  };
}

/**
 * Records a generated image as a take of its owner. An image the owner already uses, but that was
 * never recorded, is recorded first so the new take cannot push it out of reach.
 */
export async function recordGeneratedImageVersion(input: GeneratedImageVersionInput): Promise<GeneratedImageTake> {
  const { ownerType, ownerId } = input;
  const providerIdentifier = input.providerIdentifier ?? null;

  const owner = (await loadOwnerImages(ownerType, [ownerId])).get(ownerId);
  if (!owner) throw new GeneratedImageHistoryError('The item this image belongs to no longer exists.', 404);
  const assets = await loadAssets(ownerType, [ownerId]);

  if (owner.url && owner.url !== input.publicUrl && !assets.some((asset) => asset.public_url === owner.url)) {
    const stored = storageLocationFromUrl(owner.url);
    await insertAsset({
      owner_type: ownerType,
      owner_id: ownerId,
      storage_path: stored?.path ?? owner.url,
      storage_bucket: stored?.bucket ?? null,
      public_url: owner.url,
      provider_identifier: owner.identifier,
    });
  }

  const asset = assets.find((item) => item.public_url === input.publicUrl) ?? await insertAsset({
    owner_type: ownerType,
    owner_id: ownerId,
    storage_path: input.storagePath,
    storage_bucket: input.storageBucket ?? null,
    public_url: input.publicUrl,
    provider_identifier: providerIdentifier,
    prompt_used: input.promptUsed ?? null,
  });

  const use = input.use ?? 'always';
  const makeCurrent = use === 'always' || !owner.url;
  if (makeCurrent) {
    await putInUse({ ...asset, owner_type: ownerType });
    return toTake(asset, { url: asset.public_url, identifier: asset.provider_identifier });
  }
  return toTake(asset, owner);
}

/** Every take of the given owners, oldest first. */
export async function listGeneratedImageHistory(
  ownerType: GeneratedImageOwnerType,
  ownerIds: string | string[],
): Promise<GeneratedImageTake[]> {
  const ids = Array.isArray(ownerIds) ? ownerIds : [ownerIds];
  if (ids.length === 0) return [];
  const [owners, assets] = await Promise.all([loadOwnerImages(ownerType, ids), loadAssets(ownerType, ids)]);

  const takes: GeneratedImageTake[] = [];
  for (const id of ids) {
    const owner = owners.get(id);
    const own = assets.filter((asset) => asset.owner_id === id);
    // An image saved before takes were recorded still shows, as the take in use.
    if (owner?.url && !own.some((asset) => asset.public_url === owner.url)) {
      takes.push({ id: null, owner_id: id, public_url: owner.url, provider_identifier: owner.identifier, created_at: null, is_selected: true });
    }
    takes.push(...own.map((asset) => toTake(asset, owner)));
  }
  return takes;
}

/** Puts an existing take in use. */
export async function restoreGeneratedImageVersion(assetId: string): Promise<GeneratedImageTake> {
  const asset = await loadAsset(assetId);
  await putInUse(asset);
  return toTake(asset, { url: asset.public_url, identifier: asset.provider_identifier });
}

export async function deleteGeneratedImageVersion(assetId: string) {
  const asset = await loadAsset(assetId);
  const owner = (await loadOwnerImages(asset.owner_type, [asset.owner_id])).get(asset.owner_id);
  if (owner?.url === asset.public_url) {
    throw new GeneratedImageHistoryError('The take in use cannot be deleted. Choose another take first.', 409);
  }

  const { error } = await supabase.from('ImageAsset').delete().eq('id', asset.id);
  if (error) throw error;

  let storageDeleted = false;
  if (asset.storage_bucket && asset.storage_path && !asset.storage_path.startsWith('http')) {
    const { error: storageError } = await supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);
    if (storageError) {
      console.error(`Failed to remove take ${asset.id} from storage:`, storageError);
    } else {
      storageDeleted = true;
    }
  }

  return { asset, storageDeleted };
}
