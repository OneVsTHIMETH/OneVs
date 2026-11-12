# AI Film Studio – restore previous connections

This build restores the previously used Cloudflare Worker URL in the app:
`https://ai-film-studio-worker.gamingthimeth.workers.dev`

It also allows the deployed Pages origin `https://onevs.pages.dev` through the Worker CORS fallback and wrangler config.

## Deploy
1. Upload the contents of this `work` folder to the GitHub repository that publishes `https://onevs.pages.dev`, replacing the matching app files. Keep the existing repository and project settings.
2. In Cloudflare Workers & Pages, open `ai-film-studio-worker`, update its `worker.js` with `worker/worker.js` from this package (or deploy this worker folder using Wrangler), and deploy.
3. Keep the existing `MAGIC_HOUR_API_KEY` secret. Do not add it to GitHub or the browser.
4. Open `https://onevs.pages.dev/`, hard refresh with Ctrl+Shift+R, go to Studio Settings and click **Test connection**.
5. Existing Supabase URL/key are kept in the browser's localStorage if they were previously saved on this same browser. This package does not replace them. If browser data was cleared, enter the existing Supabase project URL and anon/publishable key again. Never use the service-role key.

## Important
- The Cloudflare Worker must be redeployed for the CORS change to take effect.
- Keep `MAGIC_HOUR_API_KEY` as a Worker secret.
- Story/image/voice use the Worker AI binding; video generation uses Magic Hour. A successful `/api/health` test only verifies Worker reachability/configuration, not every provider endpoint.
