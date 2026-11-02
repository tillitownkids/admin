import { supabase } from '@/lib/supabase';
import { isMissingTable } from '@/lib/promptHistory';

// Issues and notes on a sequence (SequenceNote rows), from the admin or from Claude over MCP.

export type NoteKind = 'issue' | 'note';
export type NoteStatus = 'open' | 'resolved';
export type NoteAuthor = 'admin' | 'claude';

export interface SequenceNote {
  id: string;
  scene_id: string;
  story_id: string;
  kind: NoteKind;
  body: string;
  media_url: string | null;
  status: NoteStatus;
  author: NoteAuthor;
  created_at: string;
  resolved_at: string | null;
}

export class SequenceNoteError extends Error {}

const NOT_SET_UP = 'Issues and notes are not set up yet: run supabase/migrations/20261102000000_sequence_workspace.sql in the Supabase SQL editor.';

/** Notes of an episode, or of one sequence, newest first. `available` is false until the migration has been run. */
export async function listSequenceNotes(filter: { storyId?: string; sceneId?: string }): Promise<{ available: boolean; notes: SequenceNote[] }> {
  let query = supabase.from('SequenceNote').select('*').order('created_at', { ascending: false }).limit(500);
  if (filter.sceneId) query = query.eq('scene_id', filter.sceneId);
  else if (filter.storyId) query = query.eq('story_id', filter.storyId);
  else throw new SequenceNoteError('An episode or a sequence is needed.');
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return { available: false, notes: [] };
    throw new SequenceNoteError(`Notes could not be loaded: ${error.message}`);
  }
  return { available: true, notes: (data || []) as SequenceNote[] };
}

export async function addSequenceNote(input: {
  sceneId: string;
  kind: NoteKind;
  body: string;
  mediaUrl?: string | null;
  author: NoteAuthor;
}): Promise<SequenceNote> {
  const body = input.body.trim();
  if (!body) throw new SequenceNoteError('Write the issue or note first.');
  const { data: scene, error: sceneError } = await supabase.from('Scene').select('id, story_id').eq('id', input.sceneId).maybeSingle();
  if (sceneError) throw new SequenceNoteError(sceneError.message);
  if (!scene?.story_id) throw new SequenceNoteError('The sequence no longer exists.');
  const { data, error } = await supabase.from('SequenceNote').insert([{
    scene_id: input.sceneId,
    story_id: scene.story_id,
    kind: input.kind,
    body,
    media_url: input.mediaUrl || null,
    author: input.author,
  }]).select('*').single();
  if (error) throw new SequenceNoteError(isMissingTable(error) ? NOT_SET_UP : error.message);
  return data as SequenceNote;
}

export async function setSequenceNoteStatus(noteId: string, status: NoteStatus): Promise<SequenceNote> {
  const { data, error } = await supabase.from('SequenceNote')
    .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
    .eq('id', noteId).select('*').maybeSingle();
  if (error) throw new SequenceNoteError(isMissingTable(error) ? NOT_SET_UP : error.message);
  if (!data) throw new SequenceNoteError('That note no longer exists.');
  return data as SequenceNote;
}
