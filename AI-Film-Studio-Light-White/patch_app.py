from pathlib import Path
p=Path('/mnt/data/aifilmwork/assets/js/app.js')
s=p.read_text()
s=s.replace('''const packProjectText = (story, direction) => `[[STORY]]\\n${String(story||"").trim()}\\n\\n[[OVERALL_DIRECTION]]\\n${String(direction||"").trim()}`;''','''const packProjectText = (story, direction, characterIds=[], aliases={}) => `[[STORY]]\\n${String(story||"").trim()}\\n\\n[[OVERALL_DIRECTION]]\\n${String(direction||"").trim()}\\n\\n[[CHARACTER_SETTINGS]]\\n${JSON.stringify({characterIds,aliases})}`;''')
s=s.replace('''  if(start===0 && raw.includes(marker)) return {prompt:raw.slice("[[STORY]]\\n".length,raw.indexOf(marker)).trim(),direction:raw.slice(raw.indexOf(marker)+marker.length).trim()};
  return {prompt:raw.replace(/^\\[\\[STORY\\]\\]\\n/,"").trim(),direction:""};''','''  if(start===0 && raw.includes(marker)) {
    const directionStart=raw.indexOf(marker)+marker.length;
    const settingsMarker="\\n\\n[[CHARACTER_SETTINGS]]\\n";
    const settingsAt=raw.indexOf(settingsMarker,directionStart);
    let settings={characterIds:[],aliases:{}};
    if(settingsAt>=0){try{settings=JSON.parse(raw.slice(settingsAt+settingsMarker.length));}catch{} }
    return {prompt:raw.slice("[[STORY]]\\n".length,raw.indexOf(marker)).trim(),direction:(settingsAt>=0?raw.slice(directionStart,settingsAt):raw.slice(directionStart)).trim(),characterIds:settings.characterIds||[],aliases:settings.aliases||{}};
  }
  return {prompt:raw.replace(/^\\[\\[STORY\\]\\]\\n/,"").trim(),direction:"",characterIds:[],aliases:{}};''')
s=s.replace('''function renderCharacters(){
  const grid=$("#characterGrid");''','''function renderProjectCharacterChoices(selected=[]){
  const el=$("#projectCharacters");if(!el)return;
  el.innerHTML=state.characters.map(c=>`<option value="${safe(c.id)}" ${selected.includes(c.id)?"selected":""}>${safe(c.name)}</option>`).join("");
}
function renderCharacters(){
  const grid=$("#characterGrid");''')
s=s.replace('''  const p={id:crypto.randomUUID(),title:$("#projectTitle").value.trim(),prompt:$("#projectPrompt").value.trim(),direction:$("#projectDirection").value.trim(),language:$("#projectLanguage").value,ratio:$("#projectRatio").value,duration:Number($("#projectDuration").value),scenes:[],created_at:new Date().toISOString()};''','''  const aliases={};
  $("#projectAliases").value.split(/\\r?\\n/).forEach(line=>{const m=line.match(/^\\s*(.+?)\\s*->\\s*(.+?)\\s*$/);if(m)aliases[m[1].trim()]=m[2].trim();});
  const p={id:crypto.randomUUID(),title:$("#projectTitle").value.trim(),prompt:$("#projectPrompt").value.trim(),direction:$("#projectDirection").value.trim(),characterIds:[...$("#projectCharacters").selectedOptions].map(o=>o.value),aliases,language:$("#projectLanguage").value,ratio:$("#projectRatio").value,duration:Number($("#projectDuration").value),scenes:[],created_at:new Date().toISOString()};''')
