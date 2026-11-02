-- Sequence workspace: issues and notes on a sequence, and the history of its prompts.
-- A sequence is a row of "Scene" (the app says sequence; the table keeps its name).
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query). Safe to run once;
-- re-running errors on "already exists" by design, so you notice if it is already applied.
-- Until it runs, the admin works as before; only the Issues & notes and History panels stay empty.

-- An issue found in a sequence's storyboard or clip, or a note about it. Written from the admin or by
-- Claude through the MCP server. media_url points at the take the issue is about, when there is one.
create table "SequenceNote" (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references "Scene"(id) on delete cascade,
  story_id uuid not null references "Story"(id) on delete cascade,
  kind text not null default 'issue' check (kind in ('issue', 'note')),
  body text not null,
  media_url text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  author text not null default 'admin' check (author in ('admin', 'claude')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Every saved version of a sequence's beats, storyboard prompt and clip prompt, so any of them can
-- be restored. The clip prompt is the prompt text only, never the clip plan with its takes.
-- 'original' marks the text a field had before its first recorded change.
create table "PromptVersion" (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references "Scene"(id) on delete cascade,
  field text not null check (field in ('beats', 'storyboard_prompt', 'clip_prompt')),
  value text not null,
  author text not null default 'admin' check (author in ('admin', 'claude', 'ai', 'original')),
  created_at timestamptz not null default now()
);

create index idx_sequence_note_story on "SequenceNote"(story_id);
create index idx_sequence_note_scene on "SequenceNote"(scene_id, created_at desc);
create index idx_prompt_version_scene on "PromptVersion"(scene_id, field, created_at desc);
