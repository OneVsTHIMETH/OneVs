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


## Character, dialogue and voice controls (2026-11-10)
- Select saved characters in Project Setup and map story aliases such as `Jessica -> MAYA`.
- Scene cards detect saved names/aliases and allow multiple character assignment.
- Scene artwork can be regenerated, removed, or replaced with an uploaded image. The current FLUX text-to-image route is text-only and cannot guarantee exact reference-image identity.
- Dialogue is edited per speaker. English AI voice can be generated through Cloudflare Workers AI MeloTTS; voice audio can be deleted and regenerated. Sinhala is currently browser voice preview only.
- Generated voice audio is stored in the existing private project-assets bucket; the dialogue JSON stores each audio asset path.

## Story character analysis and scene breakdown update
- In Project Setup, use **Analyse Story & Find Characters** after writing the story. The Worker returns the named characters it detects.
- Each detected story name has its own dropdown. Choose a saved Character Studio character, or leave **AI creates this character** selected.
- The mapping is stored with the project. For example, story name `Maya` can be assigned to the saved Studio character `MAYA` while the screenplay continues to call her `Maya`.
- Generated scenes now request a per-character breakdown: character name, Studio/AI source, appearance, acting/action, individual dialogue, character sound/SFX direction, and voice style. Silent characters can still have an action row.
- Dialogue/action rows can be edited or deleted. Each speaker has independent language and voice-style settings. English AI voice generation remains available; Sinhala preview uses browser/device voices.
- Character Studio now supports viewing, editing the description/style/name, replacing the reference image, and deleting a character.
- Saved character references are described in scene-image prompts, but the current FLUX.1 Schnell text-to-image model is not reference-image-conditioned. Exact face/identity consistency in generated scene images is therefore not guaranteed. Upload a finished scene image when exact identity is essential.
- Character sound/SFX is a written direction field, not a generated sound-effect audio track. The current AI voice endpoint generates spoken dialogue only (English).
- Deploy the updated `worker/worker.js` to enable the new `POST /api/analyze-story` route as well as the updated per-character storyboard output.


## Current video generation provider

The current build uses Magic Hour only for scene image-to-video. The free preset is LTX-2.5 at 480p with audio disabled; configure `MAGIC_HOUR_API_KEY` as a Cloudflare Worker secret. See `FINAL-SETUP.md` for credit limits and deployment instructions.


## Automatic scene audio editor

See `AUTO-AUDIO-SETUP.md` for per-scene dialogue selection, automatic music/SFX creation, manual replacement/volume editing, Supabase migration, and final MP4 rendering steps. The current browser generator creates synthetic music beds and procedural SFX locally; use uploaded tracks when realistic recorded or AI-generated audio is required.


This version keeps the existing Magic Hour-only video provider and Cloudflare Worker configuration. The audio editor runs in the browser; no new audio API key is required. Supabase users must apply the scene audio migration before cloud-saving audio tracks.


## Multiple generated takes per scene
Each scene can retain several generated image options, several video takes, and multiple voice takes for the same dialogue line. Click Generate again to create another option, then select the preferred Image / Video / Voice option. The selected option is used for the scene timeline and final render. These alternatives are retained in this browser's local project data; cloud sync retains the scene variant metadata and selected takes where their source URLs remain available.


## Multiple takes per scene
Generate alternative images, voice takes for the same dialogue, and scene-video takes. Select the preferred option in each scene; the selected take is used in the timeline and final render. Options are saved in the current browser project.


## Character reference workflow update
- Character Studio now asks for only a character name and a full reference image upload. It does not recreate or regenerate a character.
- After Story Character Analysis, choose the matching saved Character Studio entry for each detected story name. The selected full reference image is shown in the mapping.
- Scene image generation continues to use the existing Cloudflare Workers AI image endpoint. Video generation remains on the configured Magic Hour provider; audio, voice and background-music features are unchanged.
- The optional “Improve story with AI” action has been removed. Write and edit the story directly in the Story field.

## Scene Editor: controlled option generation (2026-11-12)

- AI storyboard generation creates one initial scene image and stores it as **Image Option 1**.
- For English projects, the app also attempts one initial TTS take for each non-empty dialogue line and stores it as **Voice Option 1**. The current Cloudflare voice endpoint supports English only; Sinhala remains available through browser speech preview.
- The app does not create multiple alternatives in the background. A user must click Generate another to request Option 2, Option 3, and so on.
- Image and voice alternatives can be previewed/selected; image, voice, and video options can be removed individually. Uploaded images and voices are added as selectable options.
- Video Option 1 is generated only after the user presses its button. This is intentional: the configured Magic Hour video service uses account credits. Additional video options are generated only on request.
- Background music and SFX currently use the existing in-browser procedural sound generator and are managed in Film Editor. They are not cloud AI-generated audio. Do not describe them as AI audio until a real audio-generation provider is connected.
- Save scenes after editing to sync supported scene data and generated image/voice assets to Supabase. The local workspace also saves the current project in browser storage.

The `assets/scene01_moho/` directory contains the supplied editable Scene 01 SVG assets and Moho setup notes.
