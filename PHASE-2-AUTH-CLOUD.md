# Phase 2 – Supabase Authentication & Cloud Library

## What changed
- Added email/password sign-up and sign-in using Supabase Auth.
- Restores the Supabase session after page reload.
- Adds sign-out and cloud connection status.
- Loads the signed-in user's characters, projects and scenes from Supabase.
- Saves cloud characters and projects with `user_id` for RLS.
- Uploads character reference images to private Storage paths scoped to the user's UUID.
- Creates short-lived signed URLs for private character reference images.
- Saves scene prompts/dialogue/sound and syncs scene ordering.

## Setup
1. Run the updated `supabase/schema.sql` in your Supabase SQL Editor.
2. In Supabase Auth settings, configure your site URL and allowed redirect URLs.
3. Enable Email provider. For production, keep email confirmation enabled.
4. Create the private buckets named in the SQL: `character-references`, `project-assets`, `generated-media`.
5. Host this site over HTTPS (localhost is fine for local testing).
6. In Studio Settings, paste your Supabase Project URL and anon/publishable key.
7. Create an account, confirm email if required, then sign in.

## Important
- This is still a development foundation. AI generation endpoints are scaffolds, not live generators.
- Existing local-only characters/projects do not automatically migrate to cloud.
- Character image uploads and database records are private to the authenticated user.
- Scene reference uploads are stored privately. Provider jobs and final video generation are the next phase.
- Never use a Supabase `service_role` key in frontend code.
- Do not disable RLS to fix permission errors.
