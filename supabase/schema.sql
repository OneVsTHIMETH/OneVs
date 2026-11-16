-- AI Film Studio initial schema
-- Run in Supabase SQL Editor. Enable RLS on every user-owned table.
create extension if not exists pgcrypto;

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  style text not null default '3D animated',
  description text,
  reference_image_path text,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  story_prompt text,
  language text not null default 'en',
  aspect_ratio text not null default '16:9' check (aspect_ratio in ('16:9','9:16','1:1')),
  target_duration_seconds integer not null default 300 check (target_duration_seconds between 10 and 3600),
  status text not null default 'draft' check (status in ('draft','queued','processing','completed','failed')),
  output_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade existing installations to support custom 10-second to 60-minute targets.
alter table public.projects drop constraint if exists projects_target_duration_seconds_check;
alter table public.projects add constraint projects_target_duration_seconds_check
  check (target_duration_seconds between 10 and 3600);
-- English-only studio: normalize old projects before enforcing the new constraint.
update public.projects set language = 'en' where language is distinct from 'en';
alter table public.projects alter column language set default 'en';
alter table public.projects drop constraint if exists projects_language_check;
alter table public.projects add constraint projects_language_check check (language = 'en');

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  character_ids uuid[] not null default '{}'::uuid[],
  scene_order integer not null,
  duration_seconds integer not null default 8 check (duration_seconds between 1 and 3600),
  trim_start_seconds numeric not null default 0 check (trim_start_seconds >= 0),
  trim_end_seconds numeric not null default 8 check (trim_end_seconds >= 0),
  visual_prompt text not null default '',
  reference_image_path text,
  dialogue_text text,
  voice_language text not null default 'en',
  sound_prompt text,
  generated_video_path text,
  generated_voice_path text,
  status text not null default 'draft' check (status in ('draft','queued','processing','completed','failed')),
  created_at timestamptz not null default now(),
  unique(project_id, scene_order)
);

alter table public.scenes add column if not exists trim_start_seconds numeric not null default 0;
alter table public.scenes add column if not exists trim_end_seconds numeric not null default 8;
update public.scenes set trim_end_seconds = duration_seconds where trim_end_seconds = 8 and duration_seconds <> 8;

-- Upgrade existing installations to allow scene lengths matching the full project duration.
alter table public.scenes drop constraint if exists scenes_duration_seconds_check;
alter table public.scenes add constraint scenes_duration_seconds_check
  check (duration_seconds between 1 and 3600);
-- English-only dialogue and voice generation.
update public.scenes set voice_language = 'en' where voice_language is distinct from 'en';
alter table public.scenes alter column voice_language set default 'en';
alter table public.scenes drop constraint if exists scenes_voice_language_check;
alter table public.scenes add constraint scenes_voice_language_check check (voice_language = 'en');

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete cascade,
  job_type text not null check (job_type in ('image','video','voice','background','render')),
  provider text,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  provider_job_id text,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.background_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_video_path text not null,
  background_mode text not null check (background_mode in ('text','image')),
  background_prompt text,
  background_image_path text,
  output_video_path text,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  created_at timestamptz not null default now()
);

alter table public.characters enable row level security;
alter table public.projects enable row level security;
alter table public.scenes enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.background_edits enable row level security;

drop policy if exists "characters_select_own" on public.characters;
create policy "characters_select_own" on public.characters for select using (auth.uid() = user_id);
drop policy if exists "characters_insert_own" on public.characters;
create policy "characters_insert_own" on public.characters for insert with check (auth.uid() = user_id);
drop policy if exists "characters_update_own" on public.characters;
create policy "characters_update_own" on public.characters for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "characters_delete_own" on public.characters;
create policy "characters_delete_own" on public.characters for delete using (auth.uid() = user_id);

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects for select using (auth.uid() = user_id);
drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects for insert with check (auth.uid() = user_id);
drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects for delete using (auth.uid() = user_id);

-- Scene access is inherited from its owning project.
drop policy if exists "scenes_select_own" on public.scenes;
create policy "scenes_select_own" on public.scenes for select using (
  exists(select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);
drop policy if exists "scenes_insert_own" on public.scenes;
create policy "scenes_insert_own" on public.scenes for insert with check (
  exists(select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);
drop policy if exists "scenes_update_own" on public.scenes;
create policy "scenes_update_own" on public.scenes for update using (
  exists(select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
) with check (
  exists(select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);
drop policy if exists "scenes_delete_own" on public.scenes;
create policy "scenes_delete_own" on public.scenes for delete using (
  exists(select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);

drop policy if exists "jobs_select_own" on public.generation_jobs;
create policy "jobs_select_own" on public.generation_jobs for select using (auth.uid() = user_id);
drop policy if exists "jobs_insert_own" on public.generation_jobs;
create policy "jobs_insert_own" on public.generation_jobs for insert with check (auth.uid() = user_id);
drop policy if exists "jobs_update_own" on public.generation_jobs;
create policy "jobs_update_own" on public.generation_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "background_select_own" on public.background_edits;
create policy "background_select_own" on public.background_edits for select using (auth.uid() = user_id);
drop policy if exists "background_insert_own" on public.background_edits;
create policy "background_insert_own" on public.background_edits for insert with check (auth.uid() = user_id);
drop policy if exists "background_update_own" on public.background_edits;
create policy "background_update_own" on public.background_edits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage buckets: create these in Storage dashboard, set private.
insert into storage.buckets (id, name, public) values
 ('character-references','character-references',false),
 ('project-assets','project-assets',false),
 ('generated-media','generated-media',false)
on conflict (id) do nothing;

-- Private bucket object policies: path must start with authenticated user's UUID.
drop policy if exists "user_upload_character_assets" on storage.objects;
create policy "user_upload_character_assets" on storage.objects for insert to authenticated
with check (bucket_id in ('character-references','project-assets','generated-media') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "user_read_character_assets" on storage.objects;
create policy "user_read_character_assets" on storage.objects for select to authenticated
using (bucket_id in ('character-references','project-assets','generated-media') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "user_delete_character_assets" on storage.objects;
create policy "user_delete_character_assets" on storage.objects for delete to authenticated
using (bucket_id in ('character-references','project-assets','generated-media') and (storage.foldername(name))[1] = auth.uid()::text);

-- Upload paths must begin with the authenticated user's UUID.
-- The browser implementation uses `${auth.uid()}/...` paths.
-- Add provider-specific webhook verification and service-worker-only job updates before production.

