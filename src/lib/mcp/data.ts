import { supabase } from '@/lib/supabase';
import { findExistingByName, matchCharactersByName } from '@/lib/characterNames';
import { stripHtmlToMarkdown } from '@/lib/scriptText';

// Database reads and writes for the MCP tools. Supabase only (Prisma has no connection in production).

export class ToolError extends Error {}

type Query = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function rows<T>(query: Query): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new ToolError(error.message);
  return (data || []) as T[];
}

export async function one<T>(query: Query): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new ToolError(error.message);
  return (data ?? null) as T | null;
}

export interface LibraryItem {
  id: string;
  name: string;
  description: string;
  magnific_identifier: string | null;
}

export interface PropItem extends LibraryItem {
  kind: string;
  story_id: string | null;
}

export interface StoryRow {
  id: string;
  topic: string | null;
  content: string | null;
  status: string;
}

export async function loadStory(storyId: string): Promise<StoryRow> {
  const story = await one<StoryRow>(supabase.from('Story').select('id, topic, content, status').eq('id', storyId).maybeSingle());
  if (!story) throw new ToolError(`No episode with id ${storyId}. Call list_episodes for valid ids.`);
  return story;
}

export interface ScriptRow {
  id: string;
  content: string | null;
  generated_at: string;
}

/** The episode's current script: its newest, as the admin shows it. */
export async function loadScript(storyId: string): Promise<ScriptRow | null> {
  const [script] = await rows<ScriptRow>(
    supabase.from('Script').select('id, content, generated_at').eq('story_id', storyId).order('generated_at', { ascending: false }).limit(1)
  );
  return script ?? null;
}

export function markdownOf(content: string | null | undefined): string {
  return stripHtmlToMarkdown(content || '');
}

export interface EpisodeCast {
  characters: LibraryItem[];
  /** Each with the id of its link row, which scenes point at. */
  locations: (LibraryItem & { episode_location_id: string })[];
  objects: PropItem[];
}

export async function loadEpisodeCast(storyId: string): Promise<EpisodeCast> {
  const [cast, places, objects] = await Promise.all([
    rows<{ Character: LibraryItem | null }>(
      supabase.from('StoryCharacter').select('Character(id, name, description, magnific_identifier)').eq('story_id', storyId)
    ),
    rows<{ id: string; Location: LibraryItem | null }>(
      supabase.from('EpisodeLocation').select('id, Location(id, name, description, magnific_identifier)').eq('story_id', storyId).order('order_index', { ascending: true })
    ),
    rows<{ Prop: PropItem | null }>(
      supabase.from('StoryProp').select('Prop(id, name, description, magnific_identifier, kind, story_id)').eq('story_id', storyId)
    ),
  ]);
  return {
    characters: cast.flatMap((row) => (row.Character ? [row.Character] : [])),
    locations: places.flatMap((row) => (row.Location ? [{ ...row.Location, episode_location_id: row.id }] : [])),
    objects: objects.flatMap((row) => (row.Prop ? [row.Prop] : [])),
  };
}

export async function loadLibrary() {
  const [characters, locations, objects] = await Promise.all([
    rows<LibraryItem>(supabase.from('Character').select('id, name, description, magnific_identifier').order('name')),
    rows<LibraryItem>(supabase.from('Location').select('id, name, description, magnific_identifier').order('name')),
    rows<PropItem>(supabase.from('Prop').select('id, name, description, magnific_identifier, kind, story_id').order('name')),
  ]);
  return { characters, locations, objects };
}

/**
 * Library entries for the given names, matched exactly (case and spacing aside), as the admin
 * matches them. An unknown name is an error naming the closest entry, so nothing is linked by guess.
 */
export function resolveNames<T extends { name: string }>(
  kind: 'character' | 'location' | 'object',
  available: T[],
  names: string[] | undefined,
  /** What to do about an unknown name. */
  fix = 'Use exact names from list_library, or add new ones with create_library_item.',
): T[] {
  const { matched, unmatched } = matchCharactersByName(available, names || []);
  if (unmatched.length) {
    const hints = unmatched.map((name) => {
      const near = findExistingByName(name, available);
      return near ? `"${name}" (did you mean "${near.name}"?)` : `"${name}"`;
    });
    throw new ToolError(`Unknown ${kind} name${unmatched.length === 1 ? '' : 's'}: ${hints.join(', ')}. ${fix}`);
  }
  return matched;
}

export const NOT_IN_EPISODE = 'Use the exact names get_episode lists for this episode, or add them first with link_episode_assets.';

