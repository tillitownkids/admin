-- Object sheets: vehicles, bags, tents and other objects that appear in episodes.
-- Called "props" in the database and code ("Object" clashes with JavaScript's Object in the Prisma
-- client); the app calls them Objects.
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query). Safe to run once;
-- re-running errors on "already exists" by design, so you notice if it is already applied.

-- An object in the library. A permanent object is reused across episodes; an episode object
-- belongs to one episode (story_id) and is deleted with it, unless it is promoted to permanent.
create table "Prop" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  kind text not null default 'permanent' check (kind in ('permanent', 'episode')),
  story_id uuid references "Story"(id) on delete cascade,
  -- Set by object detection when an episode object looks likely to return; you decide whether to promote it.
  suggest_permanent boolean not null default false,
  reference_image_url text,
  generated_image_url text,
  magnific_identifier text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prop_episode_owner check ((kind = 'episode') = (story_id is not null))
);

-- Which objects appear in an episode (permanent ones can appear in many).
create table "StoryProp" (
  story_id uuid not null references "Story"(id) on delete cascade,
  prop_id uuid not null references "Prop"(id) on delete cascade,
  primary key (story_id, prop_id)
);

-- Which objects appear in a scene, so its storyboard and clips get their sheets as references.
create table "SceneProp" (
  scene_id uuid not null references "Scene"(id) on delete cascade,
  prop_id uuid not null references "Prop"(id) on delete cascade,
  primary key (scene_id, prop_id)
);

create index idx_prop_story on "Prop"(story_id);
create index idx_story_prop_prop on "StoryProp"(prop_id);
create index idx_scene_prop_prop on "SceneProp"(prop_id);
