import { NextRequest, NextResponse } from 'next/server';
import { uploadImageBuffer } from '@/lib/storage';
import { recordImageAsset, ImageOwnerType } from '@/lib/imageAssets';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const ownerType = formData.get('ownerType') as ImageOwnerType | null;
    const ownerId = formData.get('ownerId') as string | null;

    if (!file || !ownerType || !ownerId) {
      return NextResponse.json({ error: 'Missing file, ownerType, or ownerId' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'image/png';

    const { path, publicUrl } = await uploadImageBuffer(base64, mimeType, `${ownerType}/${ownerId}`);

    const imageAsset = await recordImageAsset({
      ownerType,
      ownerId,
      storagePath: path,
      publicUrl,
      source: 'upload',
    });

    return NextResponse.json({ imageAsset, publicUrl });
  } catch (error: any) {
    console.error('Error uploading image:', error);
    return NextResponse.json({ error: error.message || 'Failed to upload image' }, { status: 500 });
  }
}
