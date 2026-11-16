const corsHeaders = (origin, env) => {
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(x => x.trim());
  const allowOrigin = allowed.includes("*") || allowed.includes(origin) ? origin || "*" : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
};
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
});
const b64 = bytes => { const view = new Uint8Array(bytes); let binary = ""; for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000)); return btoa(binary); };
const fromB64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function requireUser(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Please sign in first.");
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase Worker secrets are missing.");
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Your sign-in session is invalid or expired. Please sign in again.");
  return response.json();
}

async function gemini(env, prompt, schema = null, model = null) {
  if (!env.GEMINI_API_KEY) throw new Error("The website owner has not configured GEMINI_API_KEY.");
  const modelName = model || env.GEMINI_TEXT_MODEL || "gemini-3.6-flash";
  const generationConfig = { temperature: 0.35, responseMimeType: "application/json" };
  if (schema) generationConfig.responseSchema = schema;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Gemini request failed (${response.status}).`);
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  if (!text) throw new Error("Gemini returned an empty response.");
  try { return JSON.parse(text); } catch { throw new Error("Gemini returned invalid JSON. Please retry."); }
}

async function analyzeStory(request, env) {
  const { story, language = "en" } = await request.json();
  if (!story?.trim()) throw new Error("Story text is required.");
  const analysisModel = env.GEMINI_ANALYSIS_MODEL || env.GEMINI_TEXT_MODEL || "gemini-3.6-flash";
  const result = await gemini(env, `You are a professional animation screenplay analyst. Analyze this story in ${language === "en" ? "English" : language}. Return JSON only with a characters array. Each character must have name, role, age_description, appearance, personality, and visual_identity_lock. Identify named speaking and non-speaking characters. Do not invent characters not supported by the story.\n\nSTORY:\n${story}`, {
    type: "OBJECT", properties: { characters: { type: "ARRAY", items: { type: "OBJECT", properties: {
      name: { type: "STRING" }, role: { type: "STRING" }, age_description: { type: "STRING" }, appearance: { type: "STRING" }, personality: { type: "STRING" }, visual_identity_lock: { type: "STRING" }
    }, required: ["name", "role", "appearance", "personality", "visual_identity_lock"] } } }, required: ["characters"]
  }, analysisModel);
  return { ok: true, ...result };
}

async function storyboard(request, env) {
  const { story, language = "en", duration = 60 } = await request.json();
  if (!story?.trim()) throw new Error("Story text is required.");
  const seconds = Math.max(10, Math.min(3600, Number(duration) || 60));
  const result = await gemini(env, `You are a film director and animation storyboard writer. Create a production-ready storyboard in ${language === "en" ? "English" : language}. Total runtime target: ${seconds} seconds. Create scenes with sensible durations that sum close to the target. Preserve the exact names and identities from CHARACTER ASSIGNMENTS. Every scene must include: title, duration (seconds), visual_prompt (cinematic image prompt), motion_prompt (camera and character movement), sound_prompt, and characters array. Each character row: name, appearance, action, dialogue, sound_prompt, voice_style, speaking_tone. Dialogue must be natural and in the requested language. Do not add captions or text to visual prompts. Return JSON only.\n\n${story}`, {
    type: "OBJECT", properties: { scenes: { type: "ARRAY", items: { type: "OBJECT", properties: {
      title: { type: "STRING" }, duration: { type: "INTEGER" }, visual_prompt: { type: "STRING" }, motion_prompt: { type: "STRING" }, sound_prompt: { type: "STRING" },
      characters: { type: "ARRAY", items: { type: "OBJECT", properties: {
        name: { type: "STRING" }, appearance: { type: "STRING" }, action: { type: "STRING" }, dialogue: { type: "STRING" }, sound_prompt: { type: "STRING" }, voice_style: { type: "STRING" }, speaking_tone: { type: "STRING" }
      }, required: ["name", "appearance", "action", "dialogue"] } }
    }, required: ["title", "duration", "visual_prompt", "motion_prompt", "sound_prompt", "characters"] } } }, required: ["scenes"]
  });
  return { ok: true, ...result };
}

async function voice(request, env) {
  const { text, voiceStyle = "warm, smooth voice", language = "en" } = await request.json();
  if (!text?.trim()) throw new Error("Enter dialogue text before generating a voice.");
  if (text.length > 1200) throw new Error("Keep each dialogue line under 1,200 characters.");
  if (language !== "en") throw new Error("AI voice generation is available in English only.");
  if (!env.AI) throw new Error("Cloudflare Workers AI binding is missing. Check the AI binding and deploy again.");
  const result = await env.AI.run("@cf/myshell-ai/melotts", {
    prompt: `Speak these exact words clearly. Voice style: ${String(voiceStyle).slice(0, 180)}. Dialogue: ${text}`,
    lang: "en"
  });
  const audio = result?.audio || (typeof result === "string" ? result : "");
  if (!audio) throw new Error("The text-to-speech model returned no audio.");
  return { ok: true, audio, mimeType: "audio/mpeg", model: "@cf/myshell-ai/melotts" };
}

async function image(request, env) {
  const { prompt } = await request.json();
  if (!prompt?.trim()) throw new Error("Image prompt is required.");
  let response;
  // Free-first: Hugging Face Inference API. Free credits/availability depend on the account and model.
  if (env.HF_TOKEN) {
    const model = env.HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
    response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: "POST", headers: { Authorization: `Bearer ${env.HF_TOKEN}`, "Content-Type": "application/json", Accept: "image/png" },
      body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Hugging Face image generation failed (${response.status}): ${detail.slice(0, 350)}`);
    }
  } else if (env.ALLOW_POLLINATIONS_FALLBACK === "true") {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=576&model=flux&nologo=true`;
    response = await fetch(url);
    if (!response.ok) throw new Error(`Free image fallback failed (${response.status}).`);
  } else {
    throw new Error("Image generation is not configured. Add the owner HF_TOKEN Worker secret, or explicitly enable the Pollinations fallback.");
  }
  const bytes = await response.arrayBuffer();
  const mime = response.headers.get("Content-Type")?.split(";")[0] || "image/png";
  return { ok: true, image: `data:${mime};base64,${b64(bytes)}`, mimeType: mime, provider: env.HF_TOKEN ? "huggingface" : "pollinations" };
}

async function magicHour(request, env, path, payload) {
  if (!env.MAGIC_HOUR_API_KEY) throw new Error("The website owner has not configured MAGIC_HOUR_API_KEY.");
  const base = (env.MAGIC_HOUR_API_BASE || "https://api.magichour.ai").replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${env.MAGIC_HOUR_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `Magic Hour request failed (${response.status}). Check the endpoint's current API schema.`);
  return data;
}
async function videoGenerate(request, env) {
  const { image, prompt, duration = 5, ratio = "16:9" } = await request.json();
  if (!image || !/^https:\/\//i.test(image)) throw new Error("Magic Hour image-to-video requires a publicly reachable HTTPS image URL. Save the scene image to Supabase Storage and pass its signed URL.");
  const path = env.MAGIC_HOUR_VIDEO_CREATE_PATH || "/v1/image-to-video";
  const data = await magicHour(request, env, path, { image_url: image, prompt, duration: Math.max(5, Math.min(15, Number(duration) || 5)), aspect_ratio: ratio, resolution: env.MAGIC_HOUR_VIDEO_RESOLUTION || "720p" });
  const taskId = data.id || data.project_id || data.task_id || data.video_project_id;
  if (!taskId) throw new Error("Magic Hour did not return a project/task ID. Check its image-to-video response schema.");
  return { ok: true, taskId: String(taskId), status: data.status || "submitted" };
}
async function videoStatus(request, env) {
  const { taskId } = await request.json(); if (!taskId) throw new Error("Video task ID is required.");
  if (!env.MAGIC_HOUR_API_KEY) throw new Error("The website owner has not configured MAGIC_HOUR_API_KEY.");
  const base = (env.MAGIC_HOUR_API_BASE || "https://api.magichour.ai").replace(/\/$/, "");
  const template = env.MAGIC_HOUR_VIDEO_STATUS_PATH || "/v1/video-projects/{id}";
  const path = template.replace("{id}", encodeURIComponent(taskId));
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${env.MAGIC_HOUR_API_KEY}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `Magic Hour status failed (${response.status}).`);
  const videoUrl = data.video_url || data.output_url || data.download_url || data.url || data.outputs?.[0]?.url || data.result?.url || "";
  return { ok: true, status: data.status || data.state || "processing", videoUrl, error: data.error || data.message || "" };
}

