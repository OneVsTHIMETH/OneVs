/**
 * AI Film Studio - Cloudflare Workers AI gateway
 * Cloudflare Workers AI gateway plus optional server-side video providers.
 * Provider secrets are never sent to the browser. See FINAL-SETUP.md for quota and billing notes.
 */
const TEXT_MODEL = "@cf/zai-org/glm-4.7-flash";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGIN || "https://onevs.pages.dev,http://localhost:8000")
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
function parseJsonArray(text, targetDuration = 60) {
  const cleaned = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start < 0 || end <= start) throw new Error("The AI did not return a valid scene list. Please try again.");
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }
  const value = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.scenes) ? parsed.scenes : null);
  if (!Array.isArray(value) || value.length === 0) throw new Error("The AI response was not a scene list.");
  const scenes = value.slice(0, Math.min(20, Math.max(1, Math.floor(targetDuration))));
  const weights = scenes.map(s => Math.max(1, Number(s.duration) || 8));
  const totalWeight = weights.reduce((sum, n) => sum + n, 0);
  let assigned = 0;
  return scenes.map((s, i) => {
    const remainingScenes = scenes.length - i - 1;
    const available = Math.max(1, targetDuration - assigned - remainingScenes);
    const proportional = Math.round(targetDuration * weights[i] / totalWeight);
    const duration = i === scenes.length - 1 ? targetDuration - assigned : Math.min(available, Math.max(1, proportional));
    assigned += duration;
    return {
      title: String(s.title || `Scene ${i + 1}`).slice(0, 100),
      visual_prompt: String(s.visual_prompt || s.visual || "").slice(0, 1800),
      dialogue: String(typeof s.dialogue === "string" ? s.dialogue : "").slice(0, 1200),
      dialogue_lines: Array.isArray(s.dialogue_lines) ? s.dialogue_lines.slice(0, 12).map(d => ({
        speaker: String(d.speaker || d.name || "Narrator").slice(0, 60),
        action: String(d.action || "").slice(0, 500),
        text: String(d.text || d.dialogue || "").slice(0, 1200),
        sound_prompt: String(d.sound_prompt || d.sound || "").slice(0, 300),
        voice_style: String(d.voice_style || "Warm, natural voice").slice(0, 180)
      })) : [],
      characters: Array.isArray(s.characters) ? s.characters.slice(0, 12).map(c => ({
        name: String(c.name || c.story_name || "Character").slice(0, 60),
        appearance: String(c.appearance || "").slice(0, 500),
        action: String(c.action || "").slice(0, 500),
        dialogue: String(c.dialogue || "").slice(0, 1200),
        sound_prompt: String(c.sound_prompt || c.sound || "").slice(0, 300),
        voice_style: String(c.voice_style || "Warm, natural voice").slice(0, 180)
      })) : [],
      sound_prompt: String(s.sound_prompt || s.sound || "").slice(0, 500),
      duration
    };
  });
}

async function providerJson(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 500) }; }
  if (!response.ok) {
    const message = data?.error || data?.message || data?.detail || `Video provider returned HTTP ${response.status}.`;
    throw new Error(String(message).slice(0, 500));
  }
  return data;
}
function normalizeMagicHourVideo(data) {
  const task = data?.data || data || {};
  const status = String(task.status || "queued").toLowerCase();
  const downloads = Array.isArray(task.downloads) ? task.downloads : [];
  const error = task.error?.message || task.error || "";
  return {
    ok: true,
    provider: "magic-hour",
    taskId: task.id,
    status,
    videoUrl: downloads[0]?.url || "",
    error: typeof error === "string" ? error : JSON.stringify(error),
    cost: task.credits_charged ?? null
  };
}

function magicHourHeaders(env) {
  return { "Authorization": `Bearer ${env.MAGIC_HOUR_API_KEY}`, "Content-Type": "application/json", "Accept": "application/json" };
}