s=s.replace('''story_prompt:packProjectText(p.prompt,p.direction),language:p.language''','''story_prompt:packProjectText(p.prompt,p.direction,p.characterIds,p.aliases),language:p.language''')
s=s.replace('''function detectCharactersInText(text){
  const source=String(text||"");
  return state.characters.filter(c=>{
    const name=String(c.name||"").trim();if(!name)return false;
    try{return new RegExp(`(^|[^\\\\p{L}\\\\p{N}_])${escapeRegExp(name)}(?=$|[^\\\\p{L}\\\\p{N}_])`,"iu").test(source);}
    catch{return source.toLocaleLowerCase().includes(name.toLocaleLowerCase());}
  });
}''','''function detectCharactersInText(text){
  const source=String(text||"");const p=state.activeProject;
  return state.characters.filter(c=>{
    const names=[c.name,...Object.entries(p?.aliases||{}).filter(([,target])=>target.toLowerCase()===String(c.name).toLowerCase()).map(([alias])=>alias)];
    return names.some(name=>{name=String(name||"").trim();if(!name)return false;try{return new RegExp(`(^|[^\\\\p{L}\\\\p{N}_])${escapeRegExp(name)}(?=$|[^\\\\p{L}\\\\p{N}_])`,"iu").test(source);}catch{return source.toLocaleLowerCase().includes(name.toLocaleLowerCase());}});
  });
}''')
s=s.replace('''function sceneCharacterPrompt(scene){
  const ids=sceneCharacterIds(scene);''','''function sceneCharacterPrompt(scene){
  const ids=sceneCharacterIds(scene);''')
# project setup preselected characters are used when the story explicitly names one; prompt roster restricted to project selection
s=s.replace('''const characterRoster=state.characters.map(c=>`${c.name}: ${c.style||"3D animated"}; ${c.description||"saved character"}`).join("\\n");''','''const projectChars=state.characters.filter(c=>(p.characterIds||[]).includes(c.id));
    const characterRoster=projectChars.map(c=>`${c.name}: ${c.style||"3D animated"}; ${c.description||"saved character"}`).join("\\n");
    const aliasInstructions=Object.entries(p.aliases||{}).map(([alias,target])=>`${alias} means saved character ${target}`).join("; ");''')
