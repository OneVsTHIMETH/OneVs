# AI Film Studio — Free Cloud AI setup

This build adds Cloudflare Workers AI for story writing, storyboard creation and still-image generation, plus Magic Hour Image-to-Video using its free-credit LTX-2.5 preset. Magic Hour video generation consumes Magic Hour account credits; it is not covered by the Cloudflare free AI quota.

## What is active in the code

- AI story writing: `POST /api/story` using Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash`.
- AI storyboard generation: `POST /api/storyboard`, returning editable scene JSON with shot prompts, dialogue, duration and sound directions.
- AI character concept images: `POST /api/image` using `@cf/black-forest-labs/flux-1-schnell`.
- AI scene still images: generated from each scene's visual prompt. The storyboard can invent characters from text without requiring a saved character or uploaded background image.
- Dialogue voice preview: browser/device speech synthesis. It is not a hosted AI voice API; Sinhala voices depend on the phone/computer's installed voices.
- Supabase Auth, private Storage and database persistence remain optional.

## Free plan limits

Cloudflare Workers AI currently includes **10,000 Neurons per day** on Workers Free. The daily allowance resets at 00:00 UTC. When the free limit is exceeded, requests fail until it resets; this project does not enable paid billing. Model availability and pricing can change, so check the official pricing page before relying on a model for long-term use.

Official references:
- Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Free-plan model availability: https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/
- Text model: https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- Image model: https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/

## Deploy the free AI Worker

You need a free Cloudflare account and Node.js on your computer. No OpenAI API key or Cloudflare API token is placed in the website.

1. Create/sign in to a Cloudflare account: https://dash.cloudflare.com/sign-up
2. In Cloudflare Dashboard, make sure Workers AI is available on your account and the Workers Free plan is selected. Review the daily Neurons allowance.
3. Open a terminal in this `worker` folder.
4. Install the deploy tool and sign in:

   ```bash
   npm install
   npx wrangler login
   ```

5. Open `wrangler.toml`. Set `ALLOWED_ORIGIN` to the exact origin where the website will run. For local testing use `http://localhost:8000`. For a deployed website, use its HTTPS origin, for example `https://your-site.pages.dev`. Multiple exact origins can be comma-separated.
6. Deploy:

   ```bash
   npx wrangler deploy
   ```

7. Wrangler prints a Worker URL, for example `https://ai-film-studio-free-ai.your-account.workers.dev`.
8. Open AI Film Studio → Studio Settings → Free Cloud AI connection. Paste the Worker URL and click **Test connection**.
9. Use **Improve story with free AI**, **Generate with free AI** in the scene builder, and **Generate character image with free AI** / **Generate scene image**.

If you change `ALLOWED_ORIGIN`, deploy again with `npx wrangler deploy`.

## Run the website locally

From the project root:

```bash
python -m http.server 8000
```

Open `http://localhost:8000` and set the Worker origin to `http://localhost:8000` as above.

## What is not available in this free-cloud build

- Automatic background replacement for a full uploaded video.
- Cloud-generated Sinhala voice files. Dialogue preview uses installed browser voices only.
- Automatic 360-degree reconstruction from one photo. The Character Studio exports a detailed turnaround prompt; image generation can create a concept image, but exact multi-view identity consistency is not guaranteed.
- Final MP4 film rendering. `worker/render.py` is a local FFmpeg utility for already-created clips, not a deployed cloud render service.

Full-video background replacement and cloud-generated Sinhala voice files still need separate models and workflows. The Magic Hour video integration is restricted to its free-credit LTX-2.5 480p preset in this build.

## Supabase (optional)

1. For a new database, run `supabase/schema.sql` in the Supabase SQL Editor. For an existing database, run both migration files in `supabase/migrations/`, including `20261109_scene_multiple_characters.sql` to enable multiple saved characters per scene.
2. Enable Email Auth and configure the correct Site URL / redirect URLs.
3. Keep the `character-references` and `project-assets` Storage buckets private and RLS enabled.
4. In Studio Settings, enter the Supabase project URL and anon/publishable key, then create an account or sign in.
5. Never use a service-role key in browser code.

## Security notes

