
/**
 * AI Film Studio - Cloudflare Workers AI gateway
 * Story: GLM 4.7 Flash
 * Storyboard: Llama 3.3 70B with JSON Mode
 * Images: FLUX.1 Schnell
 *
 * Cloudflare Workers AI allowance is limited.
 */

const TEXT_MODEL = "@cf/zai-org/glm-4.7-flash";
const STORYBOARD_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGIN || "http://localhost:8000")
    .split(",").map(x => x.trim()).filter(Boolean);

  const permitted = allowed.includes("*") || allowed.includes(origin);

  return {
    "Access-Control-Allow-Origin": permitted
      ? (allowed.includes("*") ? "*" : origin)
      : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function extractText(result) {
  const value =
    result?.response ??
    result?.choices?.[0]?.message?.content ??
    result?.result?.response ??
    "";

  return typeof value === "string"
    ? value
    : JSON.stringify(value);
}

function parseScenes(text) {
  let cleaned = String(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let value;

  try {
    value = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start >= 0 && end > start) {
      try {
        value = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        throw new Error("AI returned invalid JSON. Please try again.");
      }
    } else {
      throw new Error("AI did not return a valid storyboard.");
    }
  }

  const list = Array.isArray(value)
    ? value
    : value?.scenes;

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("AI did not return any scenes. Please try again.");
  }

  return list.slice(0, 12).map((s, i) => ({
    title: String(s.title || `Scene ${i + 1}`).slice(0, 100),
    visual_prompt: String(
      s.visual_prompt || s.visual || ""
    ).slice(0, 1800),
    dialogue: String(s.dialogue || "").slice(0, 1200),
    sound_prompt: String(
      s.sound_prompt || s.sound || ""
    ).slice(0, 500),
    duration: Math.max(
      3,
      Math.min(15, Number(s.duration) || 8)
    )
  }));
}

