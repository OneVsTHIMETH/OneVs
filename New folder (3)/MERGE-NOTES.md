# Merge notes

This package uses **AI-Film-Studio-Reconnected-Fixed** as its main codebase because it contains the newer scene audio editor, multiple image/video/voice variants, Supabase audio-track migration, and the more complete FFmpeg render script.

The second archive's Magic Hour / Cloudflare setup guide is included separately as:
`work/MAGIC-HOUR-FREE-ONLY-SETUP.md`

Important:
- The main `work/worker/worker.js`, `work/assets/js/app.js`, `work/assets/css/style.css`, and `work/index.html` are retained from the first archive. Replacing them with the second archive's older versions would remove features.
- The first archive's CORS default includes `https://onevs.pages.dev`; keep `ALLOWED_ORIGIN` in `work/worker/wrangler.toml` aligned with the exact deployed website origin.
- The Supabase audio migration in `work/supabase/migrations/20261110_scene_audio_tracks.sql` must be run if using the audio editor.
- Configure secrets only in Cloudflare Worker settings / Wrangler; do not put API secrets in frontend JavaScript.
