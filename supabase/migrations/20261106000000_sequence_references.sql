-- Sequence reference images: camera maps, seating maps and other references made to fix a
-- sequence's storyboard after it failed several times. Each belongs to one sequence (a Scene row),
-- may name the issue it was made for, and can be attached to a storyboard or clip request like a sheet.
-- Run this in the Supabase SQL editor once.

create table "SequenceReference" (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references "Scene"(id) on delete cascade,
  story_id uuid not null references "Story"(id) on delete cascade,
  kind text not null default 'camera_map' check (kind in ('camera_map', 'seating_map', 'reference')),
  label text not null,
  image_url text not null,
  storage_bucket text,
  storage_path text,
  -- The Magnific identifier the generator needs to attach it; null until the image is in Magnific.
  magnific_identifier text,
  note_id uuid references "SequenceNote"(id) on delete set null,
  author text not null default 'admin' check (author in ('admin', 'claude')),
  created_at timestamptz not null default now()
);

create index idx_sequence_reference_scene on "SequenceReference"(scene_id, created_at);
create index idx_sequence_reference_story on "SequenceReference"(story_id);
