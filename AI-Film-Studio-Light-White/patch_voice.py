from pathlib import Path
p=Path('/mnt/data/aifilmwork/assets/js/app.js');s=p.read_text()
# restrict character matching to project selection when selection exists
s=s.replace('''  return state.characters.filter(c=>{
    const names=[c.name,...Object.entries(p?.aliases||{}).filter(([,target])=>target.toLowerCase()===String(c.name).toLowerCase()).map(([alias])=>alias)];''','''  return state.characters.filter(c=>{
    if(p?.characterIds?.length&&!p.characterIds.includes(c.id))return false;
    const names=[c.name,...Object.entries(p?.aliases||{}).filter(([,target])=>String(target).toLowerCase()===String(c.name).toLowerCase()).map(([alias])=>alias)];''')
# scene dialogue editor includes voice generation controls and saved audio
s=s.replace('''<div class="ai-action-row"><button type="button" class="secondary-button" data-preview-line="${j}">▶ Preview this voice</button></div>''','''<div class="ai-action-row"><button type="button" class="secondary-button" data-generate-voice="${j}">✦ Generate voice</button><button type="button" class="secondary-button" data-preview-line="${j}">▶ Browser preview</button>${line.audio?`<button type="button" class="text-button danger-text" data-delete-voice="${j}">Delete generated voice</button>`:""}</div>${line.audio?`<audio class="generated-voice-audio" controls src="${line.audio}"></audio>`:""}''')
# persist dialogue_lines via JSON marker in DB, and restore on sync
s=s.replace('''dialogue:s.dialogue_text,dialogue_lines:parseDialogueLines(s.dialogue_text),voice_language:s.voice_language''','''dialogue:(()=>{try{const d=JSON.parse(s.dialogue_text);return d.__dialogueLines?d.__dialogueLines.map(x=>`${x.speaker}: ${x.text}`).join("\\n"):s.dialogue_text;}catch{return s.dialogue_text;}})(),dialogue_lines:(()=>{try{const d=JSON.parse(s.dialogue_text);return d.__dialogueLines||parseDialogueLines(s.dialogue_text);}catch{return parseDialogueLines(s.dialogue_text);}})(),voice_language:s.voice_language''')
s=s.replace('''reference_image_path:s.reference_image_path,generated_image:s.reference_image_path?await StudioDB.signedUrl("project-assets",s.reference_image_path):""''','''reference_image_path:s.reference_image_path,voice_audio_path:s.voice_audio_path||null,voice_audio:s.voice_audio_path?await StudioDB.signedUrl("project-assets",s.voice_audio_path):"",generated_image:s.reference_image_path?await StudioDB.signedUrl("project-assets",s.reference_image_path):""''')
# save cloud image and voice path. Also encode dialogue line metadata.
s=s.replace('''const row={project_id:state.activeProject.id,character_id:s.character_id||null,character_ids:s.character_ids||[],scene_order:i+1,duration_seconds:s.duration,visual_prompt:s.visual_prompt,dialogue_text:s.dialogue,voice_language:s.voice_language,sound_prompt:s.sound_prompt,reference_image_path:refPath};''','''let voicePath=s.voice_audio_path||null;if(s.dialogue_lines?.some(x=>x.audio?.startsWith("data:"))){const audioLine=s.dialogue_lines.find(x=>x.audio?.startsWith("data:"));const audioFile=await dataUrlToFile(audioLine.audio,`scene-${i+1}-voice.mp3`);voicePath=await StudioDB.uploadPrivate("project-assets",`projects/${state.activeProject.id}/scene-${i+1}-voice-${crypto.randomUUID()}.mp3`,audioFile);s.voice_audio_path=voicePath;}const row={project_id:state.activeProject.id,character_id:s.character_id||null,character_ids:s.character_ids||[],scene_order:i+1,duration_seconds:s.duration,visual_prompt:s.visual_prompt,dialogue_text:JSON.stringify({__dialogueLines:s.dialogue_lines||[]}),voice_language:s.voice_language,sound_prompt:s.sound_prompt,reference_image_path:refPath,voice_audio_path:voicePath};''')
# create TTS generation button event in scene click handler
needle='''  const previewLine=e.target.closest("[data-preview-line]");
  if(previewLine){const card=previewLine.closest(".scene-card"),line=readDialogueLines(card)[Number(previewLine.dataset.previewLine)];if(line)previewVoice(line);return;}'''
