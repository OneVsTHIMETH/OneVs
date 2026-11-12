# AI Film Studio — Image-to-Video update

## Added
- Per-scene image-to-video generator panel in the existing Scene Builder.
- Provider selector for Kling AI and Luma AI API.
- Motion prompt field per scene.
- 1080p output requests with project aspect ratio mapping.
- Asynchronous task creation and status polling.
- In-app clip preview and provider URL open/download link.
- Local persistence plus Supabase persistence of provider, task ID, status and result URL.
- Cloudflare Worker secrets keep API keys off the client.

## Files changed
- `worker/worker.js` — new `/api/video/generate` and `/api/video/status` routes; health endpoint advertises configured providers.
- `assets/js/app.js` — per-scene controls, polling, clip preview and save/load fields.
- `assets/css/style.css` — video generator panel styling.
- `index.html` — setup and capability notices.
- `supabase/migrations/20261110_scene_video_provider.sql` — persistence columns.
- `FINAL-SETUP.md`, `worker/README.md` — deployment instructions.

## Not included yet
- Automatic concatenation of all scene clips into one MP4. The existing FFmpeg worker is retained for a separate assembly stage.
- Automatic permanent copy of provider video files into Supabase Storage. Provider URLs can expire, so download clips promptly.


## Previous provider update (2026-11-10)
- The earlier Luma integration replaced the initial Runway option. It has now been superseded by Alibaba Wan 3.0 in the latest build below.


## Free-quota provider update — Alibaba Wan 3.0
- Replaced the Luma AI provider selector/integration with Alibaba Cloud Model Studio Wan 3.0.
- Added Singapore Workspace ID + DashScope API key credentials in the Worker.
- Added Wan 3.0 first-frame image-to-video request at 1080P and asynchronous task polling.
- Added 15-second polling intervals for Wan tasks and 24-hour output URL expiry notes.
- The published free allowance is 30 seconds for eligible Singapore-region `wan3.0-video` accounts for 90 days; it is not unlimited.


## Kling-only provider update
- Removed Alibaba Wan 3.0 from the frontend provider selection and Worker API routes.
- Kept Kling AI as the sole Image-to-Video provider.
- Scene video generation now always submits and polls Kling tasks.
- Removed Wan API key and Workspace ID setup requirements from the setup documentation.


## Magic Hour-only free preset (2026-11-10)
- Removed Kling as the active video provider and replaced it with Magic Hour Image-to-Video API.
- Uses LTX-2.5 at 480p with audio disabled as the free-tier preset.
- Added secure image upload to Magic Hour, asynchronous project polling and clip download URL handling.
- Added a live account-credit check in Studio Settings and pre-generation balance guard.
- Requires `MAGIC_HOUR_API_KEY` as a Cloudflare Worker secret; no API key is exposed to the browser.


## Character consistency update (2026-11-10)

- Scene image generation now submits actual Character Studio reference images to FLUX.2 klein-9b (up to four references per scene).
- Reference images are resized to a maximum 512 px edge in the Worker.
- Per-character dialogue ownership is reinforced in storyboard prompts.
- Dialogue rows now include separate voice style, voice effect and speaking tone guidance.
- See `CHARACTER-CONSISTENCY-UPDATE.md` for deployment steps and limitations.