- Cloudflare account credentials are used by Wrangler during deployment and are not embedded in the frontend.
- The Worker checks the browser `Origin` against `ALLOWED_ORIGIN`. CORS is not a complete authentication or abuse-prevention system: do not expose this endpoint to an unrestricted public audience without adding authenticated access / rate limiting before production.
- Do not commit Cloudflare credentials, Supabase service-role keys, or user access tokens to Git.


## Latest update: saved characters, dialogue and voices
- In Project Setup, select reusable saved characters. Add alias mappings such as `Jessica -> MAYA`; the alias target must be a saved character. Leave the selection and mappings empty to let AI invent characters.
- Generated storyboard prompts are instructed to use the exact saved character names in each relevant scene. Multiple characters can be assigned to a scene.
- Scene images can be regenerated, removed or replaced by uploading an image from your computer. The current FLUX.1 Schnell image route is text-to-image only, so it cannot guarantee exact visual identity from uploaded character reference images. Character descriptions help; uploading a finished scene image is the exact manual replacement option.
- Dialogue is edited one speaker at a time. Each line has a voice-language setting and a free-form voice-style prompt. English voice generation uses Cloudflare Workers AI MeloTTS; Sinhala is currently browser/device voice preview only. Cloud AI voice generation may incur usage charges.
- Deploy the updated `worker/worker.js` after replacing the worker code in Cloudflare. No additional Supabase schema migration is required for dialogue voice files; audio files use the existing private `project-assets` storage bucket.

## Latest character-analysis update
1. Deploy the latest `worker/worker.js` so `POST /api/analyze-story` is available.
2. Replace the website files with this package, keeping your existing Supabase connection values and Worker URL.
3. In Create Project, write the Story, add Overall Direction, click **Analyse Story & Find Characters**, then assign each story name to a saved Studio character or AI-created character.
4. Click **Generate Story & Create Project**, then **Generate scenes + artwork**.
5. Every generated scene now contains editable per-character action, dialogue, sound/SFX direction and voice style rows. Character Studio cards include View, Edit and Delete.

The current free text-to-image model does not use the saved character reference image as an image-conditioning input; matching descriptions help but cannot guarantee identical faces. Character sound/SFX entries are prompt notes, not generated sound files. AI TTS remains English-only; Sinhala uses browser voice preview.


## Image-to-Video Generator (Magic Hour only — free preset)

The Scene Video Generator uses Magic Hour as the only video provider. It sends the scene still image to Magic Hour's Image-to-Video API, using the free-tier `ltx-2.5` model preset at `480p` with audio disabled. The Worker checks your current credit balance before each request and blocks the request when the estimated credit cost is higher than your available balance.

### Configure Magic Hour

1. Create a free Magic Hour account and an API key at https://magichour.ai/developer.
2. In the `worker` folder, add the API key as a Cloudflare Worker secret and deploy:

```bash
npx wrangler secret put MAGIC_HOUR_API_KEY
npx wrangler deploy
```

3. Keep the key in Cloudflare Worker secrets; never place it in frontend JavaScript or HTML.
4. In AI Film Studio → Studio Settings, click **Check Magic Hour credits** to view the account balance. This check does not generate a video.

### Free plan notes

- Magic Hour currently advertises 400 signup credits for a free account. Basic accounts may claim 100 credits daily, up to seven total claims.
- A five-second LTX-2.5 image-to-video clip at 480p with audio disabled is listed at 120 credits (approximately 24 credits per second). Actual cost depends on settings and may change.
- The free preset uses 480p. 1080p may require a paid plan/model access and is not promised by this free-only build.
- Free-use generated content is for personal, non-commercial use only unless you have a paid subscription, credit pack, or separately agreed paid usage-based arrangement.
- Credits are checked before generation; no request is submitted when the estimated balance is insufficient. Always check the current balance and Magic Hour's estimate before creating clips.

### Generate a scene video

1. Generate or upload a scene image.
2. In that scene's **Scene Video Generator**, enter the motion direction.
3. Select **Generate scene video** (Magic Hour / LTX-2.5, 480p).
4. Wait for processing, or use **Check status** later.
5. Preview and download the completed clip promptly; provider URLs may expire.

Official references: https://magichour.ai/api/image-to-video · https://docs.magichour.ai/tools/video/image-to-video · https://docs.magichour.ai/api-reference/account/get-account-details
