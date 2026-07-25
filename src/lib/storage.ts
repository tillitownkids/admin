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
