-- Run this migration in Supabase SQL Editor for an existing AI Film Studio database.
alter table public.projects drop constraint if exists projects_target_duration_seconds_check;
alter table public.projects add constraint projects_target_duration_seconds_check
  check (target_duration_seconds between 10 and 3600);

alter table public.scenes drop constraint if exists scenes_duration_seconds_check;
alter table public.scenes add constraint scenes_duration_seconds_check
  check (duration_seconds between 1 and 3600);
