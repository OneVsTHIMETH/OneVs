# FFmpeg assembly worker

This worker assembles **existing generated clips**; it does not generate video or remove backgrounds.

Requirements: Python 3.10+ and FFmpeg available on PATH.

1. Copy `manifest.example.json` to `manifest.json`.
2. Put generated scene clips and optional soundtrack beside it, then update paths.
3. Run `python render.py manifest.json final-film.mp4`.

For production, run this in a private job worker/container, not in the browser. Validate ownership of every source asset, limit total duration/file size, use per-user temporary directories, and upload the finished MP4 to private object storage. Do not expose service-role keys to the browser.


## Latest update: saved characters, dialogue and voices
- In Project Setup, select reusable saved characters. Add alias mappings such as `Jessica -> MAYA`; the alias target must be a saved character. Leave the selection and mappings empty to let AI invent characters.
- Generated storyboard prompts are instructed to use the exact saved character names in each relevant scene. Multiple characters can be assigned to a scene.
- Scene images can be regenerated, removed or replaced by uploading an image from your computer. The current FLUX.1 Schnell image route is text-to-image only, so it cannot guarantee exact visual identity from uploaded character reference images. Character descriptions help; uploading a finished scene image is the exact manual replacement option.
- Dialogue is edited one speaker at a time. Each line has a voice-language setting and a free-form voice-style prompt. English voice generation uses Cloudflare Workers AI MeloTTS; Sinhala is currently browser/device voice preview only. Cloud AI voice generation may incur usage charges.
- Deploy the updated `worker/worker.js` after replacing the worker code in Cloudflare. No additional Supabase schema migration is required for dialogue voice files; audio files use the existing private `project-assets` storage bucket.

### New route: `POST /api/analyze-story`
Request body: `{ "story": "...", "language": "si|en|both" }`.
Returns `{ "ok": true, "characters": [{ "name": "...", "description": "..." }] }` for named story characters. The updated `/api/storyboard` route returns per-scene `characters` objects containing `name`, `appearance`, `action`, `dialogue`, `sound_prompt`, and `voice_style`.


## Image-to-video generation (Kling AI only)

Configure the Kling API key as a Cloudflare Worker secret:

```bash
npx wrangler secret put KLING_API_KEY
npx wrangler deploy
```

The Scene Video Generator submits each scene image as the first frame and requests Kling 3.0 at 1080p. The Worker polls the asynchronous task and returns the generated clip URL. Kling API usage requires provider credits; Cloudflare Workers AI free quota does not cover Kling video generation.
