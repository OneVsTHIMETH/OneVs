# AI Film Studio — Light White update

## What changed
- Refined the interface to a clean, modern Light White workspace.
- Kept the existing AI generation features, Cloudflare Worker integration, Magic Hour integration, Supabase integration, and project data structure intact.
- Opening Video Creator from the navigation or a New Video action now starts with an empty draft.
- The Film Editor no longer silently opens the most recently saved project.
- Existing saved projects and characters are not deleted; open an older project deliberately from My Projects when you want to continue it.

## Deploy
Upload the contents of this folder to the same Cloudflare Pages project, preserving the existing Worker and Supabase configuration. Do not replace Worker secrets or bindings. If your current site has newer files than this archive, keep a backup and merge only the updated `assets/css/style.css` and `assets/js/app.js` rather than overwriting newer work.

## Important
This is a frontend theme/workflow update. It does not erase any saved content from local browser storage or Supabase. New projects begin with no scenes or generated images/videos.