async function audioGenerate(request, env, type) {
  const { prompt, mood = "cinematic", duration = 8 } = await request.json();
  if (!prompt?.trim()) throw new Error(`${type} prompt is required.`);
  const path = type === "music" ? (env.MAGIC_HOUR_MUSIC_PATH || "/v1/ai-music-generator") : (env.MAGIC_HOUR_SFX_PATH || "/v1/sound-effects-generator");
  const data = await magicHour(request, env, path, { prompt: `${mood}. ${prompt}`, duration: Math.max(2, Math.min(120, Number(duration) || 8)), instrumental: true });
  const audio = data.audio_base64 || data.audio || data.audio_data;
  if (audio) return { ok: true, audio: String(audio).replace(/^data:[^,]+,/, ""), mimeType: data.mime_type || "audio/mpeg" };
  const url = data.audio_url || data.output_url || data.download_url || data.url;
  if (url) {
    const file = await fetch(url); if (!file.ok) throw new Error("Magic Hour audio result could not be downloaded.");
    return { ok: true, audio: b64(await file.arrayBuffer()), mimeType: file.headers.get("Content-Type") || "audio/mpeg" };
  }
  throw new Error("Magic Hour returned a project without an audio file. This endpoint may be asynchronous; configure its documented status/download flow in this Worker.");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url); const path = url.pathname;
    try {
      if (path === "/api/health" && request.method === "GET") {
        await requireUser(request, env);
        const features = {
          text: !!env.GEMINI_API_KEY,
          image: !!env.HF_TOKEN || env.ALLOW_POLLINATIONS_FALLBACK === "true",
          video: !!env.MAGIC_HOUR_API_KEY && !!env.MAGIC_HOUR_VIDEO_CREATE_PATH && !!env.MAGIC_HOUR_VIDEO_STATUS_PATH,
          voice: !!env.AI,
          music: !!env.MAGIC_HOUR_API_KEY && !!env.MAGIC_HOUR_MUSIC_PATH,
          sfx: !!env.MAGIC_HOUR_API_KEY && !!env.MAGIC_HOUR_SFX_PATH
        };
        return json({ ok: true, ready: Object.values(features).every(Boolean), features }, 200, cors);
      }
      await requireUser(request, env);
      let result;
      if (path === "/api/analyze-story" && request.method === "POST") result = await analyzeStory(request, env);
      else if (path === "/api/storyboard" && request.method === "POST") result = await storyboard(request, env);
      else if (path === "/api/image" && request.method === "POST") result = await image(request, env);
      else if (path === "/api/voice" && request.method === "POST") result = await voice(request, env);
      else if (path === "/api/video/generate" && request.method === "POST") result = await videoGenerate(request, env);
      else if (path === "/api/video/status" && request.method === "POST") result = await videoStatus(request, env);
      else if (path === "/api/music" && request.method === "POST") result = await audioGenerate(request, env, "music");
      else if (path === "/api/sfx" && request.method === "POST") result = await audioGenerate(request, env, "sfx");
      else return json({ ok: false, error: "Route not found." }, 404, cors);
      return json(result, 200, cors);
    } catch (error) {
      const message = error?.message || "Unexpected AI Worker error.";
      const status = /sign in|session|unauthorized/i.test(message) ? 401 : 400;
      return json({ ok: false, error: message }, status, cors);
    }
  }
};