s=s.replace('''const storyboardStory=[`STORY:\\n${p.prompt||p.story_prompt||""}`,p.direction?`OVERALL DIRECTION:\\n${p.direction}`:"",characterRoster?`\\nSAVED CHARACTER LIBRARY (use exact names in scenes where they appear):\\n${characterRoster}`:""].join("\\n");''','''const storyboardStory=[`STORY:\\n${p.prompt||p.story_prompt||""}`,p.direction?`OVERALL DIRECTION:\\n${p.direction}`:"",characterRoster?`\\nSELECTED SAVED CHARACTERS (use the exact saved designs whenever these characters appear; do not invent substitutes):\\n${characterRoster}`:"",aliasInstructions?`\\nSTORY NAME MAPPINGS: ${aliasInstructions}`:""].join("\\n");''')
s=s.replace('''p.scenes=result.scenes.map((s,i)=>{const character_ids=detectCharactersInText(`${s.visual_prompt||""}\\n${s.dialogue||""}`).map(c=>c.id);return {id:crypto.randomUUID(),duration:s.duration,character_ids,character_id:character_ids[0]||"",visual_prompt:s.visual_prompt,dialogue:s.dialogue,voice_language:p.language==="en"?"en":"si",sound_prompt:s.sound_prompt};});''','''p.scenes=result.scenes.map((s,i)=>{const character_ids=detectCharactersInText(`${s.visual_prompt||""}\\n${s.dialogue||""}`).map(c=>c.id);return {id:crypto.randomUUID(),duration:s.duration,character_ids,character_id:character_ids[0]||"",visual_prompt:s.visual_prompt,dialogue:s.dialogue,dialogue_lines:parseDialogueLines(s.dialogue),voice_language:p.language==="en"?"en":"si",sound_prompt:s.sound_prompt};});''')
# scene markup and dialogue editor
old='''function sceneMarkup(s,i){return `<div class="scene-card" data-scene="${i}"><div class="scene-top"><b>Scene ${String(i+1).padStart(2,"0")}</b><button class="scene-remove" data-remove-scene="${i}">Remove</button></div><div class="scene-fields"><label class="wide">Characters (multiple)<select data-field="character_ids" multiple size="${Math.max(2,Math.min(5,state.characters.length||2))}">${state.characters.map(c=>`<option value="${safe(c.id)}" ${sceneCharacterIds(s).includes(c.id)?"selected":""}>${safe(c.name)}</option>`).join("")}</select><small class="helper">Write saved character names in the Visual prompt or Dialogue. Matching names are automatically selected; you can also select multiple characters here.</small><small class="detected-character-note" data-detected-characters>${sceneCharacterIds(s).length?`Detected/selected: ${sceneCharacterIds(s).map(id=>safe(state.characters.find(c=>c.id===id)?.name||"")).join(", ")}`:"No saved character names detected yet."}</small></label><label>Duration (seconds)<input data-field="duration" type="number" min="1" max="3600" value="${s.duration||8}"></label><label class="wide">Visual prompt<textarea data-field="visual_prompt" rows="2" placeholder="Describe the scene, action, camera and environment...">${safe(s.visual_prompt||"")}</textarea></label><label class="wide">Dialogue<textarea data-field="dialogue" rows="2" placeholder="Enter Sinhala or English dialogue...">${safe(s.dialogue||"")}</textarea></label><label>Voice language<select data-field="voice_language"><option value="si" ${s.voice_language==="si"?"selected":""}>Sinhala</option><option value="en" ${s.voice_language==="en"?"selected":""}>English</option></select></label><label>Background sound<input data-field="sound_prompt" value="${safe(s.sound_prompt||"")}" placeholder="Wind, birds, music..."></label></div><div class="ai-action-row"><button type="button" class="secondary-button" data-generate-scene-image="${i}">✦ Generate scene image</button><button type="button" class="secondary-button" data-speak-dialogue="${i}">▶ Preview dialogue voice</button></div>${s.generated_image?`<img class="ai-scene-image" src="${s.generated_image}" alt="Generated scene ${i+1}">`:""}</div>`;}'''
new='''function parseDialogueLines(text){
  const lines=String(text||"").split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);
  return lines.map(line=>{const m=line.match(/^([^:：-]{1,50})\\s*[:：-]\\s*(.+)$/);return m?{speaker:m[1].trim(),text:m[2].trim(),voice_style:"Girl voice, warm, smooth"}:{speaker:"Narrator",text:line,voice_style:"Warm, smooth narration"};});
}
function dialogueLineMarkup(s,i){
  const lines=Array.isArray(s.dialogue_lines)&&s.dialogue_lines.length?s.dialogue_lines:parseDialogueLines(s.dialogue);
  return lines.map((line,j)=>`<div class="dialogue-line" data-dialogue-line="${j}"><div class="dialogue-line-head"><b>Dialogue ${j+1}</b><button type="button" class="text-button danger-text" data-delete-dialogue="${j}">Delete</button></div><div class="scene-fields"><label>Character<select data-line-speaker>${[`<option value="Narrator" ${line.speaker==="Narrator"?"selected":""}>Narrator</option>`,...state.characters.map(c=>`<option value="${safe(c.name)}" ${line.speaker===c.name?"selected":""}>${safe(c.name)}</option>`)].join("")}</select></label><label>Voice language<select data-line-language><option value="si" ${(line.language||s.voice_language)==="si"?"selected":""}>Sinhala</option><option value="en" ${(line.language||s.voice_language)==="en"?"selected":""}>English</option></select></label><label class="wide">Dialogue<textarea data-line-text rows="2">${safe(line.text)}</textarea></label><label class="wide">Voice style<input data-line-style value="${safe(line.voice_style||"Girl voice, warm, smooth")}" placeholder="Girl voice, warm, smooth / deep male voice..."></label><div class="ai-action-row"><button type="button" class="secondary-button" data-preview-line="${j}">▶ Preview this voice</button></div></div></div>`).join("")||'<p class="helper">No dialogue yet. Add a dialogue line for each speaking character.</p>';
}
function sceneMarkup(s,i){return `<div class="scene-card" data-scene="${i}"><div class="scene-top"><b>Scene ${String(i+1).padStart(2,"0")}</b><button class="scene-remove" data-remove-scene="${i}">Remove</button></div><div class="scene-fields"><label class="wide">Characters (multiple)<select data-field="character_ids" multiple size="${Math.max(2,Math.min(5,state.characters.length||2))}">${state.characters.map(c=>`<option value="${safe(c.id)}" ${sceneCharacterIds(s).includes(c.id)?"selected":""}>${safe(c.name)}</option>`).join("")}</select><small class="helper">Names in the story (including your mapping) are detected automatically. You can also select more than one character.</small><small class="detected-character-note" data-detected-characters>${sceneCharacterIds(s).length?`Detected/selected: ${sceneCharacterIds(s).map(id=>safe(state.characters.find(c=>c.id===id)?.name||"")).join(", ")}`:"No saved character names detected yet."}</small></label><label>Duration (seconds)<input data-field="duration" type="number" min="1" max="3600" value="${s.duration||8}"></label><label class="wide">Visual prompt<textarea data-field="visual_prompt" rows="2" placeholder="Describe the scene, action, camera and environment...">${safe(s.visual_prompt||"")}</textarea></label><textarea data-field="dialogue" hidden>${safe(s.dialogue||"")}</textarea><label>Default voice language<select data-field="voice_language"><option value="si" ${s.voice_language==="si"?"selected":""}>Sinhala</option><option value="en" ${s.voice_language==="en"?"selected":""}>English</option></select></label><label>Background sound<input data-field="sound_prompt" value="${safe(s.sound_prompt||"")}" placeholder="Wind, birds, music..."></label></div><h4>Character dialogue & voice</h4>${dialogueLineMarkup(s,i)}<div class="ai-action-row"><button type="button" class="secondary-button" data-add-dialogue="${i}">＋ Add character dialogue</button><button type="button" class="secondary-button" data-generate-scene-image="${i}">✦ Generate / replace image</button><label class="secondary-button upload-scene-label">↑ Upload image<input type="file" accept="image/*" data-upload-scene-image="${i}" hidden></label>${s.generated_image?`<button type="button" class="text-button danger-text" data-remove-scene-image="${i}">Remove image</button>`:""}</div>${s.generated_image?`<img class="ai-scene-image" src="${s.generated_image}" alt="Scene ${i+1} image"><small class="helper">Text-to-image generation may not reproduce a reference character exactly. Upload a finished scene image when exact matching is essential.</small>`:""}</div>`;}'''
if old not in s: print('WARNING old sceneMarkup not found')
else: s=s.replace(old,new)
# Add event handling for dialogue and image operations before existing scene click listener
needle='''$("#sceneList").addEventListener("click",async e=>{
  const imageButton=e.target.closest("[data-generate-scene-image]");'''
