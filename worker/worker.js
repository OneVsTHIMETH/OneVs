/**
 * AI Film Studio - Cloudflare Workers AI gateway
 * Cloudflare Workers AI gateway plus optional server-side video providers.
 * Provider secrets are never sent to the browser. See FINAL-SETUP.md for quota and billing notes.
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
function normalizeVideoTask(provider, data) {
  const task = data.data || data;
  const status = String(task.task_status || "submitted").toLowerCase();
  const videos = task.task_result?.videos || [];
  return {
    ok: true,
    provider: "kling",
    taskId: task.task_id,
    status,
    videoUrl: videos[0]?.url || videos[0]?.watermark_url || "",
    error: task.task_status_msg || "",
    cost: task.final_unit_deduction || task.final_balance_deduction || null
  };
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
      return json({ ok: true, provider: "Cloudflare Workers AI", features: ["story", "analyze-story", "storyboard", "image", "voice", "image-to-video"], videoGeneration: !!env.KLING_API_KEY, videoProviders: { kling: !!env.KLING_API_KEY }, videoGenerationNote: "Kling AI is the only configured video provider and requires Kling API credits. Cloudflare Workers AI does not generate motion video.", maxTargetDurationSeconds: 3600, speechGeneration: true, speechLanguages: ["en"], freeTierLimited: true }, 200, headers);
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
      // IMAGE-TO-VIDEO: provider keys remain on the Worker, never in the browser.
      if (url.pathname === "/api/video/generate") {
        const provider = String(body.provider || "kling").toLowerCase();
        const image = String(body.image || "").trim();
        const prompt = String(body.prompt || "").trim();
        const duration = Math.max(5, Math.min(15, Math.round(Number(body.duration) || 5)));
        const ratioMap = { "16:9": "1920:1080", "9:16": "1080:1920", "1:1": "1440:1440" };
        const ratio = ratioMap[String(body.ratio || "16:9")] || "1920:1080";
        if (!image) return json({ error: "Generate or upload this scene's image before creating a video." }, 400, headers);
        if (!(image.startsWith("https://") || /^data:image\/(png|jpe?g|webp);base64,/i.test(image))) return json({ error: "The scene image must be an HTTPS URL or a PNG/JPEG/WebP data image." }, 400, headers);
        if (image.length > 6 * 1024 * 1024) return json({ error: "The image is larger than the 5 MB provider input limit. Upload a smaller scene image." }, 413, headers);
        if (!prompt) return json({ error: "Enter a motion prompt for this scene." }, 400, headers);
        if (prompt.length > 3000) return json({ error: "Keep the motion prompt under 3,000 characters." }, 400, headers);

        if (provider === "kling") {
          if (!env.KLING_API_KEY) return json({ error: "Kling is not configured. Add KLING_API_KEY as a Cloudflare Worker secret." }, 503, headers);
          const response = await fetch("https://api-singapore.klingai.com/image-to-video/kling-3.0", {
            method: "POST",
            headers: { "Authorization": `Bearer ${env.KLING_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ type: "prompt", text: prompt }, { type: "first_frame", url: image }],
              settings: { resolution: "1080p", duration, audio: "off", multi_shot: false },
              options: { watermark_info: { enabled: true } }
            })
          });
          const data = await providerJson(response);
          if (data.code && Number(data.code) !== 0) throw new Error(data.message || `Kling error ${data.code}`);
          const task = data.data || data;
          if (!task.task_id) throw new Error("Kling did not return a task ID.");
          return json({ ok: true, provider, taskId: task.task_id, status: task.task_status || "submitted", resolution: "1080p", duration }, 200, headers);
        }

        return json({ error: "Unknown provider. Only Kling AI is supported." }, 400, headers);
      }

      if (url.pathname === "/api/video/status") {
        const provider = String(body.provider || "").toLowerCase();
        const taskId = String(body.taskId || "").trim();
        if (!taskId) return json({ error: "A video task ID is required." }, 400, headers);
        if (provider === "kling") {
          if (!env.KLING_API_KEY) return json({ error: "KLING_API_KEY is not configured." }, 503, headers);
          const response = await fetch(`https://api-singapore.klingai.com/tasks?external_task_ids=${encodeURIComponent(taskId)}`, { headers: { "Authorization": `Bearer ${env.KLING_API_KEY}`, "Content-Type": "application/json" } });
          const data = await providerJson(response);
          const task = Array.isArray(data.data) ? data.data[0] : data.data;
          if (!task) throw new Error("Kling task was not found. Check the task ID.");
          return json(normalizeVideoTask(provider, { data: task }), 200, headers);
        }
        return json({ error: "Unknown provider. Only Kling AI is supported." }, 400, headers);
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
      const status = /limit|quota|neurons|rate/i.test(message) ? 429 : 502;
      return json({ error: message.slice(0, 500), hint: status === 429 ? "The free daily AI allowance or rate limit may have been reached. Try again after the allowance resets." : "Check the Cloudflare Workers AI model availability and deployment logs." }, status, headers);
    }
  }
};
