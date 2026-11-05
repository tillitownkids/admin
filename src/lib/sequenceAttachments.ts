import { supabase } from '@/lib/supabase';
import { isMissingTable } from '@/lib/promptHistory';

// A sequence's attachments: the reference images sent with its storyboard request and its clip
// request, in order (Image 1, Image 2, ...), so prompts can name them by number. Claude chooses them
// through the MCP server; the admin stores, shows and sends them. With no stored list, attachments
// are automatic: the sequence's cast, its location and its objects, and for a clip its own
// storyboard first.

export type AttachmentKind = 'character' | 'location' | 'object' | 'storyboard';
export type AttachmentTarget = 'storyboard' | 'clip';

export const MAX_ATTACHMENTS = 8;

/** As stored in Scene.storyboard_attachments / clip_attachments. */
export interface StoredAttachment {
  kind: AttachmentKind;
  /** Character, Location or Prop id; for a storyboard, the Scene id of that sequence. */
  id: string;
  /** A specific version (ImageAsset id) of the sheet or storyboard; null = the one in use. */
  take_id?: string | null;
  /** How the prompt refers to it, e.g. "Oasis Camp Night sheet" or "SEQ 15 storyboard". */
  label: string;
  /** What it is for, e.g. "environment only" or "continuity reference: match panel SHOT 2". */
  role?: string | null;
}

export interface ResolvedAttachment extends StoredAttachment {
  /** 1-based position: the "Image N" the prompt uses. */
  image: number;
  /** The Magnific identifier sent to the generator; null when the sheet or storyboard is missing. */
  identifier: string | null;
  url: string | null;
  /** Why this attachment cannot be sent yet. */
  problem?: string;
}

export interface AttachmentSet {
  target: AttachmentTarget;
  /** True when no list was chosen and the automatic set is used. */
  automatic: boolean;
  attachments: ResolvedAttachment[];
  problems: string[];
}

export class AttachmentError extends Error {}

const KINDS: AttachmentKind[] = ['character', 'location', 'object', 'storyboard'];
const COLUMN: Record<AttachmentTarget, 'storyboard_attachments' | 'clip_attachments'> = {
  storyboard: 'storyboard_attachments',
  clip: 'clip_attachments',
};

/** A stored list, or null when the value is missing or not a valid list. */
export function parseAttachments(value: unknown): StoredAttachment[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter((item): item is StoredAttachment =>
    Boolean(item) && typeof item === 'object' && KINDS.includes((item as StoredAttachment).kind) &&
    typeof (item as StoredAttachment).id === 'string' && typeof (item as StoredAttachment).label === 'string');
  return list.length ? list : null;
}

interface SceneForAttachments {
  id: string;
  story_id: string;
  scene_number: number;
  magnific_identifier: string | null;
  storyboard_image_url: string | null;
  storyboard_attachments?: unknown;
  clip_attachments?: unknown;
  EpisodeLocation: { Location: { id: string; name: string } | null } | null;
  SceneCharacter: { Character: { id: string; name: string } | null }[];
  SceneProp: { Prop: { id: string; name: string } | null }[];
}

const SCENE_SELECT = 'id, story_id, scene_number, magnific_identifier, storyboard_image_url, EpisodeLocation(Location(id, name)), SceneCharacter(Character(id, name)), SceneProp(Prop(id, name))';

function sequenceCode(number: number) {
  return `SEQ ${String(number).padStart(2, '0')}`;
}

/** The automatic attachments: the sequence's cast, then its location and objects; a clip opens with its own storyboard. */
export function automaticAttachments(scene: SceneForAttachments, target: AttachmentTarget): StoredAttachment[] {
  const list: StoredAttachment[] = [];
  if (target === 'clip') list.push({ kind: 'storyboard', id: scene.id, label: `${sequenceCode(scene.scene_number)} storyboard`, role: 'opening frames, one panel per shot' });
  for (const link of scene.SceneCharacter || []) {
    if (link.Character) list.push({ kind: 'character', id: link.Character.id, label: `${link.Character.name} sheet`, role: 'appearance only' });
  }
  const location = scene.EpisodeLocation?.Location;
  if (location) list.push({ kind: 'location', id: location.id, label: `${location.name} sheet`, role: 'environment only' });
  for (const link of scene.SceneProp || []) {
    if (link.Prop) list.push({ kind: 'object', id: link.Prop.id, label: `${link.Prop.name} sheet`, role: 'object appearance only' });
  }
  return list;
}

async function loadSceneForAttachments(sceneId: string): Promise<SceneForAttachments> {
  // The attachment columns are read separately, so a database without them still resolves automatically.
  const { data, error } = await supabase.from('Scene').select(SCENE_SELECT).eq('id', sceneId).maybeSingle();
  if (error) throw new AttachmentError(error.message);
  if (!data) throw new AttachmentError('The sequence no longer exists.');
  const scene = data as unknown as SceneForAttachments;
  const { data: stored, error: storedError } = await supabase.from('Scene').select('storyboard_attachments, clip_attachments').eq('id', sceneId).maybeSingle();
  if (!storedError && stored) Object.assign(scene, stored);
  return scene;
}