replace='''$("#sceneList").addEventListener("click",async e=>{
  const addLine=e.target.closest("[data-add-dialogue]");
  if(addLine){const idx=Number(addLine.dataset.addDialogue),scene=state.activeProject.scenes[idx];scene.dialogue_lines=Array.isArray(scene.dialogue_lines)?scene.dialogue_lines:parseDialogueLines(scene.dialogue);scene.dialogue_lines.push({speaker:state.characters[0]?.name||"Narrator",text:"",voice_style:"Girl voice, warm, smooth",language:scene.voice_language||"en"});renderSceneList();return;}
  const delLine=e.target.closest("[data-delete-dialogue]");
  if(delLine){const card=delLine.closest(".scene-card"),idx=Number(card.dataset.scene),scene=state.activeProject.scenes[idx];scene.dialogue_lines=readDialogueLines(card).filter((_,j)=>j!==Number(delLine.dataset.deleteDialogue));scene.dialogue=scene.dialogue_lines.map(x=>`${x.speaker}: ${x.text}`).join("\\n");renderSceneList();return;}
  const previewLine=e.target.closest("[data-preview-line]");
  if(previewLine){const card=previewLine.closest(".scene-card"),line=readDialogueLines(card)[Number(previewLine.dataset.previewLine)];if(line)previewVoice(line);return;}
  const removeImage=e.target.closest("[data-remove-scene-image]");
  if(removeImage){const idx=Number(removeImage.dataset.removeSceneImage);state.activeProject.scenes[idx].generated_image="";state.activeProject.scenes[idx].reference_image_path=null;saveLocal();renderSceneList();toast("Scene image removed.");return;}
  const imageButton=e.target.closest("[data-generate-scene-image]");'''
