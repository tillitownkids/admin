import { NextRequest, NextResponse } from 'next/server';
import { GeminiImageService } from '@/lib/services/ai/GeminiImageService';
import { uploadImageBuffer } from '@/lib/storage';
import { recordImageAsset, ImageOwnerType } from '@/lib/imageAssets';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { promptText, referenceImageUrls, ownerType, ownerId } = body as {
      promptText: string;
      referenceImageUrls?: string[];
      ownerType: ImageOwnerType;
      ownerId: string;
    };

    if (!promptText || !ownerType || !ownerId) {
      return NextResponse.json({ error: 'Missing promptText, ownerType, or ownerId' }, { status: 400 });
    }

    const referenceImages = await Promise.all(
      (referenceImageUrls || []).map(async (url) => {
        const res = await fetch(url);
        const buf = Buffer.from(await res.arrayBuffer());
        const mimeType = res.headers.get('content-type') || 'image/png';
        return { mimeType, data: buf.toString('base64') };
      })
    );

    const geminiService = new GeminiImageService();
    const { base64, mimeType } = await geminiService.generateImage({
      prompt: promptText,
      referenceImages,
    });

    const { path, publicUrl } = await uploadImageBuffer(base64, mimeType, `${ownerType}/${ownerId}`);

    const imageAsset = await recordImageAsset({
      ownerType,
      ownerId,
      storagePath: path,
      publicUrl,
      source: 'generated',
      promptUsed: promptText,
    });

    return NextResponse.json({ imageAsset, publicUrl });
  } catch (error: any) {
    console.error('Error generating image:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate image' }, { status: 500 });
  }
}