rep='''  const previewLine=e.target.closest("[data-preview-line]");
  if(previewLine){const card=previewLine.closest(".scene-card"),line=readDialogueLines(card)[Number(previewLine.dataset.previewLine)];if(line)previewVoice(line);return;}
  const deleteVoice=e.target.closest("[data-delete-voice]");
  if(deleteVoice){const card=deleteVoice.closest(".scene-card"),idx=Number(card.dataset.scene),lineIdx=Number(deleteVoice.dataset.deleteVoice),scene=state.activeProject.scenes[idx];scene.dialogue_lines=readDialogueLines(card);if(scene.dialogue_lines[lineIdx])delete scene.dialogue_lines[lineIdx].audio;renderSceneList();saveLocal();toast("Generated voice removed.");return;}
  const generateVoice=e.target.closest("[data-generate-voice]");
  if(generateVoice){const card=generateVoice.closest(".scene-card"),idx=Number(card.dataset.scene),lineIdx=Number(generateVoice.dataset.generateVoice),scene=state.activeProject.scenes[idx],lines=readDialogueLines(card),line=lines[lineIdx];if(!line)return;if(line.language!=="en"){toast("Cloud AI voice generation is currently available for English. Use Browser preview for Sinhala.");return;}generateVoice.disabled=true;generateVoice.textContent="Generating voice…";try{const result=await aiRequest("/api/voice",{text:line.text,language:line.language,voiceStyle:line.voice_style});line.audio=`data:audio/mpeg;base64,${result.audio}`;lines[lineIdx]=line;scene.dialogue_lines=lines;scene.dialogue=lines.map(x=>`${x.speaker}: ${x.text}`).join("\\n");saveLocal();renderSceneList();toast("AI voice generated. Save scenes to sync it to cloud.");}catch(err){toast(err.message);}finally{generateVoice.disabled=false;generateVoice.textContent="✦ Generate voice";}return;}'''
if needle not in s: print('missing event needle')
else: s=s.replace(needle,rep)
# collectSceneCard preserve audio from previous state by index matching
s=s.replace('''const lines=readDialogueLines(card);const dialogue=lines.map(x=>`${x.speaker}: ${x.text}`).join("\\n");''','''const lines=readDialogueLines(card);const previous=state.activeProject.scenes[index]?.dialogue_lines||[];lines.forEach((line,j)=>{if(!line.audio&&previous[j]?.audio)line.audio=previous[j].audio;});const dialogue=lines.map(x=>`${x.speaker}: ${x.text}`).join("\\n");''')
# upload handler
s=s.replace('''const row={project_id:state.activeProject.id,character_id:s.character_id||null''','''const row={project_id:state.activeProject.id,character_id:s.character_id||null''')
p.write_text(s)

# worker voice route
w=Path('/mnt/data/aifilmwork/worker/worker.js');ws=w.read_text()
ws=ws.replace('''features: ["story", "storyboard", "image"], videoGeneration: false, videoGenerationNote: "Still images only; no motion video model is connected.", maxTargetDurationSeconds: 3600, speechGeneration: false, freeTierLimited: true''','''features: ["story", "storyboard", "image", "voice"], videoGeneration: false, videoGenerationNote: "Still images only; no motion video model is connected.", maxTargetDurationSeconds: 3600, speechGeneration: true, speechLanguages: ["en"], freeTierLimited: true''')
needle='''      if (url.pathname === "/api/image") {'''
route='''      if (url.pathname === "/api/voice") {
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

'''+needle
if needle not in ws: print('missing worker image route')
else: ws=ws.replace(needle,route)
w.write_text(ws)

# migration for cloud audio asset path
m=Path('/mnt/data/aifilmwork/supabase/migrations/20261110_scene_voice_audio.sql')
m.write_text('''-- Store generated dialogue voice audio in the existing private project-assets bucket.\nalter table public.scenes\n  add column if not exists voice_audio_path text;\n''')
