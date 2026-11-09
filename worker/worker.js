/**
 * AI Film Studio - Cloudflare Workers AI gateway
 * Uses only Cloudflare-hosted Workers AI models. No vendor secret is sent to the browser.
 * Free plan allowance is limited; see FINAL-SETUP.md before production use.
 */
const TEXT_MODEL = "@cf/zai-org/glm-4.7-flash";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGIN || "http://localhost:8000")
    .split(",").map(x => x.trim()).filter(Boolean);
  const permitted = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": permitted ? (allowed.includes("*") ? "*" : origin) : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}
function extractText(result) {
  return result?.response || result?.choices?.[0]?.message?.content || result?.result?.response || "";
}
function parseJsonArray(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("The AI did not return a valid scene list. Please try again.");
  const value = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(value)) throw new Error("The AI response was not a scene list.");
  return value.slice(0, 12).map((s, i) => ({
    title: String(s.title || `Scene ${i + 1}`).slice(0, 100),
    visual_prompt: String(s.visual_prompt || s.visual || "").slice(0, 1800),
    dialogue: String(s.dialogue || "").slice(0, 1200),
    sound_prompt: String(s.sound_prompt || s.sound || "").slice(0, 500),
    duration: Math.max(3, Math.min(15, Number(s.duration) || 8))
  }));
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "http://localhost:8000").split(",").map(x => x.trim());
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (origin && !allowed.includes("*") && !allowed.includes(origin)) return json({ error: "This website origin is not allowed. Add it to ALLOWED_ORIGIN in wrangler.toml." }, 403, headers);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, provider: "Cloudflare Workers AI", features: ["story", "storyboard", "image"], videoGeneration: false, speechGeneration: false, freeTierLimited: true }, 200, headers);
    }
    if (request.method !== "POST") return json({ error: "Route not found." }, 404, headers);
    if (!env.AI) return json({ error: "Workers AI binding is missing. Check wrangler.toml and deploy again." }, 500, headers);

    let body;
    try {
      const raw = await request.text();
      if (raw.length > 30000) return json({ error: "Request is too large. Keep prompts under 30 KB." }, 413, headers);
      body = JSON.parse(raw || "{}");
    } catch { return json({ error: "Invalid JSON request." }, 400, headers); }

    try {
      if (url.pathname === "/api/story") {
        const idea = String(body.idea || "").trim();
        if (!idea) return json({ error: "Enter a short film idea first." }, 400, headers);
        const language = body.language === "en" ? "English" : body.language === "both" ? "Sinhala and English" : "Sinhala";
        const result = await env.AI.run(TEXT_MODEL, {
          messages: [
            { role: "system", content: "You are a skilled screenwriter. Write an original, coherent short-film story with a clear beginning, conflict, climax and ending. Follow the requested language. Use natural dialogue where useful." },
            { role: "user", content: `Write a cinematic short film story in ${language}, based on this idea. Keep it suitable for conversion into 4-8 short scenes. Include a title and clear sceneable events. Idea: ${idea}` }
          ], max_tokens: 1400, temperature: 0.8
        });
        const story = extractText(result).trim();
        if (!story) throw new Error("The text model returned an empty story.");
        return json({ ok: true, story, model: TEXT_MODEL }, 200, headers);
      }

      if (url.pathname === "/api/storyboard") {
        const story = String(body.story || "").trim();
        if (!story) return json({ error: "Enter a story before generating scenes." }, 400, headers);
        const language = body.language === "en" ? "English" : body.language === "both" ? "Sinhala and English" : "Sinhala";
        const target = Math.max(1, Math.min(300, Number(body.duration) || 60));
        const result = await env.AI.run(TEXT_MODEL, {
          messages: [
            { role: "system", content: "You are a professional film screenwriter and storyboard artist. Follow the requested language. Keep character identities consistent. Return ONLY a valid JSON array. Each item must contain title, visual_prompt, dialogue, sound_prompt, duration. No markdown fences or explanation." },
            { role: "user", content: `Create an editable storyboard for this film. Language: ${language}. Target total duration: ${target} seconds. Make 4 to 8 scenes with each scene duration between 3 and 15 seconds. Story: ${story}\nReturn JSON array only. Each visual_prompt must be a detailed cinematic shot description including camera angle, character action, environment, lighting and continuity. dialogue should contain spoken lines, or empty string if no dialogue. sound_prompt should describe ambient sound/music.` }
          ],
          max_tokens: 2200,
          temperature: 0.7
        });
        const scenes = parseJsonArray(extractText(result));
        return json({ ok: true, scenes, model: TEXT_MODEL }, 200, headers);
      }

      if (url.pathname === "/api/image") {
        const prompt = String(body.prompt || "").trim();
        if (!prompt) return json({ error: "Enter an image prompt." }, 400, headers);
        if (prompt.length > 2000) return json({ error: "Image prompt must be 2,000 characters or fewer." }, 400, headers);
        const result = await env.AI.run(IMAGE_MODEL, { prompt, steps: 4 });
        if (!result?.image) throw new Error("The image model returned no image. Try a shorter prompt.");
        return json({ ok: true, image: `data:image/jpeg;base64,${result.image}`, model: IMAGE_MODEL }, 200, headers);
      }
      return json({ error: "Route not found." }, 404, headers);
    } catch (error) {
      const message = String(error?.message || error || "AI request failed");
      const status = /limit|quota|neurons|rate/i.test(message) ? 429 : 502;
      return json({ error: message.slice(0, 500), hint: status === 429 ? "The free daily AI allowance or rate limit may have been reached. Try again after the allowance resets." : "Check the Cloudflare Workers AI model availability and deployment logs." }, status, headers);
    }
  }
};
