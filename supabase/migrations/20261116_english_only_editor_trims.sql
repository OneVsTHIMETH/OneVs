-- AI Film Studio: English-only workflow and manual clip trim metadata.
-- Safe to run on an existing Supabase project.
update public.projects set language = 'en' where language is distinct from 'en';
alter table public.projects alter column language set default 'en';
alter table public.projects drop constraint if exists projects_language_check;
alter table public.projects add constraint projects_language_check check (language = 'en');

update public.scenes set voice_language = 'en' where voice_language is distinct from 'en';
alter table public.scenes alter column voice_language set default 'en';
alter table public.scenes drop constraint if exists scenes_voice_language_check;
alter table public.scenes add constraint scenes_voice_language_check check (voice_language = 'en');

alter table public.scenes add column if not exists trim_start_seconds numeric not null default 0;
alter table public.scenes add column if not exists trim_end_seconds numeric not null default 8;
update public.scenes set trim_end_seconds = duration_seconds where trim_end_seconds = 8 and duration_seconds <> 8;
