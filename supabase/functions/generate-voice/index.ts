// Supabase Edge Function starter.
// Secrets belong in Supabase Edge Function secrets, never in browser JS.
// Deploy with: supabase functions deploy FUNCTION_NAME
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://your-domain.example",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth) return Response.json({ error: "Authentication required" }, { status: 401, headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return Response.json({ error: "Invalid session" }, { status: 401, headers: cors });

  // TODO: validate ownership of project/scene, validate input size and duration,
  // create a generation_jobs row, call the selected provider from this server,
  // store provider job ID, and update status via verified webhook/polling.
  return Response.json({ ok: true, user_id: user.id, message: "Authenticated endpoint scaffold. Connect provider implementation next." }, { headers: cors });
});
