-- Sequence attachments: the reference images sent with a sequence's storyboard and clip requests,
-- in order, as Claude chose them (Image 1, Image 2, ...). Null means automatic: the sequence's cast,
-- location and objects (and, for the clip, its own storyboard first).
-- Run this in the Supabase SQL editor once. Until it runs, attachments stay automatic.

alter table "Scene" add column storyboard_attachments jsonb;
alter table "Scene" add column clip_attachments jsonb;

comment on column "Scene".storyboard_attachments is 'Ordered reference images for the storyboard image request; null = automatic.';
comment on column "Scene".clip_attachments is 'Ordered reference images for the clip request; null = automatic.';
