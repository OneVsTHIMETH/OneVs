# Final setup — AI Film Studio

For the latest audio editing workflow, follow `AUTO-AUDIO-SETUP.md`.

The automatic audio editor is a front-end update. Keep your existing Cloudflare Worker URL and `MAGIC_HOUR_API_KEY` secret. If you use Supabase, run the new `supabase/migrations/20261110_scene_audio_tracks.sql` migration once before saving generated music/SFX to the cloud.

The final MP4 render script is in `worker/render.py`; on Windows run `worker/render.bat` after putting the downloaded scene clips, audio files and render manifest together in the same folder. Install Python and FFmpeg first.
