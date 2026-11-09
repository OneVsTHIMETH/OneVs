-- Allow one scene to use multiple saved characters while retaining legacy character_id.
alter table public.scenes
  add column if not exists character_ids uuid[] not null default '{}'::uuid[];

-- Backfill the existing single-character relation into the new array.
update public.scenes
set character_ids = array[character_id]
where character_id is not null
  and coalesce(array_length(character_ids, 1), 0) = 0;