const TABLE: Record<Exclude<AttachmentKind, 'storyboard'>, { table: string; url: string; owner: string }> = {
  character: { table: 'Character', url: 'generated_image_url', owner: 'character_generated' },
  location: { table: 'Location', url: 'generated_image_url', owner: 'location_generated' },
  object: { table: 'Prop', url: 'generated_image_url', owner: 'prop_generated' },
};

/** Looks up the Magnific identifier and image of every attachment, in order. */
export async function resolveAttachmentList(list: StoredAttachment[]): Promise<ResolvedAttachment[]> {
  const takeIds = list.flatMap((item) => (item.take_id ? [item.take_id] : []));
  const byKind = (kind: AttachmentKind) => [...new Set(list.filter((item) => item.kind === kind && !item.take_id).map((item) => item.id))];
  const [takes, characters, locations, objects, storyboards] = await Promise.all([
    takeIds.length ? supabase.from('ImageAsset').select('id, owner_type, owner_id, public_url, provider_identifier').in('id', takeIds) : null,
    byKind('character').length ? supabase.from('Character').select('id, name, magnific_identifier, generated_image_url').in('id', byKind('character')) : null,
    byKind('location').length ? supabase.from('Location').select('id, name, magnific_identifier, generated_image_url').in('id', byKind('location')) : null,
    byKind('object').length ? supabase.from('Prop').select('id, name, magnific_identifier, generated_image_url').in('id', byKind('object')) : null,
    byKind('storyboard').length ? supabase.from('Scene').select('id, scene_number, magnific_identifier, storyboard_image_url').in('id', byKind('storyboard')) : null,
  ]);
  for (const result of [takes, characters, locations, objects, storyboards]) {
    if (result?.error) throw new AttachmentError(result.error.message);
  }
  type Row = Record<string, string | number | null>;
  const rows = (result: { data: unknown } | null) => new Map(((result?.data || []) as Row[]).map((row) => [row.id as string, row]));
  const takeRows = rows(takes);
  const assetRows: Record<AttachmentKind, Map<string, Row>> = {
    character: rows(characters), location: rows(locations), object: rows(objects), storyboard: rows(storyboards),
  };

  return list.map((item, index): ResolvedAttachment => {
    const base = { ...item, image: index + 1 };
    if (item.take_id) {
      const take = takeRows.get(item.take_id);
      const owner = item.kind === 'storyboard' ? 'scene_storyboard' : TABLE[item.kind].owner;
      if (!take || take.owner_id !== item.id || take.owner_type !== owner) {
        return { ...base, identifier: null, url: null, problem: `${item.label}: that version no longer exists.` };
      }
      const identifier = (take.provider_identifier as string | null) || null;
      return {
        ...base, identifier, url: take.public_url as string,
        ...(identifier ? {} : { problem: `${item.label}: that version was uploaded, so it has no Magnific reference to attach.` }),
      };
    }
    const row = assetRows[item.kind].get(item.id);
    if (!row) return { ...base, identifier: null, url: null, problem: `${item.label}: it no longer exists.` };
    const identifier = (row.magnific_identifier as string | null) || null;
    const url = ((item.kind === 'storyboard' ? row.storyboard_image_url : row.generated_image_url) as string | null) || null;
    const problem = identifier ? undefined
      : item.kind === 'storyboard'
        ? `${item.label}: it has no generated storyboard in use (an uploaded one has no Magnific reference).`
        : `${item.label}: it has no reference sheet yet.`;
    return { ...base, identifier, url, ...(problem ? { problem } : {}) };
  });
}

/** A sequence's attachments for one request, chosen or automatic, resolved in order. */
export async function resolveSequenceAttachments(sceneId: string, target: AttachmentTarget): Promise<AttachmentSet> {
  const scene = await loadSceneForAttachments(sceneId);
  const stored = parseAttachments(scene[COLUMN[target]]);
  const attachments = await resolveAttachmentList(stored ?? automaticAttachments(scene, target));
  return {
    target,
    automatic: !stored,
    attachments,
    problems: attachments.flatMap((item) => (item.problem ? [item.problem] : [])),
  };
}

/**
 * What the n8n workflows receive: `attachments` in order (the workflows send them to Magnific in
 * that order), and the older name → identifier maps their validators still expect.
 */
export function webhookReferences(set: AttachmentSet) {
  const maps = { characters: {} as Record<string, string>, locations: {} as Record<string, string>, objects: {} as Record<string, string> };
  const key = { character: 'characters', location: 'locations', object: 'objects' } as const;
  for (const item of set.attachments) {
    if (item.identifier && item.kind !== 'storyboard') maps[key[item.kind]][item.label] = item.identifier;
  }
  return {
    references: maps,
    attachments: set.attachments.flatMap((item) => (item.identifier ? [{ image: item.image, kind: item.kind, name: item.label, identifier: item.identifier }] : [])),
  };
}

