-- Per-scene automatic music/SFX and dialogue selection for Film Editor.
alter table public.scenes add column if not exists selected_dialogue_id text;
alter table public.scenes add column if not exists music_mood text default 'magical';
alter table public.scenes add column if not exists background_music_path text;
alter table public.scenes add column if not exists sfx_audio_path text;
