-- Episode Pre-Production Pipeline schema.
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to run once; re-running will error on "already exists" (by design, no IF NOT EXISTS
-- on CREATE TABLE so you notice if it's already applied).

-- ── Reusable libraries ──────────────────────────────────────────────────────

create table "Character" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  reference_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table "Location" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  reference_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Story gains pipeline tracking columns ───────────────────────────────────

alter table "Story" add column production_stage text not null default 'story';
  -- story | locations | stylesheets | scenes | storyboards | beats | complete
alter table "Story" add column previous_story_id uuid references "Story"(id);

create table "StoryCharacter" (
  story_id uuid not null references "Story"(id) on delete cascade,
  character_id uuid not null references "Character"(id) on delete cascade,
  primary key (story_id, character_id)
);

-- ── Per-episode location instance ───────────────────────────────────────────

create table "EpisodeLocation" (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references "Story"(id) on delete cascade,
  location_id uuid not null references "Location"(id) on delete restrict,
  order_index int not null default 0,
  stylesheet_prompt text not null default '',
  stylesheet_image_url text,
  status text not null default 'pending', -- pending | generating | generated | approved
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, location_id)
);

create table "Scene" (
  id uuid primary key default gen_random_uuid(),
  episode_location_id uuid not null references "EpisodeLocation"(id) on delete cascade,
  scene_number int not null,
  description text not null default '',
  storyboard_prompt text not null default '',
  storyboard_image_url text,
  storyboard_status text not null default 'pending', -- pending | generating | generated | approved
  beats_status text not null default 'pending',       -- pending | generating | generated | approved
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_location_id, scene_number)
);

create table "SceneCharacter" (
  scene_id uuid not null references "Scene"(id) on delete cascade,
  character_id uuid not null references "Character"(id) on delete cascade,
  primary key (scene_id, character_id)
);

create table "Beat" (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references "Scene"(id) on delete cascade,
  beat_number int not null,
  action text not null default '',
  camera text not null default '',
  motion text not null default '',
  dialogue text not null default '',
  sfx text not null default '',
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scene_id, beat_number)
);

-- ── Unified image generation/upload history ─────────────────────────────────

create table "ImageAsset" (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null, -- character_reference | location_reference | episode_location_stylesheet | scene_storyboard
  owner_id uuid not null,
  storage_path text not null,
  public_url text not null,
  source text not null,     -- upload | generated
  prompt_used text,         -- null for uploads
  is_selected boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_image_asset_owner on "ImageAsset" (owner_type, owner_id);

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- Public bucket for pre-production art (not sensitive). If your Supabase project
-- disallows bucket creation via SQL, create it manually instead:
-- Dashboard -> Storage -> New bucket -> name "episode-assets" -> Public bucket: on.

insert into storage.buckets (id, name, public)
values ('episode-assets', 'episode-assets', true)
on conflict (id) do nothing;