/**
 * Saves a chosen list for one request (null goes back to automatic). Every attachment must belong to
 * the sequence's episode; a clip always opens with its own storyboard, which is put first when missing.
 */
export async function saveSequenceAttachments(sceneId: string, target: AttachmentTarget, list: StoredAttachment[] | null): Promise<{ saved: StoredAttachment[] | null; notes: string[] }> {
  const scene = await loadSceneForAttachments(sceneId);
  const notes: string[] = [];
  let value: StoredAttachment[] | null = null;
  if (list) {
    value = list.map((item) => ({
      kind: item.kind, id: item.id, take_id: item.take_id || null, label: item.label.trim(), role: item.role?.trim() || null,
    }));
    if (target === 'clip' && !value.some((item) => item.kind === 'storyboard' && item.id === scene.id)) {
      value.unshift({ kind: 'storyboard', id: scene.id, take_id: null, label: `${sequenceCode(scene.scene_number)} storyboard`, role: 'opening frames, one panel per shot' });
      notes.push('The clip opens on its own storyboard, so it was put first as Image 1.');
    }
    if (value.length > MAX_ATTACHMENTS) throw new AttachmentError(`At most ${MAX_ATTACHMENTS} attachments per request.`);
    await checkBelongsToEpisode(scene.story_id, value);
  }
  const { error } = await supabase.from('Scene').update({ [COLUMN[target]]: value, updated_at: new Date().toISOString() }).eq('id', sceneId);
  if (error) {
    throw new AttachmentError(isMissingTable(error) || /column .* does not exist|schema cache/i.test(error.message)
      ? 'Attachments are not set up yet: run supabase/migrations/20261105000000_sequence_attachments.sql in the Supabase SQL editor.'
      : error.message);
  }
  return { saved: value, notes };
}

/** "Attach 3 images in this order: (1) Jaksh sheet, (2) ..." — the opening line of a storyboard prompt. */
export function storyboardAttachLine(set: AttachmentSet): string {
  const items = set.attachments.map((item) => `(${item.image}) ${item.label}${item.role ? ` — ${item.role}` : ''}`);
  return `Attach ${items.length} image${items.length === 1 ? '' : 's'} in this order: ${items.join(', ')}.`;
}

/** "Attachments: Image 1 SEQ 16 storyboard (opening frames), ..." — the opening line of a clip prompt. */
export function clipAttachLine(set: AttachmentSet): string {
  return `Attachments, in order: ${set.attachments.map((item) => `Image ${item.image} ${item.label}${item.role ? ` (${item.role})` : ''}`).join('; ')}.`;
}

/** A clip prompt with its first "Attachments…" paragraph replaced by the chosen list. */
export function withClipAttachLine(prompt: string, set: AttachmentSet): string {
  const line = clipAttachLine(set);
  return /^Attachments\b[^\n]*/.test(prompt) ? prompt.replace(/^Attachments\b[^\n]*/, line) : `${line}\n\n${prompt}`;
}

/** Every version of the given sheets (ImageAsset takes), oldest first, for choosing one. */
export async function sheetVersions(kind: Exclude<AttachmentKind, 'storyboard'>, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('ImageAsset').select('id, owner_id, public_url, provider_identifier, is_selected, created_at, prompt_used')
    .eq('owner_type', TABLE[kind].owner).in('owner_id', ids).order('created_at', { ascending: true });
  if (error) throw new AttachmentError(error.message);
  return (data || []) as { id: string; owner_id: string; public_url: string; provider_identifier: string | null; is_selected: boolean; created_at: string; prompt_used: string | null }[];
}

async function checkBelongsToEpisode(storyId: string, list: StoredAttachment[]) {
  const [cast, places, objects, scenes] = await Promise.all([
    supabase.from('StoryCharacter').select('character_id').eq('story_id', storyId),
    supabase.from('EpisodeLocation').select('location_id').eq('story_id', storyId),
    supabase.from('StoryProp').select('prop_id').eq('story_id', storyId),
    supabase.from('Scene').select('id').eq('story_id', storyId),
  ]);
  const ids: Record<AttachmentKind, Set<string>> = {
    character: new Set((cast.data || []).map((row) => row.character_id as string)),
    location: new Set((places.data || []).map((row) => row.location_id as string)),
    object: new Set((objects.data || []).map((row) => row.prop_id as string)),
    storyboard: new Set((scenes.data || []).map((row) => row.id as string)),
  };
  const outside = list.filter((item) => !ids[item.kind].has(item.id));
  if (outside.length) throw new AttachmentError(`Not part of this episode: ${outside.map((item) => item.label).join(', ')}. Link the asset to the episode first.`);
}
