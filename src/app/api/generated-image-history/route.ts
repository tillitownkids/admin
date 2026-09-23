import { NextRequest, NextResponse } from 'next/server';
import {
  isGeneratedImageOwnerType,
  listGeneratedImageHistory,
} from '@/lib/generatedImageHistory';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const ownerType = req.nextUrl.searchParams.get('ownerType');
    const ownerId = req.nextUrl.searchParams.get('ownerId');

    if (!isGeneratedImageOwnerType(ownerType) || !ownerId || !UUID_PATTERN.test(ownerId)) {
      return NextResponse.json({ error: 'A valid ownerType and ownerId are required.' }, { status: 400 });
    }

    const assets = await listGeneratedImageHistory(ownerType, ownerId);
    return NextResponse.json({ assets });
  } catch (error) {
    console.error('Error loading generated image history:', error);
    return NextResponse.json({ error: 'Failed to load generated image history.' }, { status: 500 });
  }
}