async function imageBytesForMagicHour(image) {
  if (image.startsWith("data:image/")) {
    const match = image.match(/^data:(image\/(?:png|jpe?g|webp));base64,([\s\S]+)$/i);
    if (!match) throw new Error("Use a PNG, JPEG or WebP scene image.");
    const rawMime = match[1].toLowerCase();
    const mime = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
    return { bytes, mime, extension };
  }
  const response = await fetch(image);
  if (!response.ok) throw new Error(`Could not download scene image (HTTP ${response.status}).`);
  const mime = (response.headers.get("content-type") || "image/jpeg").split(";")[0].toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) throw new Error("Scene image must be PNG, JPEG or WebP.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Scene image exceeds Magic Hour's 5 MB upload limit.");
  return { bytes, mime, extension: mime === "image/jpeg" ? "jpg" : mime.split("/")[1] };
}


export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "https://onevs.pages.dev,http://localhost:8000").split(",").map(x => x.trim());
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (origin && !allowed.includes("*") && !allowed.includes(origin)) return json({ error: "This website origin is not allowed. Add it to ALLOWED_ORIGIN in wrangler.toml." }, 403, headers);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, provider: "Cloudflare Workers AI", features: ["story", "analyze-story", "storyboard", "image", "voice", "image-to-video"], videoGeneration: !!env.MAGIC_HOUR_API_KEY, videoProviders: { magicHour: !!env.MAGIC_HOUR_API_KEY }, videoGenerationNote: "Magic Hour is the only video provider. Free-tier image-to-video uses LTX-2.5 at 480p and consumes Magic Hour credits.", videoResolution: "480p", speechGeneration: true, speechLanguages: ["en"], freeTierLimited: true }, 200, headers);
    }
    if (request.method === "GET" && url.pathname === "/api/video/credits") {
      if (!env.MAGIC_HOUR_API_KEY) return json({ error: "Magic Hour is not configured. Add MAGIC_HOUR_API_KEY as a Cloudflare Worker secret." }, 503, headers);
      try {
        const response = await fetch("https://api.magichour.ai/v1/account", { headers: { "Authorization": `Bearer ${env.MAGIC_HOUR_API_KEY}`, "Accept": "application/json" } });
        const account = await providerJson(response);
        return json({ ok: true, provider: "magic-hour", credits: Number(account.credits || 0), tier: account.tier || "free" }, 200, headers);
      } catch (error) {
        return json({ error: error.message || "Could not read Magic Hour account credits." }, 502, headers);
      }
    }
    if (request.method !== "POST") return json({ error: "Route not found." }, 404, headers);
    if (!env.AI) return json({ error: "Workers AI binding is missing. Check wrangler.toml and deploy again." }, 500, headers);

    let body;
    try {
      const raw = await request.text();
      if (raw.length > 7 * 1024 * 1024) return json({ error: "Request is too large. Keep video reference images under 5 MB and prompts under 3,000 characters." }, 413, headers);
      body = JSON.parse(raw || "{}");
    } catch { return json({ error: "Invalid JSON request." }, 400, headers); }

    try {
      // MAGIC HOUR IMAGE-TO-VIDEO: API key remains on the Worker.
      if (url.pathname === "/api/video/generate") {
        if (!env.MAGIC_HOUR_API_KEY) return json({ error: "Magic Hour is not configured. Add MAGIC_HOUR_API_KEY as a Cloudflare Worker secret." }, 503, headers);
        const image = String(body.image || "").trim();
        const prompt = String(body.prompt || "").trim();
        const duration = Math.max(5, Math.min(15, Math.round(Number(body.duration) || 5)));
        if (!image) return json({ error: "Generate or upload this scene's image before creating a video." }, 400, headers);
        if (!(image.startsWith("https://") || /^data:image\/(png|jpe?g|webp);base64,/i.test(image))) return json({ error: "The scene image must be an HTTPS URL or a PNG/JPEG/WebP data image." }, 400, headers);
        if (image.length > 7 * 1024 * 1024) return json({ error: "The scene image is larger than the 5 MB upload limit." }, 413, headers);
        if (!prompt) return json({ error: "Enter a motion prompt for this scene." }, 400, headers);
        if (prompt.length > 3000) return json({ error: "Keep the motion prompt under 3,000 characters." }, 400, headers);

        // The free LTX-2.5 480p preset is approximately 24 credits/second.
        // Check the live balance first and never submit when the estimated cost is unaffordable.
        const accountResponse = await fetch("https://api.magichour.ai/v1/account", { headers: { "Authorization": `Bearer ${env.MAGIC_HOUR_API_KEY}`, "Accept": "application/json" } });
        const account = await providerJson(accountResponse);
        const estimatedCredits = duration * 24;
        const availableCredits = Number(account.credits || 0);
        if (availableCredits < estimatedCredits) {
          return json({ error: `Not enough Magic Hour credits. This ${duration}-second 480p clip is estimated at ${estimatedCredits} credits; your balance is ${availableCredits}. No video request was submitted.`, credits: availableCredits, estimatedCredits }, 402, headers);
        }

        const asset = await imageBytesForMagicHour(image);
        if (asset.bytes.byteLength > 5 * 1024 * 1024) return json({ error: "Scene image exceeds Magic Hour's 5 MB upload limit." }, 413, headers);
        const uploadResponse = await fetch("https://api.magichour.ai/v1/files/upload-urls", {
          method: "POST", headers: magicHourHeaders(env),
          body: JSON.stringify({ items: [{ type: "image", extension: asset.extension }] })
        });
        const uploadData = await providerJson(uploadResponse);
        const upload = uploadData.items?.[0];
        if (!upload?.upload_url || !upload?.file_path) throw new Error("Magic Hour did not return an image upload URL.");
        const putResponse = await fetch(upload.upload_url, { method: "PUT", headers: { "Content-Type": asset.mime }, body: asset.bytes });
        if (!putResponse.ok) throw new Error(`Magic Hour image upload failed (HTTP ${putResponse.status}).`);

        const createResponse = await fetch("https://api.magichour.ai/v1/image-to-video", {
          method: "POST", headers: magicHourHeaders(env),
          body: JSON.stringify({
            name: `AI Film Studio Scene - ${new Date().toISOString()}`,
            end_seconds: duration,
            model: "ltx-2.5",
            resolution: "480p",
            audio: false,
            style: { prompt },
            assets: { image_file_path: upload.file_path }
          })
        });
        const created = await providerJson(createResponse);
        if (!created.id) throw new Error("Magic Hour did not return a video project ID.");
        return json({ ok: true, provider: "magic-hour", taskId: created.id, status: "queued", resolution: "480p", duration, estimatedCredits: created.credits_charged ?? estimatedCredits, remainingCreditsEstimate: Math.max(0, availableCredits - Number(created.credits_charged ?? estimatedCredits)) }, 200, headers);
      }

      if (url.pathname === "/api/video/status") {
        if (!env.MAGIC_HOUR_API_KEY) return json({ error: "MAGIC_HOUR_API_KEY is not configured." }, 503, headers);
        const taskId = String(body.taskId || "").trim();
        if (!taskId) return json({ error: "A video task ID is required." }, 400, headers);
        const response = await fetch(`https://api.magichour.ai/v1/video-projects/${encodeURIComponent(taskId)}`, { headers: { "Authorization": `Bearer ${env.MAGIC_HOUR_API_KEY}`, "Accept": "application/json" } });
        const data = await providerJson(response);
        return json(normalizeMagicHourVideo(data), 200, headers);
      }

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

      if (url.pathname === "/api/analyze-story") {
        const story = String(body.story || "").trim();
        if (!story) return json({ error: "Write a story before analysing characters." }, 400, headers);
        if (story.length > 12000) return json({ error: "Keep the story under 12,000 characters for analysis." }, 400, headers);
        const language = body.language === "en" ? "English" : body.language === "both" ? "Sinhala and English" : "Sinhala";
        const result = await env.AI.run(TEXT_MODEL, {
          messages: [
            { role: "system", content: "You are a script supervisor. Identify every named character who participates in the story. Do not list places, objects, animals unless they are named story characters, or unnamed crowds. Return ONLY valid JSON: {\"characters\":[{\"name\":\"exact name used in story\",\"description\":\"short role and identifying details\"}]}. Preserve exact names and language from the story. If no named characters exist, return an empty characters array." },
            { role: "user", content: `Analyse this ${language} film story and identify all named characters, including minor speaking characters. Story:\n${story}` }
          ], max_tokens: 1200, temperature: 0.2
        });
        const raw = String(extractText(result)).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
        if (start < 0 || end <= start) throw new Error("The AI could not return a character list. Please try again.");
        const parsed = JSON.parse(raw.slice(start, end + 1));
        const characters = (Array.isArray(parsed.characters) ? parsed.characters : []).slice(0, 30).map(c => ({ name: String(c.name || "").trim().slice(0, 60), description: String(c.description || "").trim().slice(0, 300) })).filter(c => c.name);
        return json({ ok: true, characters, model: TEXT_MODEL }, 200, headers);
      }

      if (url.pathname === "/api/storyboard") {
        const story = String(body.story || "").trim();
        if (!story) return json({ error: "Enter a story before generating scenes." }, 400, headers);
        const language = body.language === "en" ? "English" : body.language === "both" ? "Sinhala and English" : "Sinhala";
        const target = Math.max(10, Math.min(3600, Math.round(Number(body.duration) || 60)));
        const result = await env.AI.run(TEXT_MODEL, {
          messages: [
            { role: "system", content: "You are a professional film screenwriter, script supervisor and storyboard artist. Follow the requested language. Keep every named character consistent across scenes. Return ONLY a valid JSON array. Each scene must contain title, visual_prompt, characters (array of per-character objects), sound_prompt and duration. Each character object must contain name, appearance, action, dialogue, sound_prompt and voice_style. Do not merge different speakers into one dialogue string. No markdown fences or explanation." },
            { role: "user", content: `Create an editable storyboard for this film. Language: ${language}. Target total duration: ${target} seconds. Create 4 to 20 scenes with durations proportional to story beats. Total duration must equal exactly ${target} seconds. In EVERY scene list every character who is actually visible or participates. For each character write their exact story name, a concise consistent appearance, their specific physical acting/action, their own spoken dialogue (empty string if silent), and their own vocal/sound effect direction (empty if none). Never omit a character who speaks or acts. Do not invent a new character when the story already names one. Keep character names and identities identical across scenes. visual_prompt must describe the full scene, environment, lighting, camera angle and movement. sound_prompt describes scene ambience/music only. Story and character mapping instructions: ${story}\nReturn JSON array only.` }
          ],
          max_tokens: 4200,
          temperature: 0.7
        });
        const scenes = parseJsonArray(extractText(result), target);
        return json({ ok: true, scenes, model: TEXT_MODEL }, 200, headers);
      }

      if (url.pathname === "/api/voice") {
        const text = String(body.text || "").trim();
        const language = String(body.language || "en");
        const voiceStyle = String(body.voiceStyle || "warm, smooth voice").slice(0, 180);
        if (!text) return json({ error: "Enter dialogue before generating a voice." }, 400, headers);
        if (text.length > 1200) return json({ error: "Keep each dialogue line under 1,200 characters." }, 400, headers);
        if (language !== "en") return json({ error: "AI voice generation is currently enabled for English only. Use browser preview for Sinhala." }, 400, headers);
        const result = await env.AI.run("@cf/myshell-ai/melotts", {
          prompt: `Speak these exact words clearly. Voice style: ${voiceStyle}. Dialogue: ${text}`,
          lang: "en"
        });
        const audio = result?.audio || (typeof result === "string" ? result : "");
        if (!audio) throw new Error("The text-to-speech model returned no audio.");
        return json({ ok: true, audio, mimeType: "audio/mpeg", model: "@cf/myshell-ai/melotts" }, 200, headers);
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
      const isVideoRoute = url.pathname.startsWith("/api/video/");
      const status = /limit|quota|neurons|rate/i.test(message) ? 429 : 502;
      const hint = isVideoRoute
        ? "Check MAGIC_HOUR_API_KEY, your Magic Hour credit balance, supported LTX-2.5 settings, and the Magic Hour API status."
        : status === 429
          ? "The free daily AI allowance or rate limit may have been reached. Try again after the allowance resets."
          : "Check the Cloudflare Workers AI model availability and deployment logs.";
      return json({ error: message.slice(0, 500), hint }, status, headers);
    }
  }
};
