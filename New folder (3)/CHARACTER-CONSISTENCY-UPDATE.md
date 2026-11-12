# AI Film Studio – Character Consistency Update

This build updates the Character Studio → Storyboard → Scene Artwork workflow.

## What changed

1. **Actual reference-image inputs:** When scene artwork is generated automatically or regenerated manually, the app sends the saved Character Studio image(s) to the Cloudflare Worker as `referenceImages`. The worker fetches the real image bytes and submits them as `input_image_0` … `input_image_3` to Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-9b`.
2. **Multiple characters:** Up to four saved character reference images can be included in one scene generation request. The scene's selected/mapped character IDs determine which references are sent; unrelated saved characters are not included.
3. **Identity guidance:** Each reference is labelled with the Character Studio name and description. The prompt explicitly asks the model not to merge character identities and to preserve face, hairstyle, outfit, body proportions and colours.
4. **Per-character dialogue:** Storyboard generation now explicitly requires one dialogue field per character and forbids mixing one speaker's words into another character's dialogue.
5. **Per-character voice controls:** Dialogue rows now store Voice Style, Voice Effect and Speaking Tone independently and pass all three as guidance to the existing voice-generation endpoint.

## Important limitations

- Image generation is not a mathematical identity lock. Even with genuine reference images, generative models can vary faces, clothing details, pose and small design features between outputs. FLUX.2 reference conditioning improves consistency; it does **not** guarantee 100% identical pixels or identity in every result.
- The current Worker AI model accepts up to four reference images per request. Images are resized to a maximum 512 px edge before submission. A scene with more than four mapped characters will send the first four references; keep the key characters mapped/selected for the scene.
- The voice controls are prompt guidance for the currently configured MeloTTS model. The current model may not produce reliably distinct speaker identities or every requested audio effect. For dependable recurring voice identity, integrate a voice provider that supports saved voice IDs/cloning (with the speaker's permission) and apply effects in a separate audio-processing step.
- The existing cloud voice endpoint currently supports English generation only. Sinhala remains browser preview in this project.
- The image model may consume Workers AI quota/paid usage according to the Cloudflare account plan. Check current Cloudflare pricing and usage before production deployment.

## Deploy

1. Replace the deployed website files with the contents of the `work/` folder (keep the existing project root layout).
2. Deploy the updated Worker from `work/worker/` using your existing Cloudflare Worker configuration:
   - `npm install`
   - `npx wrangler deploy`
3. Confirm the Worker's `ALLOWED_ORIGIN` includes the exact production website origin.
4. Open Character Studio and ensure each saved character has a clear uploaded reference image.
5. Analyse the story, map each story character to the correct Character Studio character, generate the storyboard, then generate scene artwork.
6. Test a scene with two mapped characters and confirm the generated image shows both. Then test a scene containing only one character to ensure unrelated characters are not passed as references.

No database migration is required for this update. The existing `characters.reference_image_path`, project character mappings, and scene `character_ids` are reused.
