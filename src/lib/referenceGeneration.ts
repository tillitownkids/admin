import { prisma } from '@/lib/prisma';
import { supabase } from '@/lib/supabase';
import {
  processAndUploadCharacterSheetAsset,
  processAndUploadLocationSheetAsset,
  processAndUploadPropSheetAsset,
} from '@/lib/storage';
import { recordGeneratedImageVersion } from '@/lib/generatedImageHistory';
import { propSheetPrompt } from '@/lib/propSheet';

/** 'prop' is an object (vehicle, bag, tent...): the Objects library. */
export type ReferenceType = 'character' | 'location' | 'prop';

const REFERENCE = {
  character: { table: 'Character', label: 'Character', ownerType: 'character_generated', webhook: 'https://automation.tillitown.com/webhook/generate-character-image', store: processAndUploadCharacterSheetAsset },
  location: { table: 'Location', label: 'Location', ownerType: 'location_generated', webhook: 'https://automation.tillitown.com/webhook/generate-image', store: processAndUploadLocationSheetAsset },
  prop: { table: 'Prop', label: 'Object', ownerType: 'prop_generated', webhook: 'https://automation.tillitown.com/webhook/generate-image', store: processAndUploadPropSheetAsset },
} as const;

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
  const { table } = REFERENCE[type];
  try {
    // Batch generation can keep several requests open while external image
    // services respond. Prefer Supabase's HTTP API here so those reads do not
    // consume scarce direct Prisma connections.
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (!error && data) return data as ReferenceRecord;
    if (error) console.warn(`Supabase ${type} lookup failed, falling back to Prisma:`, error);
  } catch (error) {
    console.warn(`Supabase ${type} lookup failed, falling back to Prisma:`, error);
  }

  try {
    const record = type === 'character'
      ? await prisma.character.findUnique({ where: { id } })
      : type === 'location'
      ? await prisma.location.findUnique({ where: { id } })
      : await prisma.prop.findUnique({ where: { id } });
    if (record) return record as ReferenceRecord;
  } catch (error) {
    console.warn(`Prisma ${type} lookup failed:`, error);
  }
  return null;
}

export async function generateReference(type: ReferenceType, id: string) {
  const record = await loadReference(type, id);
  if (!record) throw new Error(`${REFERENCE[type].label} not found.`);

  try {
    if (record.generated_image_url && record.magnific_identifier) {
      return { id, type, name: record.name, skipped: true };
    }
    if (!record.description?.trim()) {
      throw new Error('A description is required before its reference can be generated.');
    }

    const response = await fetch(REFERENCE[type].webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: record.name,
        // An object's description is wrapped into a multi-view sheet prompt.
        prompt: type === 'prop' ? propSheetPrompt(record.description) : record.description,
        reference_url: record.reference_image_url || '',
        // location and prop share this webhook; n8n needs this to pick the right sheet template
        // (a prop's prompt above is already a complete multi-view object sheet on its own, not a
        // description to wrap in the location grid template).
        type,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as Record<string, unknown>;
      const message = firstNonEmptyString(errorBody.error, errorBody.message);
      throw new Error(message || `Generation webhook returned HTTP ${response.status}.`);
    }

    const generated = extractGeneratedReference(await response.json());
    const stored = await REFERENCE[type].store(generated.imageUrl, generated.magnificIdentifier);

    await recordGeneratedImageVersion({
      ownerType: REFERENCE[type].ownerType,
      ownerId: id,
      publicUrl: stored.publicUrl,
      storagePath: stored.storagePath,
      storageBucket: stored.storageBucket,
      providerIdentifier: generated.magnificIdentifier,
      promptUsed: record.description,
    });
    return { id, type, name: record.name, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reference generation failed.';
    throw new Error(`${record.name}: ${message}`);
  }
}
