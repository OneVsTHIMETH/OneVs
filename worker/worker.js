/**
 * Legacy gateway intentionally disabled.
 * AI Film Studio generation now routes exclusively through the authenticated
 * Supabase custom-api-manager Edge Function. This Worker must not call
 * Cloudflare Workers AI or Magic Hour and contains no provider credentials.
 */
function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
}
export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return response({ ok: true, provider: "none", message: "Legacy AI gateway disabled. Configure custom APIs in AI Film Studio via Supabase." });
    return response({ ok: false, error: "Legacy AI gateway is disabled. Connect and test a custom API in Supabase API Manager." }, 410);
  }
};
