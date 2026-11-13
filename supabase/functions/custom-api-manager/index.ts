import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const categories = new Set(["text", "image", "video", "voice", "music", "sfx"]);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function cryptoKey() {
  const raw = unb64(Deno.env.get("API_ENCRYPTION_KEY") || "");
  if (raw.length !== 32) throw new Error("API_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptSecret(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), new TextEncoder().encode(secret));
  return { encrypted_api_key: b64(new Uint8Array(encrypted)), key_iv: b64(iv) };
}
async function decryptSecret(row: any) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(row.key_iv) }, await cryptoKey(), unb64(row.encrypted_api_key));
  return new TextDecoder().decode(plain);
}
function safeEndpoint(value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1" || u.hostname.endsWith(".local") || u.hostname.endsWith(".internal") || u.hostname === "169.254.169.254" || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) throw new Error("Endpoint must be a public HTTPS URL. Local/private network URLs are blocked.");
  return u;
}
function authHeaders(spec: string, key: string) {
  const i = spec.indexOf(":");
  if (i < 1) throw new Error("Auth header must look like 'Authorization: Bearer'.");
  const name = spec.slice(0, i).trim(), prefix = spec.slice(i + 1).trim();
  if (!/^[A-Za-z0-9-]+$/.test(name)) throw new Error("Invalid auth header name.");
  return { [name]: prefix ? `${prefix} ${key}` : key, "Content-Type": "application/json", "Accept": "application/json" };
}
const metadata = (row: any) => ({ id: row.id, category: row.category, provider_name: row.provider_name, account_name: row.account_name, endpoint_url: row.endpoint_url, model: row.model, auth_header: row.auth_header, priority: row.priority, enabled: row.enabled, is_tested: row.is_tested, tested_at: row.tested_at, last_status: row.last_status, last_error: row.last_error, created_at: row.created_at });
function isQuotaOrRateLimit(status: number, raw: string) {
  const msg = raw.toLowerCase();
  return status === 402 || status === 429 || /insufficient[_ ]quota|quota[_ ]exceeded|credits?[_ ]exhausted|billing[_ ]hard[_ ]limit|rate[_ ]limit/.test(msg);
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const respond = (data: unknown, status = 200) => Response.json(data, { status, headers: cors });
  try {
    if (req.method !== "POST") return respond({ error: "POST required" }, 405);
    const authorization = req.headers.get("Authorization");
    if (!authorization) return respond({ error: "Sign in to Supabase first." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return respond({ error: "Invalid or expired Supabase session." }, 401);
    const admin = createClient(url, service), body = await req.json();
    const category = String(body.category || "");
    if (!categories.has(category)) return respond({ error: "Unknown API category." }, 400);

    if (body.action === "add_account" || body.action === "save") {
      const endpoint = String(body.endpoint_url || "").trim(); safeEndpoint(endpoint);
      const apiKey = String(body.api_key || "");
      if (!apiKey || apiKey.length > 8192) return respond({ error: "Enter a valid API key (maximum 8 KB)." }, 400);
      const provider_name = String(body.provider_name || "Custom Provider").trim().slice(0, 100);
      const account_name = String(body.account_name || `${provider_name} account`).trim().slice(0, 100);
      const model = String(body.model || "").trim().slice(0, 160);
      const auth_header = String(body.auth_header || "Authorization: Bearer").trim();
      const priority = Math.max(1, Math.min(999, Number(body.priority) || 100));
      const encrypted = await encryptSecret(apiKey);
      const { data, error } = await admin.from("ai_provider_accounts").insert({ user_id: user.id, category, provider_name, account_name, endpoint_url: endpoint, model, auth_header, priority, enabled: true, is_tested: false, ...encrypted }).select("id").single();
      if (error) throw error;
      return respond({ ok: true, saved: true, account_id: data.id, message: "Encrypted provider account saved. Test it before generation." });
    }
    if (body.action === "list_accounts" || body.action === "list") {
      const { data, error } = await admin.from("ai_provider_accounts").select("*").eq("user_id", user.id).eq("category", category).order("priority", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      return respond({ ok: true, category, accounts: (data || []).map(metadata), connected: (data || []).some((r: any) => r.enabled && r.is_tested), account_count: data?.length || 0 });
    }
    if (body.action === "delete_account") {
      const { error } = await admin.from("ai_provider_accounts").delete().eq("user_id", user.id).eq("id", body.account_id);
      if (error) throw error;
      return respond({ ok: true, deleted: true });
    }
    if (body.action === "set_account") {
      const patch: any = {};
      if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
      if (body.priority !== undefined) patch.priority = Math.max(1, Math.min(999, Number(body.priority) || 100));
      const { error } = await admin.from("ai_provider_accounts").update(patch).eq("user_id", user.id).eq("id", body.account_id);
      if (error) throw error;
      return respond({ ok: true, updated: true });
    }
    if (body.action === "delete") {
      const { error } = await admin.from("ai_provider_accounts").delete().eq("user_id", user.id).eq("category", category);
      if (error) throw error;
      return respond({ ok: true, deleted: true, category });
    }

    let accountQuery = admin.from("ai_provider_accounts").select("*").eq("user_id", user.id).eq("category", category);
    if (body.account_id) accountQuery = accountQuery.eq("id", body.account_id);
    const { data: accounts, error: readError } = await accountQuery.order("priority", { ascending: true }).order("created_at", { ascending: true });
    if (readError) throw readError;
    const candidates = (accounts || []).filter((r: any) => r.enabled);
    if (!candidates.length) return respond({ error: `No enabled ${category} accounts. Add an API account in API Manager.` }, 409);

    if (body.action === "test_account" || body.action === "test") {
      const row = candidates[0];
      const endpoint = safeEndpoint(row.endpoint_url), key = await decryptSecret(row), headers = authHeaders(row.auth_header, key);
      const testResponse = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ action: "connection_test", model: row.model, input: { ping: true } }), signal: AbortSignal.timeout(20000), redirect: "manual" });
      const raw = await testResponse.text();
      if (!testResponse.ok) {
        await admin.from("ai_provider_accounts").update({ last_status: testResponse.status, last_error: raw.slice(0, 500) }).eq("id", row.id).eq("user_id", user.id);
        return respond({ error: `Provider test returned HTTP ${testResponse.status}: ${raw.slice(0, 500)}` }, 502);
      }
      let parsed: any = {}; try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; }
      if (parsed?.ok === false || parsed?.error) return respond({ error: String(parsed.error || "Provider rejected connection test.").slice(0, 500) }, 502);
      await admin.from("ai_provider_accounts").update({ is_tested: true, tested_at: new Date().toISOString(), last_status: testResponse.status, last_error: null }).eq("id", row.id).eq("user_id", user.id);
      return respond({ ok: true, tested: true, account_id: row.id, provider_name: row.provider_name, http_status: testResponse.status });
    }

    if (body.action === "invoke") {
      const usable = candidates.filter((r: any) => r.is_tested);
      if (!usable.length) return respond({ error: `Test at least one enabled ${category} account before generation.` }, 409);
      const { data: job, error: jobError } = await admin.from("ai_jobs").insert({ user_id: user.id, category, provider_action: String(body.provider_action || "generate"), status: "processing", input_summary: { model_hint: body.model || null }, idempotency_key: body.idempotency_key || null }).select("id").single();
      if (jobError) throw jobError;
      const attempts: any[] = [];
      for (let index = 0; index < usable.length; index++) {
        const row = usable[index], attemptStarted = new Date().toISOString();
        let upstream: Response;
        try {
          const endpoint = safeEndpoint(row.endpoint_url), key = await decryptSecret(row), headers = authHeaders(row.auth_header, key);
          const payload = { action: String(body.provider_action || "generate"), model: row.model, input: body.input ?? {}, request_id: job.id };
          upstream = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(120000), redirect: "manual" });
        } catch (err) {
          const message = err?.message || "Network error; request outcome may be unknown.";
          attempts.push({ job_id: job.id, user_id: user.id, account_id: row.id, attempt_no: index + 1, status: "uncertain", error_message: message, started_at: attemptStarted, finished_at: new Date().toISOString() });
          await admin.from("ai_provider_accounts").update({ last_error: message }).eq("id", row.id);
          // Do not automatically resubmit after an ambiguous timeout: the provider may already have charged.
          await admin.from("ai_job_attempts").insert(attempts[attempts.length - 1]);
          await admin.from("ai_jobs").update({ status: "needs_review", last_error: message, finished_at: new Date().toISOString() }).eq("id", job.id);
          return respond({ error: `Provider request outcome is uncertain. To avoid duplicate charges, automatic failover stopped. ${message}`, job_id: job.id, attempts: index + 1 }, 502);
        }
        const raw = await upstream.text();
        if (upstream.ok) {
          let output: any; try { output = JSON.parse(raw); } catch { output = { response_text: raw }; }
          if (output?.ok === false || output?.error) {
            const message = String(output.error || "Provider request failed.").slice(0, 700);
            const retryable = isQuotaOrRateLimit(upstream.status, message);
            const attempt = { job_id: job.id, user_id: user.id, account_id: row.id, attempt_no: index + 1, status: retryable ? "quota_or_rate_limited" : "failed", http_status: upstream.status, error_message: message, started_at: attemptStarted, finished_at: new Date().toISOString() };
            await admin.from("ai_job_attempts").insert(attempt);
            await admin.from("ai_provider_accounts").update({ last_status: upstream.status, last_error: message }).eq("id", row.id);
            if (retryable) continue;
            await admin.from("ai_jobs").update({ status: "failed", last_error: message, finished_at: new Date().toISOString() }).eq("id", job.id);
            return respond({ error: message, job_id: job.id }, 502);
          }
          await admin.from("ai_job_attempts").insert({ job_id: job.id, user_id: user.id, account_id: row.id, attempt_no: index + 1, status: "succeeded", http_status: upstream.status, started_at: attemptStarted, finished_at: new Date().toISOString() });
          await admin.from("ai_provider_accounts").update({ last_status: upstream.status, last_error: null, last_used_at: new Date().toISOString() }).eq("id", row.id);
          await admin.from("ai_jobs").update({ status: "succeeded", selected_account_id: row.id, finished_at: new Date().toISOString() }).eq("id", job.id);
          return respond({ ok: true, category, job_id: job.id, selected_account: metadata(row), failover_count: index, ...output });
        }
        const retryable = isQuotaOrRateLimit(upstream.status, raw);
        const errorMessage = `HTTP ${upstream.status}: ${raw.slice(0, 650)}`;
        attempts.push({ job_id: job.id, user_id: user.id, account_id: row.id, attempt_no: index + 1, status: retryable ? "quota_or_rate_limited" : "failed", http_status: upstream.status, error_message: errorMessage, started_at: attemptStarted, finished_at: new Date().toISOString() });
        await admin.from("ai_job_attempts").insert(attempts[attempts.length - 1]);
        await admin.from("ai_provider_accounts").update({ last_status: upstream.status, last_error: errorMessage }).eq("id", row.id);
        if (!retryable) {
          await admin.from("ai_jobs").update({ status: "failed", last_error: errorMessage, finished_at: new Date().toISOString() }).eq("id", job.id);
          return respond({ error: `Provider rejected the request. No failover was attempted for this non-quota error. ${errorMessage}`, job_id: job.id }, 502);
        }
      }
      const finalError = "All enabled, tested accounts for this capability are out of quota or rate-limited.";
      await admin.from("ai_jobs").update({ status: "blocked", last_error: finalError, finished_at: new Date().toISOString() }).eq("id", job.id);
      return respond({ error: finalError, job_id: job.id, attempts: usable.length, failover_exhausted: true }, 503);
    }
    return respond({ error: "Unknown action." }, 400);
  } catch (error) {
    return respond({ error: error?.message || "Custom API manager failed." }, 500);
  }
});
