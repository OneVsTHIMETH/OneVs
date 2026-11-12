# AI Film Studio – AI generation reliability fixes

## Fixed in this package
- Scene image generation now retries on Cloudflare Workers AI internal error `3043`, transient capacity errors, and timeouts using the lighter `@cf/black-forest-labs/flux-1-schnell` model. The fallback is text-to-image; it cannot consume image reference uploads, so reference character descriptions remain in the prompt but pixel-level reference conditioning is unavailable during fallback.
- AI voice generation now tries Deepgram Aura-1 first and MeloTTS second. The response is normalized to MP3 base64 so the browser player can use it.
- Voice button now reports missing dialogue and clearly explains the current language limitation instead of appearing to do nothing.
- AI Worker errors now include status, Cloudflare error code/request ID when provided, and actionable hints.
- Scene music/SFX generation now uses the scene sound prompt plus per-character action and sound-effect prompts to shape its procedural audio.
- Generate-all-audio now reports the exact scene that failed instead of incorrectly showing a success message.

## Important audio limitation
Cloudflare Workers AI in this project does not provide a built-in general-purpose music/SFX generation model. Background music and sound effects in this package are generated procedurally in the browser and are shaped by each scene's mood, sound prompt, character sound prompts and actions. They are not AI-composed recordings. A true AI music/SFX provider (and its API key/credits) would be needed for that.

## Language limitation
The current Worker can generate cloud AI dialogue voices in English. Sinhala AI speech is not available from the configured Cloudflare TTS models here. Sinhala lines still have browser speech preview; the AI button now displays a clear explanation rather than failing silently. A Sinhala-capable TTS service and credentials are needed for generated Sinhala voice files.

## Deploy
1. Keep a backup of the existing Cloudflare Worker and website.
2. Deploy the updated `worker/worker.js` from the `worker` folder to the same Cloudflare Worker. Keep the existing `AI` binding and `ALLOWED_ORIGIN` value. Keep `MAGIC_HOUR_API_KEY` unchanged as a Worker secret.
3. Deploy the updated `assets/js/app.js` and other website files to the existing Pages project.
4. Open Studio Settings, test the Worker URL, then test image generation and an English dialogue voice on a short scene.
5. For Sinhala voice, use Browser preview until a Sinhala TTS provider is configured.

No Supabase schema migration is required for these fixes.