const STORYBOARD_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          visual_prompt: { type: "string" },
          dialogue: { type: "string" },
          sound_prompt: { type: "string" },
          duration: { type: "number" }
        },
        required: [
          "title",
          "visual_prompt",
          "dialogue",
          "sound_prompt",
          "duration"
        ]
      }
    }
  },
  required: ["scenes"]
};

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    const origin = request.headers.get("Origin") || "";

    const allowed = (env.ALLOWED_ORIGIN || "http://localhost:8000")
      .split(",").map(x => x.trim());

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (
      origin &&
      !allowed.includes("*") &&
      !allowed.includes(origin)
    ) {
      return json({
        error: "This website origin is not allowed. Check ALLOWED_ORIGIN."
      }, 403, headers);
    }

    const url = new URL(request.url);

    if (
      request.method === "GET" &&
      url.pathname === "/api/health"
    ) {
      return json({
        ok: true,
        provider: "Cloudflare Workers AI",
        features: ["story", "storyboard", "image"],
        models: {
          story: TEXT_MODEL,
          storyboard: STORYBOARD_MODEL,
          image: IMAGE_MODEL
        },
        videoGeneration: false,
        speechGeneration: false,
        freeTierLimited: true
      }, 200, headers);
    }

    if (request.method !== "POST") {
      return json({ error: "Route not found." }, 404, headers);
    }

    if (!env.AI) {
      return json({
        error: "Workers AI binding is missing. Check wrangler.toml."
      }, 500, headers);
    }

    let body;

    try {
      const raw = await request.text();

      if (raw.length > 30000) {
        return json({
          error: "Request is too large. Keep prompts under 30 KB."
        }, 413, headers);
      }

      body = JSON.parse(raw || "{}");
    } catch {
      return json({ error: "Invalid JSON request." }, 400, headers);
    }

    try {
      // STORY GENERATION
      if (url.pathname === "/api/story") {
        const idea = String(body.idea || "").trim();

        if (!idea) {
          return json({
            error: "Enter a short film idea first."
          }, 400, headers);
        }

        const language =
          body.language === "en" ? "English" :
          body.language === "both" ? "Sinhala and English" :
          "Sinhala";

        const result = await env.AI.run(TEXT_MODEL, {
          messages: [
            {
              role: "system",
              content:
                "You are a professional cinematic screenwriter. " +
                "Create original stories with a clear beginning, conflict, climax and ending. " +
                "Follow the requested language."
            },
            {
              role: "user",
              content:
                `Write a cinematic short film story in ${language}. ` +
                `Create a title and clear events suitable for 4-8 scenes. ` +
                `Film idea: ${idea}`
            }
          ],
          max_tokens: 1400,
          temperature: 0.8
        });

        const story = extractText(result).trim();

        if (!story) {
          throw new Error("The text model returned an empty story.");
        }

        return json({
          ok: true,
          story,
          model: TEXT_MODEL
        }, 200, headers);
      }

      // AI STORYBOARD GENERATION
      if (url.pathname === "/api/storyboard") {
        const story = String(body.story || "").trim();

        if (!story) {
          return json({
            error: "Enter a story before generating scenes."
          }, 400, headers);
        }

        const language =
          body.language === "en" ? "English" :
          body.language === "both" ? "Sinhala and English" :
          "Sinhala";

        const target = Math.max(
          1,
          Math.min(300, Number(body.duration) || 60)
        );

        const result = await env.AI.run(STORYBOARD_MODEL, {
          messages: [
            {
              role: "system",
              content:
                "You are an expert film director and storyboard artist. " +
                "Return a structured storyboard matching the supplied JSON schema. " +
                "Do not include markdown or explanations. " +
                "Keep character appearance, clothing and locations consistent. " +
                "Write all scene text in the requested language."
            },
            {
              role: "user",
              content:
                `Create a cinematic storyboard in ${language}. ` +
                `Target film duration: ${target} seconds. ` +
                `Create 4 to 8 scenes. Each scene must last 3 to 15 seconds. ` +
                `Each visual_prompt must describe the characters, their appearance, ` +
                `environment, lighting, camera angle, camera movement and action. ` +
                `Keep the same characters visually consistent in every scene. ` +
                `Dialogue should contain spoken lines or an empty string. ` +
                `sound_prompt should describe background music and sound effects. ` +
                `Story:\n${story}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: STORYBOARD_SCHEMA
          },
          max_tokens: 3000,
          temperature: 0.4
        });

        const scenes = parseScenes(extractText(result));

        return json({
          ok: true,
          scenes,
          model: STORYBOARD_MODEL
        }, 200, headers);
      }

      // AI IMAGE GENERATION
      if (url.pathname === "/api/image") {
        const prompt = String(body.prompt || "").trim();

        if (!prompt) {
          return json({
            error: "Enter an image prompt."
          }, 400, headers);
        }

        if (prompt.length > 2000) {
          return json({
            error: "Image prompt must be 2,000 characters or fewer."
          }, 400, headers);
        }

        const result = await env.AI.run(IMAGE_MODEL, {
          prompt,
          steps: 4
        });

        if (!result?.image) {
          throw new Error(
            "The image model returned no image. Try a shorter prompt."
          );
        }

        return json({
          ok: true,
          image: `data:image/jpeg;base64,${result.image}`,
          model: IMAGE_MODEL
        }, 200, headers);
      }

      return json({ error: "Route not found." }, 404, headers);

    } catch (error) {
      const message = String(
        error?.message || error || "AI request failed"
      );

      const status =
        /limit|quota|neurons|rate/i.test(message) ? 429 : 502;

      return json({
        error: message.slice(0, 500),
        hint: status === 429
          ? "The Cloudflare AI allowance or rate limit may have been reached. Try again later."
          : "Check Cloudflare Workers AI model availability and deployment logs."
      }, status, headers);
    }
  }
};
