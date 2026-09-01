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

const STORYBOARDS_BUCKET = 'storyboards';
const SCENE_VIDEOS_BUCKET = 'scene_videos';

export async function processAndUploadStoryboardImage(
  imageUrl: string,
  identifier?: string | null,
  sceneId?: string
): Promise<string> {
  if (!imageUrl || !imageUrl.startsWith('http')) return imageUrl;
  if (imageUrl.includes(`/storage/v1/object/public/${STORYBOARDS_BUCKET}/`)) return imageUrl;

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to download storyboard image from external URL (${res.status}): ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || 'image/png';
  const ext = contentType.split('/')[1]?.split('+')[0] || 'png';
  const arrayBuffer = await res.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const cleanIdentifier = identifier ? identifier.replace(/[^a-zA-Z0-9_-]/g, '_') : 'sb_image';
  const prefix = sceneId ? `${sceneId.replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';
  const fileName = `${prefix}${cleanIdentifier}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORYBOARDS_BUCKET)
    .upload(fileName, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error('Error uploading storyboard image to Supabase storage:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage.from(STORYBOARDS_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}

export async function processAndUploadSceneVideo(
  videoUrl: string,
  identifier?: string | null,
  sceneId?: string
): Promise<string> {
  if (!videoUrl || !videoUrl.startsWith('http')) return videoUrl;
  if (videoUrl.includes(`/storage/v1/object/public/${SCENE_VIDEOS_BUCKET}/`)) return videoUrl;

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(`Failed to download video clip from external URL (${res.status}): ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || 'video/mp4';
  const ext = contentType.split('/')[1]?.split('+')[0] || 'mp4';
  const arrayBuffer = await res.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const cleanIdentifier = identifier ? identifier.replace(/[^a-zA-Z0-9_-]/g, '_') : 'scene_clip';
  const prefix = sceneId ? `${sceneId.replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';
  const fileName = `${prefix}${cleanIdentifier}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(SCENE_VIDEOS_BUCKET)
    .upload(fileName, fileBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error('Error uploading scene video clip to Supabase storage:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage.from(SCENE_VIDEOS_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}

const FULL_EPISODES_BUCKET = 'full_episodes';

export async function uploadFullEpisodeVideo(
  fileBuffer: Buffer,
  storyId: string,
  title?: string
): Promise<string> {
  const cleanTitle = title ? title.replace(/[^a-zA-Z0-9_-]/g, '_') : `episode_${Date.now()}`;
  const fileName = `${storyId}/${cleanTitle}_${Date.now()}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from(FULL_EPISODES_BUCKET)
    .upload(fileName, fileBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    });

  if (uploadError) {
    console.error('Error uploading full episode video to Supabase storage:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage.from(FULL_EPISODES_BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}

export async function deleteFullEpisodeVideoFromStorage(videoPublicUrl: string): Promise<boolean> {
  try {
    if (!videoPublicUrl || !videoPublicUrl.includes(FULL_EPISODES_BUCKET)) return true;
    const urlParts = videoPublicUrl.split(`${FULL_EPISODES_BUCKET}/`);
    if (urlParts.length < 2) return false;
    const filePath = urlParts[1];

    const { error } = await supabase.storage.from(FULL_EPISODES_BUCKET).remove([filePath]);
    if (error) {
      console.error('Error removing video from storage:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to delete video from storage:', err);
    return false;
  }
}



