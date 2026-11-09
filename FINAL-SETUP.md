# AI Film Studio — Free Cloud AI setup

This build adds real Cloudflare Workers AI calls for story writing, storyboard creation and still-image generation. It does **not** claim that a free cloud provider can generate full motion-video clips or remove backgrounds from complete videos.

## What is active in the code

- AI story writing: `POST /api/story` using Cloudflare Workers AI `@cf/zai-org/glm-4.7-flash`.
- AI storyboard generation: `POST /api/storyboard`, returning editable scene JSON with shot prompts, dialogue, duration and sound directions.
- AI character concept images: `POST /api/image` using `@cf/black-forest-labs/flux-1-schnell`.
- AI scene still images: generated from each scene's visual prompt.
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

- Text-to-video / image-to-video motion generation.
- Automatic background replacement for a full uploaded video.
- Cloud-generated Sinhala voice files. Dialogue preview uses installed browser voices only.
- Automatic 360-degree reconstruction from one photo. The Character Studio exports a detailed turnaround prompt; image generation can create a concept image, but exact multi-view identity consistency is not guaranteed.
- Final MP4 film rendering. `worker/render.py` is a local FFmpeg utility for already-created clips, not a deployed cloud render service.

These functions need a suitable video/segmentation/voice model and a hosted job/render pipeline. Do not add a paid provider or paid billing if the requirement is free-only.

## Supabase (optional)

1. Run `supabase/schema.sql` in the Supabase SQL Editor.
2. Enable Email Auth and configure the correct Site URL / redirect URLs.
3. Keep the `character-references` and `project-assets` Storage buckets private and RLS enabled.
4. In Studio Settings, enter the Supabase project URL and anon/publishable key, then create an account or sign in.
5. Never use a service-role key in browser code.

## Security notes

- Cloudflare account credentials are used by Wrangler during deployment and are not embedded in the frontend.
- The Worker checks the browser `Origin` against `ALLOWED_ORIGIN`. CORS is not a complete authentication or abuse-prevention system: do not expose this endpoint to an unrestricted public audience without adding authenticated access / rate limiting before production.
- Do not commit Cloudflare credentials, Supabase service-role keys, or user access tokens to Git.
