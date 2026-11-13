# Legacy Cloudflare Worker — disabled

The AI Film Studio no longer uses this Worker for AI generation. The Worker is retained only as a compatibility stub and returns HTTP 410 for generation routes. It has no Workers AI binding and contains no Magic Hour integration or provider secrets.

Use the Supabase Edge Function documented in `../CUSTOM-API-SUPABASE-SETUP.md` for all custom API connections and generation requests.
