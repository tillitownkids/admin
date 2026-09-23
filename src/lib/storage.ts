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

export interface StoredImageAsset {
  publicUrl: string;
  storageBucket: string | null;
  storagePath: string;
}

function existingStoredAsset(imageUrl: string, bucket: string): StoredImageAsset | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  if (!imageUrl.includes(marker)) return null;

  return {
    publicUrl: imageUrl,
    storageBucket: bucket,
    storagePath: imageUrl.split(marker)[1]?.split('?')[0] || imageUrl,
  };
}

export async function processAndUploadLocationSheetAsset(
  imageUrl: string,
  identifier?: string | null
): Promise<StoredImageAsset> {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return { publicUrl: imageUrl, storageBucket: null, storagePath: imageUrl };
  }

  const existing = existingStoredAsset(imageUrl, LOCATION_STYLESHEET_BUCKET);
  if (existing) return existing;

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to download image from external URL (${res.status}): ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || 'image/png';
  const ext = contentType.split('/')[1]?.split('+')[0] || 'png';
  const arrayBuffer = await res.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const cleanIdentifier = identifier ? identifier.replace(/[^a-zA-Z0-9_-]/g, '_') : `loc_${Date.now()}`;
  // Keep every generated version at an immutable path so an older history URL
  // can never be overwritten by a later generation using the same identifier.
  const fileName = `${cleanIdentifier}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(LOCATION_STYLESHEET_BUCKET)
    .upload(fileName, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error('Error uploading location sheet to Supabase storage:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage.from(LOCATION_STYLESHEET_BUCKET).getPublicUrl(fileName);
  return {
    publicUrl: data.publicUrl,
    storageBucket: LOCATION_STYLESHEET_BUCKET,
    storagePath: fileName,
  };
}

export async function processAndUploadLocationSheet(
  imageUrl: string,
  identifier?: string | null
): Promise<string> {
  return (await processAndUploadLocationSheetAsset(imageUrl, identifier)).publicUrl;
}

export async function processAndUploadCharacterSheetAsset(
  imageUrl: string,
  identifier?: string | null
): Promise<StoredImageAsset> {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return { publicUrl: imageUrl, storageBucket: null, storagePath: imageUrl };
  }

  const existing = existingStoredAsset(imageUrl, BUCKET);
  if (existing) return existing;

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download character sheet (${res.status}): ${res.statusText}`);
  const contentType = res.headers.get('content-type') || 'image/png';
  if (!contentType.startsWith('image/')) throw new Error('Character sheet URL did not return an image.');

  const base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  const cleanIdentifier = identifier?.replace(/[^a-zA-Z0-9_-]/g, '_') || `character_${Date.now()}`;
  const { path, publicUrl } = await uploadImageBuffer(base64, contentType, `character_sheets/${cleanIdentifier}`);
  return { publicUrl, storageBucket: BUCKET, storagePath: path };
}

export async function processAndUploadCharacterSheet(
  imageUrl: string,
  identifier?: string | null
): Promise<string> {
  return (await processAndUploadCharacterSheetAsset(imageUrl, identifier)).publicUrl;
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



