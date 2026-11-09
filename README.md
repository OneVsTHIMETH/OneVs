# AI Film Studio — Free Cloud AI edition

A responsive light-theme film-planning studio with a Cloudflare Workers AI backend for AI story writing, storyboard generation, and still-image generation.

## Features

- Reusable character library with reference images.
- Generate character concept images with Cloudflare Workers AI.
- Create film projects in Sinhala, English or bilingual mode (custom target duration from 10 seconds to 60 minutes).
- Generate an editable scene-by-scene storyboard matched to the requested total duration using Cloudflare Workers AI.\n- Automatically generate scene artwork from text prompts; no reference/background image or pre-created character is required.\n- View and delete saved characters; delete saved projects and their scenes.
- Generate still images for individual scenes.
- Assign multiple saved characters to a scene: type their exact saved names in the visual prompt or dialogue and the studio automatically detects and selects them. You can also select several characters manually.
- Scene image prompts include every assigned character name, style and saved description to improve character consistency.
- Preview dialogue with browser/device speech synthesis (voice availability depends on device; Sinhala is not guaranteed).
- Timeline preview, screenplay export and project JSON export.
- Optional Supabase email authentication, private Storage and database sync.
- Cloudflare Worker backend keeps Cloudflare credentials off the frontend.

## Quick start

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Activate free Cloud AI

Read `FINAL-SETUP.md`. In short:

```bash
cd worker
npm install
npx wrangler login
# Set ALLOWED_ORIGIN in wrangler.toml to your website origin
npx wrangler deploy
```

Copy the deployed Worker URL into **Studio Settings → Free Cloud AI connection** and test it. No OpenAI API key is required. Cloudflare Workers AI Free currently has a limited 10,000-Neuron daily allowance; requests stop when the free quota is exhausted.

## Honest feature limits

This free-cloud edition does not provide text-to-video motion generation, full-video background replacement, hosted Sinhala AI voice files, guaranteed 360-degree character reconstruction, or cloud MP4 rendering. It creates storyboards and still images and lets you organize/edit/export the project. See `FINAL-SETUP.md`.

## Supabase (optional)

Run `supabase/schema.sql` for a new database. For an existing database, run both `supabase/migrations/20261109_custom_durations.sql` and `supabase/migrations/20261109_scene_multiple_characters.sql` in the Supabase SQL Editor. Enable email authentication, keep RLS and private buckets enabled, then configure the project URL and anon/publishable key in Studio Settings. Never place service-role keys in frontend code.
