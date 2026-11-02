import { supabase } from '@/lib/supabase';
import { parseShotPlan } from '@/lib/sceneShots';

// The history of a sequence's beats, storyboard prompt and clip prompt (PromptVersion rows). History
// is a record, never a gate: when the table is missing (migration not run) or a write fails, the save
// it describes still goes through.

export type PromptField = 'beats' | 'storyboard_prompt' | 'clip_prompt';
export type PromptAuthor = 'admin' | 'claude' | 'ai' | 'original';

export const PROMPT_FIELDS: PromptField[] = ['beats', 'storyboard_prompt', 'clip_prompt'];
export const PROMPT_AUTHORS: PromptAuthor[] = ['admin', 'claude', 'ai', 'original'];

export interface PromptVersion {
  id: string;
  scene_id: string;
  field: PromptField;
  value: string;
  author: PromptAuthor;
  created_at: string;
}

/** True when a Supabase error says the table does not exist yet. */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message || '');
}

/** The clip prompt text of a sequence: its planned clip's prompt, or an older plain-text prompt. */
export function clipPromptOf(videoPrompt: string | null | undefined): string | null {
  const plan = parseShotPlan(videoPrompt);
  if (plan) return plan.shots[0]?.prompt ?? null;
  const text = (videoPrompt || '').trim();
  return text && !text.startsWith('{') ? text : null;
}

/**
 * Records a new version of a field. Unchanged text is not recorded. The first time a field is
 * recorded, the text it had before (`previous`) is stored first as the original, so the first change
 * can be undone.
 */
export async function recordPromptVersion(
  sceneId: string,
  field: PromptField,
  value: string | null | undefined,
  author: PromptAuthor,
  previous?: string | null,
): Promise<void> {
  const text = value ?? '';
  try {
    const { data, error } = await supabase
      .from('PromptVersion').select('value').eq('scene_id', sceneId).eq('field', field)
      .order('created_at', { ascending: false }).limit(1);
    if (error) {
      if (!isMissingTable(error)) console.warn('Prompt history could not be read:', error.message);
      return;
    }
    const latest = data?.[0]?.value as string | undefined;
    if (latest === text) return;
    const rows: { scene_id: string; field: PromptField; value: string; author: PromptAuthor }[] = [];
    if (latest === undefined && previous && previous.trim() && previous !== text) {
      rows.push({ scene_id: sceneId, field, value: previous, author: 'original' });
    }
    if (text.trim()) rows.push({ scene_id: sceneId, field, value: text, author });
    if (!rows.length) return;
    // Inserted one by one so their created_at order matches the order written.
    for (const row of rows) {
      const { error: insertError } = await supabase.from('PromptVersion').insert([row]);
      if (insertError) {
        console.warn('Prompt history could not be saved:', insertError.message);
        return;
      }
    }
  } catch (error) {
    console.warn('Prompt history could not be saved:', error);
  }
}

/** A sequence's versions, newest first. `available` is false until the migration has been run. */
export async function listPromptVersions(sceneId: string): Promise<{ available: boolean; versions: PromptVersion[] }> {
  const { data, error } = await supabase
    .from('PromptVersion').select('*').eq('scene_id', sceneId).order('created_at', { ascending: false }).limit(200);
  if (error) {
    if (isMissingTable(error)) return { available: false, versions: [] };
    throw new Error(`The history could not be loaded: ${error.message}`);
  }
  return { available: true, versions: (data || []) as PromptVersion[] };
}

export async function loadPromptVersion(versionId: string): Promise<PromptVersion> {
  const { data, error } = await supabase.from('PromptVersion').select('*').eq('id', versionId).maybeSingle();
  if (error) throw new Error(isMissingTable(error) ? 'Prompt history is not set up yet.' : error.message);
  if (!data) throw new Error('That version no longer exists.');
  return data as PromptVersion;
}
