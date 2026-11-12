from pathlib import Path
p=Path('/mnt/data/filmfix/worker/worker.js')
s=p.read_text()
s=s.replace('const IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";','const IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";\nconst IMAGE_FALLBACK_MODEL = "@cf/black-forest-labs/flux-1-schnell";')
# Replace voice endpoint with current Aura-1 primary and MeloTTS fallback. Return base64 MP3 consistently.
start=s.index('      if (url.pathname === "/api/voice") {')
end=s.index('\n      if (url.pathname === "/api/image") {', start)
voice='''      if (url.pathname === "/api/voice") {
        const text = String(body.text || "").trim();
        const language = String(body.language || "en").toLowerCase();
        const voiceStyle = String(body.voiceStyle || "warm, expressive voice").slice(0, 180);
        if (!text) return json({ error: "Enter dialogue before generating a voice." }, 400, headers);
        if (text.length > 1200) return json({ error: "Keep each dialogue line under 1,200 characters." }, 400, headers);
        if (language !== "en") return json({ error: "AI voice generation currently supports English only on this Worker. Sinhala dialogue can use Browser preview; a Sinhala AI voice provider/API is required for generated Sinhala audio." }, 422, headers);
        let audio = "", model = "@cf/deepgram/aura-1";
        try {
          const speakerMatch = voiceStyle.match(/\\b(asteria|arcas|orion|orpheus|athena|luna|zeus|perseus|helios|hera|stella|angus)\\b/i);
          const speaker = speakerMatch ? speakerMatch[1].toLowerCase() : (/male|deep|man|boy/i.test(voiceStyle) ? "orion" : "asteria");
          const response = await env.AI.run(model, { text, speaker, encoding: "mp3", container: "none" }, { returnRawResponse: true });
          if (response instanceof Response) {
            if (!response.ok) throw new Error(`Aura voice provider returned HTTP ${response.status}.`);
            const bytes = new Uint8Array(await response.arrayBuffer());
            let binary = ""; for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000));
            audio = btoa(binary);
          } else {
            const raw = response?.audio || response?.result?.audio || response;
            if (typeof raw === "string") audio = raw;
            else if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
              const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
              let binary = ""; for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000));
              audio = btoa(binary);
            }
          }
          if (!audio) throw new Error("Aura returned an empty audio response.");
        } catch (primaryError) {
          // MeloTTS remains a compatibility fallback while it is still available.
          try {
            model = "@cf/myshell-ai/melotts";
            const result = await env.AI.run(model, { prompt: `Speak these exact words clearly. Voice style: ${voiceStyle}. Dialogue: ${text}`, lang: "en" });
            audio = result?.audio || (typeof result === "string" ? result : "");
            if (!audio) throw new Error("MeloTTS returned no audio.");
          } catch (fallbackError) {
            throw new Error(`AI voice generation failed. Aura: ${String(primaryError.message || primaryError).slice(0,180)}. MeloTTS fallback: ${String(fallbackError.message || fallbackError).slice(0,180)}`);
          }
        }
        return json({ ok: true, audio, mimeType: "audio/mpeg", model }, 200, headers);
      }
'''
s=s[:start]+voice+s[end:]
# Modify image AI call: primary Klein; if 3043/internal/capacity then fallback to schnell without reference images; references are retained in prompt text.
old='''        const request = new Request("https://workers-ai.local/image", {method:"POST", body:form});
        const result = await env.AI.run(IMAGE_MODEL, {
          multipart: { body: request.body, contentType: request.headers.get("content-type") }
        });
        let encoded = result?.image || result?.result?.image || "";
        if (encoded instanceof ArrayBuffer) encoded = btoa(String.fromCharCode(...new Uint8Array(encoded)));
        if (ArrayBuffer.isView(encoded)) encoded = btoa(String.fromCharCode(...new Uint8Array(encoded.buffer)));
        if (typeof encoded !== "string" || !encoded) throw new Error("The reference-image model returned no image. Try a smaller reference image or shorter prompt.");'''