if needle not in s: print('WARNING click needle missing')
else: s=s.replace(needle,replace)
# replace voice preview tail listener block with new helper functions; preserve click handler closure
oldvoice='''  const speak=e.target.closest("[data-speak-dialogue]");if(!speak)return;
  const scene=state.activeProject?.scenes?.[Number(speak.dataset.speakDialogue)];if(!scene?.dialogue?.trim()){toast("Add dialogue to this scene first.");return;}
  if(!( "speechSynthesis" in window)){toast("This browser does not support speech preview.");return;}
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(scene.dialogue);utterance.lang=scene.voice_language==="si"?"si-LK":"en-US";
  const voices=speechSynthesis.getVoices();const match=voices.find(v=>v.lang.toLowerCase().startsWith(scene.voice_language==="si"?"si":"en"));if(match)utterance.voice=match;speechSynthesis.speak(utterance);
});'''
# actual spacing variant
start=s.find('  const speak=e.target.closest("[data-speak-dialogue]");')
if start>=0:
    end=s.find('\n});',start)
    s=s[:start]+'''  const speak=e.target.closest("[data-speak-dialogue]");if(speak){const scene=state.activeProject?.scenes?.[Number(speak.dataset.speakDialogue)];if(scene)readSceneDialogueFromCard(speak.closest(".scene-card"),scene);}
});
function readDialogueLines(card){return $$("[data-dialogue-line]",card).map(row=>({speaker:row.querySelector("[data-line-speaker]")?.value||"Narrator",text:row.querySelector("[data-line-text]")?.value.trim()||"",language:row.querySelector("[data-line-language]")?.value||"en",voice_style:row.querySelector("[data-line-style]")?.value||"Warm, smooth"})).filter(x=>x.text);}
function readSceneDialogueFromCard(card,scene){const lines=readDialogueLines(card);scene.dialogue_lines=lines;scene.dialogue=lines.map(x=>`${x.speaker}: ${x.text}`).join("\\n");if(lines.length)previewVoice(lines[0]);}
function previewVoice(line){if(!("speechSynthesis" in window)){toast("This browser does not support voice preview.");return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(line.text);u.lang=line.language==="si"?"si-LK":"en-US";const voices=speechSynthesis.getVoices();const female=/female|woman|girl|zira|samantha|susan|aria|jenny|sara|salli/i;const wantFemale=/girl|female|woman/i.test(line.voice_style||"");const match=voices.find(v=>v.lang.toLowerCase().startsWith(line.language==="si"?"si":"en")&&(!wantFemale||female.test(v.name)))||voices.find(v=>v.lang.toLowerCase().startsWith(line.language==="si"?"si":"en"));if(match)u.voice=match;const style=(line.voice_style||"").toLowerCase();u.pitch=style.includes("deep")||style.includes("male")?0.82:style.includes("girl")||style.includes("female")?1.12:1.0;u.rate=style.includes("slow")?0.86:style.includes("fast")?1.08:0.96;speechSynthesis.speak(u);}
function collectSceneCard(card,index){const get=n=>card.querySelector(`[data-field="${n}"]`);const lines=readDialogueLines(card);const dialogue=lines.map(x=>`${x.speaker}: ${x.text}`).join("\\n");const visual_prompt=get("visual_prompt").value;const selected=[...get("character_ids").selectedOptions].map(o=>o.value);const detected=detectCharactersInText(`${visual_prompt}\\n${dialogue}`).map(c=>c.id);const character_ids=[...new Set([...selected,...detected])];return {id:state.activeProject.scenes[index]?.id||crypto.randomUUID(),character_ids,character_id:character_ids[0]||null,duration:Number(get("duration").value)||8,visual_prompt,dialogue,dialogue_lines:lines,voice_language:get("voice_language").value,sound_prompt:get("sound_prompt").value,generated_image:state.activeProject.scenes[index]?.generated_image||"",reference_image_path:state.activeProject.scenes[index]?.reference_image_path||null};}
''' + s[end+4:]
else: print('WARNING voice block not found')
# change saveScenes collector
oldsave='''  const cards=$$(".scene-card");const scenes=[];
  for(let i=0;i<cards.length;i++){
    const card=cards[i],get=n=>card.querySelector(`[data-field="${n}"]`);
    const visual_prompt=get("visual_prompt").value,dialogue=get("dialogue").value;
    const selectedIds=[...get("character_ids").selectedOptions].map(o=>o.value);
    const detectedIds=detectCharactersInText(`${visual_prompt}\\n${dialogue}`).map(c=>c.id);
    const character_ids=[...new Set([...selectedIds,...detectedIds])];
    scenes.push({id:card.dataset.id||crypto.randomUUID(),character_ids,character_id:character_ids[0]||null,duration:Number(get("duration").value)||8,visual_prompt,dialogue,voice_language:get("voice_language").value,sound_prompt:get("sound_prompt").value,generated_image:state.activeProject.scenes[i]?.generated_image||"",reference_image_path:state.activeProject.scenes[i]?.reference_image_path||null});
  }'''
