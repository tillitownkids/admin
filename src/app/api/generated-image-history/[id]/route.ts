import { NextRequest, NextResponse } from 'next/server';
import {
  deleteGeneratedImageVersion,
  GeneratedImageHistoryError,
  restoreGeneratedImageVersion,
} from '@/lib/generatedImageHistory';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof GeneratedImageHistoryError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'A valid image version ID is required.' }, { status: 400 });
    }

    const asset = await restoreGeneratedImageVersion(id);
    return NextResponse.json({ asset });
  } catch (error) {
    return errorResponse(error, 'Failed to restore generated image version.');
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'A valid image version ID is required.' }, { status: 400 });
    }

    const result = await deleteGeneratedImageVersion(id);
    return NextResponse.json({ success: true, storageDeleted: result.storageDeleted });
  } catch (error) {
    return errorResponse(error, 'Failed to delete generated image version.');
  }
}
