import { prisma } from '@/lib/prisma';
import { supabase } from '@/lib/supabase';
import { processAndUploadCharacterSheet, processAndUploadLocationSheet } from '@/lib/storage';

export type ReferenceType = 'character' | 'location';

interface ReferenceRecord {
  id: string;
  name: string;
  description: string;
  reference_image_url: string | null;
  generated_image_url: string | null;
  magnific_identifier: string | null;
}

interface GeneratedReference {
  imageUrl: string;
  magnificIdentifier: string;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function extractGeneratedReference(data: unknown): GeneratedReference {
  const queue: unknown[] = [data];
  let imageUrl: string | null = null;
  let magnificIdentifier: string | null = null;
  let inspected = 0;

  while (queue.length > 0 && inspected < 50 && (!imageUrl || !magnificIdentifier)) {
    const current = queue.shift();
    inspected += 1;

    if (typeof current === 'string') {
      if (!imageUrl && current.startsWith('http')) imageUrl = current;
      continue;
    }
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const item = current as Record<string, unknown>;
    imageUrl ||= firstNonEmptyString(
      item.url,
      item.generated_image_url,
      item.image_url,
      item.imageUrl,
      item.image,
      item.thumbnailUrl,
    );
    magnificIdentifier ||= firstNonEmptyString(
      item.identifier,
      item.magnific_identifier,
      item.magnific_id,
    );

    for (const key of ['json', 'result', 'results', 'data', 'scenes']) {
      if (item[key] !== undefined) queue.push(item[key]);
    }
  }

  if (!imageUrl || !imageUrl.startsWith('http')) {
    throw new Error('Generation webhook did not return a valid image URL.');
  }
  if (!magnificIdentifier) {
    throw new Error('Generation webhook did not return a Magnific identifier.');
  }

  return { imageUrl, magnificIdentifier };
}

async function loadReference(type: ReferenceType, id: string): Promise<ReferenceRecord | null> {
  try {
    const record = type === 'character'
      ? await prisma.character.findUnique({ where: { id } })
      : await prisma.location.findUnique({ where: { id } });
    if (record) return record as ReferenceRecord;
  } catch (error) {
    console.warn(`Prisma ${type} lookup failed, falling back to Supabase:`, error);
  }

  const table = type === 'character' ? 'Character' : 'Location';
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as ReferenceRecord | null;
}

async function saveGeneratedReference(
  type: ReferenceType,
  id: string,
  generatedImageUrl: string,
  magnificIdentifier: string,
): Promise<void> {
  const data = {
    generated_image_url: generatedImageUrl,
    magnific_identifier: magnificIdentifier,
    updated_at: new Date(),
  };

  try {
    if (type === 'character') {
      await prisma.character.update({ where: { id }, data });
    } else {
      await prisma.location.update({ where: { id }, data });
    }
    return;
  } catch (error) {
    console.warn(`Prisma ${type} reference update failed, falling back to Supabase:`, error);
  }

  const table = type === 'character' ? 'Character' : 'Location';
  const { error } = await supabase
    .from(table)
    .update({ ...data, updated_at: data.updated_at.toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function generateReference(type: ReferenceType, id: string) {
  const record = await loadReference(type, id);
  if (!record) throw new Error(`${type === 'character' ? 'Character' : 'Location'} not found.`);

  try {
    if (record.generated_image_url && record.magnific_identifier) {
      return { id, type, name: record.name, skipped: true };
    }
    if (!record.description?.trim()) {
      throw new Error('A description is required before its reference can be generated.');
    }

    const webhookUrl = type === 'character'
      ? 'https://automation.tillitown.com/webhook/generate-character-image'
      : 'https://automation.tillitown.com/webhook/generate-image';
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: record.name,
        prompt: record.description,
        reference_url: record.reference_image_url || '',
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>;
      const message = firstNonEmptyString(errorBody.error, errorBody.message);
      throw new Error(message || `Generation webhook returned HTTP ${response.status}.`);
    }

    const generated = extractGeneratedReference(await response.json());
    const permanentUrl = type === 'character'
      ? await processAndUploadCharacterSheet(generated.imageUrl, generated.magnificIdentifier)
      : await processAndUploadLocationSheet(generated.imageUrl, generated.magnificIdentifier);

    await saveGeneratedReference(type, id, permanentUrl, generated.magnificIdentifier);
    return { id, type, name: record.name, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reference generation failed.';
    throw new Error(`${record.name}: ${message}`);
  }
}
