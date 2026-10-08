import { NextRequest, NextResponse } from 'next/server';
import {
  GeneratedImageHistoryError,
  isGeneratedImageOwnerType,
  listGeneratedImageHistory,
  recordGeneratedImageVersion,
  type GeneratedImageOwnerType,
} from '@/lib/generatedImageHistory';
import {
  processAndUploadCharacterSheetAsset,
  processAndUploadLocationSheetAsset,
  processAndUploadStoryboardImageAsset,
  type StoredImageAsset,
} from '@/lib/storage';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OWNERS = 200;

// The generator's own link is temporary. A take left on it stops loading later.
const TEMPORARY_IMAGE_WARNING = 'The image was saved, but copying it to permanent storage failed, so it is on a temporary link that will stop working. Generate another take to replace it.';

/** Takes of one owner (`ownerId`) or of several (`ownerIds`, comma-separated), oldest first. */
export async function GET(req: NextRequest) {
  try {
    const ownerType = req.nextUrl.searchParams.get('ownerType');
    const ownerIds = (req.nextUrl.searchParams.get('ownerIds') || req.nextUrl.searchParams.get('ownerId') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (
      !isGeneratedImageOwnerType(ownerType)
      || ownerIds.length === 0
      || ownerIds.length > MAX_OWNERS
      || ownerIds.some((id) => !UUID_PATTERN.test(id))
    ) {
      return NextResponse.json({ error: 'A valid ownerType and ownerId are required.' }, { status: 400 });
    }

    const assets = await listGeneratedImageHistory(ownerType, ownerIds);
    return NextResponse.json({ assets });
  } catch (error) {
    console.error('Error loading takes:', error);
    return NextResponse.json({ error: 'The takes could not be loaded.' }, { status: 500 });
  }
}

function storeTake(ownerType: GeneratedImageOwnerType, ownerId: string, imageUrl: string, identifier: string | null): Promise<StoredImageAsset> {
  if (ownerType === 'character_generated') return processAndUploadCharacterSheetAsset(imageUrl, identifier);
  if (ownerType === 'location_generated') return processAndUploadLocationSheetAsset(imageUrl, identifier);
  return processAndUploadStoryboardImageAsset(imageUrl, identifier, ownerId);
}

/**
 * Saves a newly generated image as a take. It is put in use only when the owner has no image yet;
 * otherwise it waits beside the others until someone chooses it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const ownerType = typeof body?.ownerType === 'string' ? body.ownerType : null;
    const ownerId = typeof body?.ownerId === 'string' ? body.ownerId : '';
    const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl : '';
    const providerIdentifier = typeof body?.providerIdentifier === 'string' && body.providerIdentifier ? body.providerIdentifier : null;
    const promptUsed = typeof body?.promptUsed === 'string' ? body.promptUsed : null;

    if (!isGeneratedImageOwnerType(ownerType) || !UUID_PATTERN.test(ownerId) || !/^https?:\/\//i.test(imageUrl)) {
      return NextResponse.json({ error: 'A valid ownerType, ownerId and imageUrl are required.' }, { status: 400 });
    }

    let stored: StoredImageAsset;
    let warning: string | undefined;
    try {
      stored = await storeTake(ownerType, ownerId, imageUrl, providerIdentifier);
    } catch (error) {
      console.error('Failed to copy a generated image to permanent storage:', error);
      stored = { publicUrl: imageUrl, storageBucket: null, storagePath: imageUrl };
      warning = TEMPORARY_IMAGE_WARNING;
    }

    const asset = await recordGeneratedImageVersion({
      ownerType,
      ownerId,
      publicUrl: stored.publicUrl,
      storagePath: stored.storagePath,
      storageBucket: stored.storageBucket,
      providerIdentifier,
      promptUsed,
      use: 'if-none',
    });
    return NextResponse.json({ asset, warning });
  } catch (error) {
    if (error instanceof GeneratedImageHistoryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error saving take:', error);
    return NextResponse.json({ error: 'The take could not be saved.' }, { status: 500 });
  }
}