s=s.replace(oldsave,'''  const cards=$$(".scene-card");const scenes=cards.map((card,i)=>collectSceneCard(card,i));''')
# Sync cloud loads dialogue_lines
s=s.replace('''dialogue:s.dialogue_text,voice_language:s.voice_language''','''dialogue:s.dialogue_text,dialogue_lines:parseDialogueLines(s.dialogue_text),voice_language:s.voice_language''')
# Scene input event update now no visible dialogue field; keep visual prompt only
s=s.replace("if(!card||!e.target.matches('[data-field=\"visual_prompt\"],[data-field=\"dialogue\"]'))return;","if(!card||!e.target.matches('[data-field=\"visual_prompt\"]'))return;")
# update scene image prompt to add selected reference descriptions and prompt alias
s=s.replace('''const prompt=`Cinematic film still, ${scene.visual_prompt}. ${sceneCharacterPrompt(scene)}. Maintain continuity with every listed character design, expressive action, detailed environment, film lighting, composition. No text, no captions.`;''','''const prompt=`Cinematic film still, ${scene.visual_prompt}. ${sceneCharacterPrompt(scene)}. Reproduce each listed character's described face, hairstyle, clothing, body proportions and colors consistently. Include all selected characters when the scene calls for them. Expressive action, detailed environment, film lighting, composition. No text, no captions.`;''')
# upload image event delegated change listener
insert='''
$("#sceneList").addEventListener("change",async e=>{
  const input=e.target.closest("[data-upload-scene-image]");if(!input||!input.files?.[0])return;
  const file=input.files[0];if(!file.type.startsWith("image/")){toast("Choose an image file.");return;}if(file.size>8*1024*1024){toast("Scene image must be 8 MB or smaller.");return;}
  const idx=Number(input.dataset.uploadSceneImage);const scene=state.activeProject.scenes[idx];scene.generated_image=await fileToDataURL(file);scene.reference_image_path=null;saveLocal();renderSceneList();toast("Your uploaded scene image is ready. Save scenes to sync it to cloud.");
});
'''
s=s.replace('''function renderTimeline(){''',insert+'''function renderTimeline(){''')
# render setup character select whenever character library changes
s=s.replace('''  if(!state.characters.length){grid.innerHTML='<div class="empty-state">Your saved characters will appear here.</div>';return;}''','''  renderProjectCharacterChoices(state.activeProject?.characterIds||[]);
  if(!state.characters.length){grid.innerHTML='<div class="empty-state">Your saved characters will appear here.</div>';return;}''')
# pending project data after cloud sync already unpack p; no more changes
p.write_text(s)