new='''        let result, usedModel = IMAGE_MODEL, primaryError = null;
        try {
          const request = new Request("https://workers-ai.local/image", {method:"POST", body:form});
          result = await env.AI.run(IMAGE_MODEL, { multipart: { body: request.body, contentType: request.headers.get("content-type") } });
        } catch (error) {
          primaryError = error;
          const message = String(error?.message || error);
          // 3043 is a Workers AI internal/model-side failure. Retry once on the lighter
          // FLUX.1 schnell model; that model is text-to-image only, so identity refs are
          // described in the prompt but cannot be passed as image inputs.
          if (!/3043|internal server error|capacity temporarily exceeded|temporarily unavailable|timeout/i.test(message)) throw error;
          usedModel = IMAGE_FALLBACK_MODEL;
          result = await env.AI.run(IMAGE_FALLBACK_MODEL, { prompt: String(prompt).slice(0, 2000), steps: 4 });
        }
        let encoded = result?.image || result?.result?.image || result?.response || result;
        if (encoded instanceof ArrayBuffer) encoded = btoa(String.fromCharCode(...new Uint8Array(encoded)));
        if (ArrayBuffer.isView(encoded)) { const bytes = new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength); let binary=""; for(let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000)); encoded = btoa(binary); }
        if (typeof encoded !== "string" || !encoded) throw new Error(`Image generation failed on ${usedModel}${primaryError ? ` after ${String(primaryError.message||primaryError).slice(0,160)}` : ""}. Check Workers AI availability and limits.`);'''
if old not in s: raise SystemExit('image call pattern missing')
s=s.replace(old,new)
s=s.replace('return json({ ok: true, image: encoded, model: IMAGE_MODEL, referenceCount: refs.length }, 200, headers);','return json({ ok: true, image: encoded, model: usedModel, fallbackUsed: usedModel !== IMAGE_MODEL, referenceCount: refs.length }, 200, headers);')
# Better structured error includes Cloudflare request ID if available and retry hint
s=s.replace('''      const message = String(error?.message || error || "AI request failed");
      const isVideoRoute''','''      const message = String(error?.message || error || "AI request failed");
      const requestId = String(error?.requestId || error?.request_id || "");
      const isVideoRoute''')
s=s.replace('''      return json({ error: message.slice(0, 500), hint }, status, headers);''','''      return json({ error: message.slice(0, 500), hint, requestId: requestId || undefined, code: (message.match(/\\b(30\\d{2}|5\\d{3})\\b/)||[])[1] || undefined }, status, headers);''')
p.write_text(s)

# Frontend: show actionable errors, support both button states and avoid silent button no-op.
p=Path('/mnt/data/filmfix/assets/js/app.js')
s=p.read_text()
s=s.replace('''  const response=await fetch(`${base}${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok||!data.ok) throw new Error(data.error||`AI request failed (${response.status}).`);
  return data;''','''  let response;
  try { response=await fetch(`${base}${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); }
  catch(error){ throw new Error(`Cannot reach the AI Worker (${path}). Check internet, Worker URL and ALLOWED_ORIGIN. ${error.message||"Network error"}`); }
  let data={};try{data=await response.json();}catch{}
  if(!response.ok||!data.ok){const code=data.code?` [Cloudflare ${data.code}]`:"";const request=data.requestId?` Request ID: ${data.requestId}.`:"";const hint=data.hint?` ${data.hint}`:"";throw new Error(`${data.error||`AI request failed (${response.status}).`}${code}${request}${hint}`);}
  return data;''')
# voice generation: don't block click silently; show helpful language explanation in button area; update label finally.
s=s.replace('''if(!line)return;if(line.language!=="en"){toast("Cloud AI voice generation is currently available for English. Use Browser preview for Sinhala.");return;}generateVoice.disabled=true;''','''if(!line)return;if(!line.text){toast("Add dialogue text before generating a voice.");return;}if(line.language!=="en"){toast("Sinhala AI voice is not enabled on this Worker yet. Change this line to English for AI voice, or use Browser preview for Sinhala.");return;}generateVoice.disabled=true;''')
s=s.replace('''generateVoice.textContent=`✦ Generate another voice option (${(line.voice_variants||[]).length+1})`;''','''generateVoice.textContent=`✦ Generate voice Option ${(line.voice_variants||[]).length+1}`;''')
# The auto scene loop should not report success if voice/image jobs failed; include per scene result summary.
s=s.replace('''toast(`Created ${p.scenes.length} scenes with separate character actions and dialogue.`);''','''toast(`Created ${p.scenes.length} scenes. Artwork/voice generation results are shown per scene above.`);''')
p.write_text(s)
