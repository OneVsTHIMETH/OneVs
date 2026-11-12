# AI Film Studio — Automatic Scene Audio & Manual Editing

This upgrade adds a per-scene audio desk to Film Editor.

## What it does

- Keeps each generated scene video, dialogue choice, background music and SFX grouped under that scene.
- Lets you generate multiple takes of the same dialogue voice and choose the preferred take for that character.
- Lets you generate multiple image and scene-video takes per scene, preview them, and select the preferred version. Each scene keeps its own selected image, voice and video.
- Creates an automatic musical bed from a selected mood (magical, happy, emotional, adventure, calm or suspense).
- Creates scene sound effects from the scene's sound direction / SFX prompt.
- Lets you preview, regenerate, remove, upload a replacement and adjust the volume of each audio track.
- Saves scene audio in browser storage. If Supabase is connected, run the migration below and use **Save audio edits** to upload music/SFX into the existing private `project-assets` bucket.
- Exports audio files and a render manifest for the included FFmpeg final-film renderer.

## Important audio-generation note

The current free stack does not include a dedicated AI music-generation or text-to-sound model. To keep the Magic Hour-only video setup and avoid another paid provider, this version creates royalty-free-style synthetic instrumental beds and simple procedural sound effects locally in the browser, guided by each scene's selected mood and sound prompt. These are editable placeholders / sound design layers, not realistic recorded foley or a full AI-composed song. Uploaded audio can replace any generated track.

Dialogue choices are taken from the voice files already generated for the dialogue lines. If a dialogue line has no generated voice file yet, generate its voice in Video Creator first. Existing English Cloud AI voice generation remains unchanged; browser speech preview is not exported as a recorded voice file.

## Install

1. Extract this ZIP.
2. Replace the files in your GitHub repository with the contents of the `work` folder, preserving the folder structure.
3. The Cloudflare Worker code and Magic Hour key are unchanged. No Worker redeploy is needed for this front-end-only audio feature.
4. If Supabase is connected, open Supabase → SQL Editor and run `supabase/migrations/20261110_scene_audio_tracks.sql` once. This adds columns for selected dialogue and private audio asset paths.
5. Refresh the website, open a project, and choose **Film Editor**.

## Use

1. Click **Auto-generate music + SFX for all scenes** to create missing audio tracks for every scene.
2. Generate the same dialogue voice again to create another take, then choose Voice 1, Voice 2, etc. Generate the scene image/video again to create alternative takes, then select the preferred Image / Video / Voice option.
3. Preview each track. Change the music mood or SFX prompt and press Generate / replace to create another version.
4. Upload your own MP3/WAV audio to replace a track, or use the volume slider.
5. Click **Save audio edits**. Local projects save in this browser; signed-in Supabase projects also upload audio to the private project-assets bucket (after the SQL migration).
6. Click **Export audio + render manifest**. Your browser downloads the audio files and a JSON manifest.
7. Download each generated scene video from Video Creator and rename it exactly as listed in the manifest (`scene-01.mp4`, `scene-02.mp4`, etc.). Put the MP4s, audio files, manifest and `worker/render.py` in one folder.
8. Install FFmpeg and Python on Windows, then run `worker/render.bat` from that folder (or copy the manifest and audio files into the `worker` folder). The final file is `final-film.mp4`.

## Notes

- Original generated clips are 480p. Exporting at 1080p creates a 1080p file container but does not add true 1080p source detail.
- Scene audio is aligned to the start of each scene in the exported manifest. Dialogue, music and SFX can be mixed with independent volume levels.
- This feature does not change Story, Character Studio, storyboard, image generation, Magic Hour video generation or existing voice generation.

## Multiple options for the same scene item
- **Image:** click `Generate another image option` repeatedly. The first existing image is kept as an option when you create the next take. Click Image 1 / Image 2 to choose.
- **Voice:** on the exact same dialogue row, click `Generate another voice option` again. Each generated take is retained on that dialogue row. Click Voice 1 / Voice 2 to select the preferred delivery; the spoken words stay the same.
- **Scene video:** click `Generate another video take` again. When processing finishes, select Video 1 / Video 2. Each scene video is generated from the currently selected scene image.
- The selected image, selected voice take and selected video are the active assets for that scene. Press **Save scenes** after making your choices. When Supabase cloud storage is connected, image and voice option files are uploaded to the existing private `project-assets` bucket; video option links are retained as provider URLs and may expire, so download important clips.