/** Adds characters, locations and objects to an episode. Existing links are kept as they are. */
export async function linkToEpisode(storyId: string, items: { characters?: LibraryItem[]; locations?: LibraryItem[]; objects?: PropItem[] }) {
  if (items.characters?.length) {
    const { error } = await supabase.from('StoryCharacter').upsert(
      items.characters.map((character) => ({ story_id: storyId, character_id: character.id })),
      { onConflict: 'story_id,character_id', ignoreDuplicates: true }
    );
    if (error) throw new ToolError(`Characters could not be linked: ${error.message}`);
  }
  if (items.locations?.length) {
    const existing = await rows<{ location_id: string }>(supabase.from('EpisodeLocation').select('location_id').eq('story_id', storyId));
    const linked = new Set(existing.map((row) => row.location_id));
    const fresh = items.locations.filter((location) => !linked.has(location.id));
    if (fresh.length) {
      const { error } = await supabase.from('EpisodeLocation').insert(
        fresh.map((location, index) => ({ story_id: storyId, location_id: location.id, order_index: existing.length + index, status: 'pending' }))
      );
      if (error) throw new ToolError(`Locations could not be linked: ${error.message}`);
    }
  }
  if (items.objects?.length) {
    const { error } = await supabase.from('StoryProp').upsert(
      items.objects.map((object) => ({ story_id: storyId, prop_id: object.id })),
      { onConflict: 'story_id,prop_id', ignoreDuplicates: true }
    );
    if (error) throw new ToolError(`Objects could not be linked: ${error.message}`);
  }
}

export interface SceneRow {
  id: string;
  scene_number: number;
  description: string;
  beat_numbers: number[] | null;
  script_beats: string | null;
  storyboard_prompt: string;
  storyboard_image_url: string | null;
  video_prompt: string | null;
  video_url: string | null;
  episode_location_id: string;
  EpisodeLocation: { Location: { name: string } | null } | null;
  SceneCharacter: { Character: { id: string; name: string } | null }[];
  SceneProp: { Prop: { id: string; name: string } | null }[];
}

const SCENE_FIELDS = 'id, story_id, scene_number, description, beat_numbers, script_beats, storyboard_prompt, storyboard_image_url, video_prompt, video_url, episode_location_id, EpisodeLocation(Location(name)), SceneCharacter(Character(id, name)), SceneProp(Prop(id, name))';

export async function loadScenes(storyId: string): Promise<SceneRow[]> {
  return rows<SceneRow>(supabase.from('Scene').select(SCENE_FIELDS).eq('story_id', storyId).order('scene_number', { ascending: true }));
}

export async function loadScene(sceneId: string): Promise<SceneRow & { story_id: string }> {
  const scene = await one<SceneRow & { story_id: string }>(supabase.from('Scene').select(SCENE_FIELDS).eq('id', sceneId).maybeSingle());
  if (!scene) throw new ToolError(`No scene with id ${sceneId}. Call get_episode for the episode's scene ids.`);
  return scene;
}

export function sceneCharacterNames(scene: SceneRow): string[] {
  return scene.SceneCharacter.flatMap((link) => (link.Character ? [link.Character.name] : []));
}

export function sceneObjectNames(scene: SceneRow): string[] {
  return (scene.SceneProp || []).flatMap((link) => (link.Prop ? [link.Prop.name] : []));
}

/** Replaces a scene's character and object links when a list is given (an empty list clears them). */
export async function replaceSceneLinks(sceneId: string, characters?: { id: string }[], objects?: { id: string }[]) {
  if (characters) {
    const { error } = await supabase.from('SceneCharacter').delete().eq('scene_id', sceneId);
    if (error) throw new ToolError(`Scene characters could not be replaced: ${error.message}`);
    if (characters.length) {
      const { error: insertError } = await supabase.from('SceneCharacter').insert(characters.map((character) => ({ scene_id: sceneId, character_id: character.id })));
      if (insertError) throw new ToolError(`Scene characters could not be saved: ${insertError.message}`);
    }
  }
  if (objects) {
    const { error } = await supabase.from('SceneProp').delete().eq('scene_id', sceneId);
    if (error) throw new ToolError(`Scene objects could not be replaced: ${error.message}`);
    if (objects.length) {
      const { error: insertError } = await supabase.from('SceneProp').insert(objects.map((object) => ({ scene_id: sceneId, prop_id: object.id })));
      if (insertError) throw new ToolError(`Scene objects could not be saved: ${insertError.message}`);
    }
  }
}

export async function loadSettings(): Promise<{ targetAudience?: string; tone?: string }> {
  const settings = await rows<{ key: string; value: string }>(supabase.from('Setting').select('key, value').in('key', ['targetAudience', 'tone'])).catch(() => []);
  const map = new Map(settings.map((row) => [row.key, row.value]));
  return { targetAudience: map.get('targetAudience'), tone: map.get('tone') };
}
