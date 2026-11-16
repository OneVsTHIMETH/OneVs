-- Persist generated image-to-video task metadata and provider result URL.
alter table public.scenes add column if not exists generated_video_url text;
alter table public.scenes add column if not exists video_provider text;
alter table public.scenes add column if not exists video_task_id text;
alter table public.scenes add column if not exists video_task_status text;
