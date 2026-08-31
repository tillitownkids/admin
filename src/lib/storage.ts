import { supabase } from '@/lib/supabase';

const BUCKET = 'episode-assets';

export async function uploadImageBuffer(
  base64: string,
  mimeType: string,
  pathPrefix: string
): Promise<{ path: string; publicUrl: string }> {
  const ext = mimeType.split('/')[1]?.split('+')[0] || 'png';
  const path = `${pathPrefix}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(base64, 'base64');

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

const LOCATION_STYLESHEET_BUCKET = 'location_style_sheets';

export async function processAndUploadLocationSheet(
  imageUrl: string,
  identifier?: string | null
): Promise<string> {
  if (!imageUrl || !imageUrl.startsWith('http')) return imageUrl;
  if (imageUrl.includes(`/storage/v1/object/public/${LOCATION_STYLESHEET_BUCKET}/`)) return imageUrl;

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to download image from external URL (${res.status}): ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || 'image/png';
  const ext = contentType.split('/')[1]?.split('+')[0] || 'png';
  const arrayBuffer = await res.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const cleanIdentifier = identifier ? identifier.replace(/[^a-zA-Z0-9_-]/g, '_') : `loc_${Date.now()}`;
  const fileName = `${cleanIdentifier}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(LOCATION_STYLESHEET_BUCKET)
    .upload(fileName, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error('Error uploading location sheet to Supabase storage:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage.from(LOCATION_STYLESHEET_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}

