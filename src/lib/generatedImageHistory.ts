import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { supabase } from '@/lib/supabase';

export const GENERATED_IMAGE_OWNER_TYPES = [
  'character_generated',
  'location_generated',
] as const;

export type GeneratedImageOwnerType = typeof GENERATED_IMAGE_OWNER_TYPES[number];

export interface GeneratedImageVersionInput {
  ownerType: GeneratedImageOwnerType;
  ownerId: string;
  publicUrl: string;
  storagePath: string;
  storageBucket?: string | null;
  providerIdentifier?: string | null;
  promptUsed?: string | null;
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

async function updateOwnerCurrentImage(
  tx: Prisma.TransactionClient,
  ownerType: GeneratedImageOwnerType,
  ownerId: string,
  publicUrl: string,
  providerIdentifier: string | null,
) {
  const data = {
    generated_image_url: publicUrl,
    magnific_identifier: providerIdentifier,
    updated_at: new Date(),
  };

  if (ownerType === 'character_generated') {
    await tx.character.update({ where: { id: ownerId }, data });
  } else {
    await tx.location.update({ where: { id: ownerId }, data });
  }
}

export async function recordGeneratedImageVersion(input: GeneratedImageVersionInput) {
  const providerIdentifier = input.providerIdentifier ?? null;

  return prisma.$transaction(async (tx) => {
    const selected = await tx.imageAsset.findFirst({
      where: {
        owner_type: input.ownerType,
        owner_id: input.ownerId,
        is_selected: true,
      },
    });

    if (
      selected?.public_url === input.publicUrl
      && selected.provider_identifier === providerIdentifier
    ) {
      await updateOwnerCurrentImage(
        tx,
        input.ownerType,
        input.ownerId,
        input.publicUrl,
        providerIdentifier,
      );
      return selected;
    }

    const reusable = await tx.imageAsset.findFirst({
      where: {
        owner_type: input.ownerType,
        owner_id: input.ownerId,
        public_url: input.publicUrl,
        provider_identifier: providerIdentifier,
      },
      orderBy: { created_at: 'desc' },
    });

    await tx.imageAsset.updateMany({
      where: { owner_type: input.ownerType, owner_id: input.ownerId, is_selected: true },
      data: { is_selected: false },
    });

    const imageAsset = reusable
      ? await tx.imageAsset.update({
          where: { id: reusable.id },
          data: { is_selected: true },
        })
      : await tx.imageAsset.create({
          data: {
            owner_type: input.ownerType,
            owner_id: input.ownerId,
            storage_path: input.storagePath,
            storage_bucket: input.storageBucket ?? null,
            public_url: input.publicUrl,
            source: 'generated',
            prompt_used: input.promptUsed ?? null,
            provider_identifier: providerIdentifier,
            is_selected: true,
          },
        });

    await updateOwnerCurrentImage(
      tx,
      input.ownerType,
      input.ownerId,
      input.publicUrl,
      providerIdentifier,
    );

    return imageAsset;
  });
}

export async function listGeneratedImageHistory(
  ownerType: GeneratedImageOwnerType,
  ownerId: string,
) {
  return prisma.imageAsset.findMany({
    where: { owner_type: ownerType, owner_id: ownerId },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
  });
}

export async function restoreGeneratedImageVersion(assetId: string) {
  const asset = await prisma.imageAsset.findUnique({ where: { id: assetId } });
  if (!asset || !isGeneratedImageOwnerType(asset.owner_type)) {
    throw new GeneratedImageHistoryError('Generated image version not found.', 404);
  }

  return recordGeneratedImageVersion({
    ownerType: asset.owner_type,
    ownerId: asset.owner_id,
    publicUrl: asset.public_url,
    storagePath: asset.storage_path,
    storageBucket: asset.storage_bucket,
    providerIdentifier: asset.provider_identifier,
    promptUsed: asset.prompt_used,
  });
}

export async function deleteGeneratedImageVersion(assetId: string) {
  const asset = await prisma.imageAsset.findUnique({ where: { id: assetId } });
  if (!asset || !isGeneratedImageOwnerType(asset.owner_type)) {
    throw new GeneratedImageHistoryError('Generated image version not found.', 404);
  }
  if (asset.is_selected) {
    throw new GeneratedImageHistoryError(
      'The current image cannot be deleted. Restore another version first.',
      409,
    );
  }

  const owner = asset.owner_type === 'character_generated'
    ? await prisma.character.findUnique({ where: { id: asset.owner_id }, select: { generated_image_url: true } })
    : await prisma.location.findUnique({ where: { id: asset.owner_id }, select: { generated_image_url: true } });

  if (owner?.generated_image_url === asset.public_url) {
    throw new GeneratedImageHistoryError(
      'The current image cannot be deleted. Restore another version first.',
      409,
    );
  }

  await prisma.imageAsset.delete({ where: { id: asset.id } });

  let storageDeleted = false;
  if (asset.storage_bucket && asset.storage_path && !asset.storage_path.startsWith('http')) {
    const { error } = await supabase.storage
      .from(asset.storage_bucket)
      .remove([asset.storage_path]);
    if (error) {
      console.error(`Failed to remove historical image ${asset.id} from storage:`, error);
    } else {
      storageDeleted = true;
    }
  }

  return { asset, storageDeleted };
}
