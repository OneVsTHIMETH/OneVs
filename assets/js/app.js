const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = { characters: [], projects: [], activeProject: null, sourceVideoUrl: null, cloudLoaded: false };
let generatedCharacterFile = null;
let generatedCharacterDataUrl = "";
let editingCharacterId = null;
let analysedStoryCharacters = [];
const aiWorkerSaved = () => (localStorage.getItem("afs_ai_worker_url") || "").replace(/\/$/, "");
async function aiRequest(path, payload={}) {
  const base=aiWorkerSaved();
  if(!base) throw new Error("First add your Cloudflare Worker URL in Studio Settings.");
  const response=await fetch(`${base}${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok||!data.ok) throw new Error(data.error||`AI request failed (${response.status}).`);
  return data;
}
const toast = (msg) => { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2600); };
const safe = (v) => String(v ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const loadLocal = () => { try { state.characters=JSON.parse(localStorage.getItem("afs_characters")||"[]"); state.projects=JSON.parse(localStorage.getItem("afs_projects")||"[]"); } catch {} };
const packProjectText = (story, direction, characterIds=[], aliases={}, characterMappings=[]) => `[[STORY]]\n${String(story||"").trim()}\n\n[[OVERALL_DIRECTION]]\n${String(direction||"").trim()}\n\n[[CHARACTER_SETTINGS]]\n${JSON.stringify({characterIds,aliases,characterMappings})}`;
const unpackProjectText = (value) => {
  const raw=String(value||"");
  const marker="\n\n[[OVERALL_DIRECTION]]\n";
  const start=raw.indexOf("[[STORY]]\n");
  if(start===0 && raw.includes(marker)) {
    const directionStart=raw.indexOf(marker)+marker.length;
    const settingsMarker="\n\n[[CHARACTER_SETTINGS]]\n";
    const settingsAt=raw.indexOf(settingsMarker,directionStart);
    let settings={characterIds:[],aliases:{}};
    if(settingsAt>=0){try{settings=JSON.parse(raw.slice(settingsAt+settingsMarker.length));}catch{} }
    return {prompt:raw.slice("[[STORY]]\n".length,raw.indexOf(marker)).trim(),direction:(settingsAt>=0?raw.slice(directionStart,settingsAt):raw.slice(directionStart)).trim(),characterIds:settings.characterIds||[],aliases:settings.aliases||{},characterMappings:settings.characterMappings||[]};
  }
  return {prompt:raw.replace(/^\[\[STORY\]\]\n/,"").trim(),direction:"",characterIds:[],aliases:{},characterMappings:[]};
};
const saveLocal = () => { localStorage.setItem("afs_characters",JSON.stringify(state.characters)); localStorage.setItem("afs_projects",JSON.stringify(state.projects)); };
function showPage(name) {
  $$(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${name}`));
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  const titles={dashboard:"Overview",characters:"Character Studio",creator:"Video Creator",editor:"Film Editor",background:"Background Editor",projects:"My Projects",settings:"Studio Settings"};
  $("#pageTitle").textContent=titles[name]||"Studio";
  if(name==="characters") renderCharacters();
  if(name==="projects"||name==="dashboard") renderProjects();
  if(name==="editor") renderTimeline();
}
document.addEventListener("click",e=>{
  const nav=e.target.closest("[data-page]");
  if(nav){if(nav.dataset.page==="creator"&&!nav.classList.contains("nav-item")&&!nav.closest("#allProjects,#recentProjects")){state.activeProject=null;$("#projectForm").reset();analysedStoryCharacters=[];renderStoryCharacterMap([]);$("#characterAnalysisStatus").textContent="Write your Story first, then analyse it to find character names.";$("#sceneBuilder").hidden=true;}showPage(nav.dataset.page); if(nav.classList.contains("nav-item")) e.preventDefault();}
});
function requireCloudAuth(){
  if(!StudioDB.connected){toast("Connect Supabase in Studio Settings first.");showPage("settings");return false;}
  if(!StudioDB.signedIn){toast("Sign in to your Supabase account first.");showPage("settings");return false;}
  return true;
}
function updateAuthUI(){
  const signed=StudioDB.signedIn;
  $("#authStatus").textContent=signed?`Signed in as ${StudioDB.user.email}`:"Connect Supabase, then sign in or create an account.";
  $("#signOutBtn").hidden=!signed; $("#signInBtn").hidden=signed; $("#signUpBtn").hidden=signed;
  $("#connectionText").textContent=signed?"Cloud account connected":StudioDB.connected?"Supabase connected":"Local preview";
}
async function syncCloud(){
  if(!StudioDB.signedIn)return;
  try{
    const [chars,projs]=await Promise.all([
      StudioDB.client.from("characters").select("*").order("created_at",{ascending:false}),
      StudioDB.client.from("projects").select("*").order("created_at",{ascending:false})
    ]);
    if(chars.error)throw chars.error;if(projs.error)throw projs.error;
    state.characters=await Promise.all((chars.data||[]).map(async c=>({...c,image:c.reference_image_path?await StudioDB.signedUrl("character-references",c.reference_image_path):"",style:c.style||"3D animated"})));
    const projects=projs.data||[];
    const scenesResult=projects.length?await StudioDB.client.from("scenes").select("*").in("project_id",projects.map(p=>p.id)).order("scene_order"):{data:[],error:null};
    if(scenesResult.error)throw scenesResult.error;
    state.projects=await Promise.all(projects.map(async p=>({...p,...unpackProjectText(p.story_prompt),duration:p.target_duration_seconds,ratio:p.aspect_ratio,scenes:await Promise.all((scenesResult.data||[]).filter(s=>s.project_id===p.id).map(async s=>({id:s.id,character_id:s.character_id,character_ids:Array.isArray(s.character_ids)&&s.character_ids.length?s.character_ids:(s.character_id?[s.character_id]:[]),duration:s.duration_seconds,visual_prompt:s.visual_prompt,dialogue:(()=>{try{const d=JSON.parse(s.dialogue_text);return d.__dialogueLines?d.__dialogueLines.map(x=>`${x.speaker}: ${x.text}`).join("\n"):s.dialogue_text;}catch{return s.dialogue_text;}})(),dialogue_lines:await Promise.all((()=>{try{const d=JSON.parse(s.dialogue_text);return d.__dialogueLines||parseDialogueLines(s.dialogue_text);}catch{return parseDialogueLines(s.dialogue_text);}})().map(async line=>({...line,audio:line.audio_path?await StudioDB.signedUrl("project-assets",line.audio_path):""}))),voice_language:s.voice_language,sound_prompt:s.sound_prompt,reference_image_path:s.reference_image_path,generated_image:s.reference_image_path?await StudioDB.signedUrl("project-assets",s.reference_image_path):""})))})));
    state.cloudLoaded=true;saveLocal();renderCharacters();renderProjects();toast("Your cloud workspace is synced.");
  }catch(err){toast("Cloud sync failed: "+(err.message||"Check table policies."));}
}
function renderStoryCharacterMap(characters=analysedStoryCharacters,mappings=[]){const root=$("#storyCharacterMap");if(!root)return;analysedStoryCharacters=characters||[];if(!analysedStoryCharacters.length){root.innerHTML='<p class="helper">No named characters were found. You can continue and let AI invent characters from the story.</p>';return;}root.innerHTML=analysedStoryCharacters.map((ch,i)=>{const old=mappings.find(m=>String(m.storyName).toLowerCase()===ch.name.toLowerCase());const selected=old?.characterId||"ai";return `<div class="story-character-row" data-story-character-row="${i}"><div class="story-character-name"><b>${safe(ch.name)}</b><small>${safe(ch.description||"Character found in your story")}</small></div><label>Use character<select data-story-character-select="${i}"><option value="ai" ${selected==="ai"?"selected":""}>AI creates this character</option>${state.characters.map(c=>`<option value="${safe(c.id)}" ${selected===c.id?"selected":""}>${safe(c.name)} · Studio character</option>`).join("")}</select></label></div>`;}).join("");}
function readStoryCharacterMappings(){return $$("[data-story-character-row]").map((row,i)=>({storyName:analysedStoryCharacters[i]?.name||"",characterId:row.querySelector("select")?.value||"ai",description:analysedStoryCharacters[i]?.description||""})).filter(x=>x.storyName);}
function renderCharacters(){
  const grid=$("#characterGrid");
  if(!state.characters.length){grid.innerHTML='<div class="empty-state">Your saved characters will appear here.</div>';return;}
  grid.innerHTML=state.characters.map(c=>`<article class="character-card"><div class="character-thumb">${c.image?`<img src="${c.image}" alt="">`:"♙"}</div><div class="character-info"><b>${safe(c.name)}</b><p>${safe(c.style)} · ${safe(c.description||"No description added")}</p><button class="text-button" data-view-character="${safe(c.id)}">View details</button><button class="text-button" data-edit-character="${safe(c.id)}">Edit character</button><button class="text-button" data-use-character="${safe(c.id)}">Use in a project →</button><button class="text-button" data-turnaround="${safe(c.id)}">360° turnaround prompt ↓</button><button class="text-button danger-text" data-delete-character="${safe(c.id)}">Delete character</button></div></article>`).join("");
  if(analysedStoryCharacters.length){const current=readStoryCharacterMappings();renderStoryCharacterMap(analysedStoryCharacters,current);}
}
function renderProjects(){
  const html=state.projects.length?state.projects.map(p=>`<article class="project-card"><div class="project-cover">▶</div><div class="project-info"><b>${safe(p.title)}</b><p>${p.scenes?.length||0} scenes · ${Math.round((p.duration||p.target_duration_seconds||300)/60*10)/10} min · ${safe(p.language||"")}</p><button class="text-button" data-open-project="${safe(p.id)}">Open project →</button><button class="text-button danger-text" data-delete-project="${safe(p.id)}">Delete project</button></div></article>`).join(""):'<div class="empty-state">No projects yet. Start by creating your first video.</div>';
  $("#allProjects").innerHTML=html; $("#recentProjects").innerHTML=html;
}
$("#newCharacterBtn").addEventListener("click",()=>{editingCharacterId=null;$("#characterCreateForm").reset();$("#characterFormTitle").textContent="Create a character";$("#saveCharacterButton").textContent="Save character";$("#characterForm").hidden=false;$("#characterName").focus();});
$("#closeCharacterForm").addEventListener("click",()=>$("#characterForm").hidden=true);
$("#cancelCharacter").addEventListener("click",()=>$("#characterForm").hidden=true);
$("#characterCreateForm").addEventListener("submit",async e=>{
 e.preventDefault();const file=$("#characterImage").files[0]||generatedCharacterFile;const name=$("#characterName").value.trim();const existing=editingCharacterId?state.characters.find(c=>c.id===editingCharacterId):null;
 if(state.characters.some(c=>c.id!==editingCharacterId&&c.name.toLowerCase()===name.toLowerCase())){toast("Please choose a unique character name.");return;}
 if(existing){const updated={...existing,name,style:$("#characterStyle").value,description:$("#characterDescription").value.trim()};try{if(StudioDB.connected&&!StudioDB.signedIn){toast("Sign in before editing cloud characters.");return;}if(StudioDB.signedIn){let imagePath=existing.reference_image_path||null;if(file){if(file.size>5*1024*1024){toast("Character image limit is 5 MB.");return;}imagePath=await StudioDB.uploadPrivate("character-references",`characters/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`,file);}const {error}=await StudioDB.client.from("characters").update({name:updated.name,style:updated.style,description:updated.description,reference_image_path:imagePath}).eq("id",existing.id);if(error)throw error;updated.reference_image_path=imagePath;updated.image=imagePath?await StudioDB.signedUrl("character-references",imagePath):"";}else if(file){if(file.size>5*1024*1024){toast("Character image limit is 5 MB.");return;}updated.image=await fileToDataURL(file);}state.characters=state.characters.map(c=>c.id===existing.id?updated:c);saveLocal();renderCharacters();$("#characterCreateForm").reset();$("#characterForm").hidden=true;generatedCharacterFile=null;generatedCharacterDataUrl="";$("#generatedCharacterPreview").hidden=true;editingCharacterId=null;toast("Character updated.");}catch(err){toast("Could not update character: "+err.message);}return;}
 const character={id:crypto.randomUUID(),name,style:$("#characterStyle").value,description:$("#characterDescription").value.trim(),image:"",created_at:new Date().toISOString()};
 if(StudioDB.connected&&StudioDB.signedIn){try{let imagePath=null;if(file)imagePath=await StudioDB.uploadPrivate("character-references",`characters/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`,file);const {data,error}=await StudioDB.client.from("characters").insert({user_id:StudioDB.user.id,name:character.name,style:character.style,description:character.description,reference_image_path:imagePath}).select().single();if(error)throw error;character.id=data.id;character.reference_image_path=imagePath;character.image=imagePath?await StudioDB.signedUrl("character-references",imagePath):"";}catch(err){toast("Cloud save failed: "+(err.message||"Check setup"));return;}}else if(StudioDB.connected){toast("Sign in before saving cloud characters.");return;}else if(file){if(file.size>5*1024*1024){toast("Local preview image limit is 5 MB.");return;}character.image=await fileToDataURL(file);}
 state.characters.unshift(character);try{saveLocal();}catch(err){toast("Character saved for this session, but browser storage is full. Connect Supabase to keep the image.");}renderCharacters();$("#characterCreateForm").reset();generatedCharacterFile=null;generatedCharacterDataUrl="";$("#generatedCharacterPreview").hidden=true;$("#characterForm").hidden=true;toast(StudioDB.signedIn?"Character saved to your cloud library.":"Character saved in this browser.");
});
function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}
async function dataUrlToFile(dataUrl,name){const blob=await (await fetch(dataUrl)).blob();return new File([blob],name,{type:blob.type||"image/jpeg"});}
$("#projectForm").addEventListener("submit",async e=>{e.preventDefault();const characterMappings=readStoryCharacterMappings();const chosenIds=[...new Set(characterMappings.map(m=>m.characterId).filter(id=>id&&id!=="ai"))];const aliases=Object.fromEntries(characterMappings.filter(m=>m.characterId&&m.characterId!=="ai").map(m=>[m.storyName,state.characters.find(c=>c.id===m.characterId)?.name||""]).filter(([,v])=>v));const p={id:crypto.randomUUID(),title:$("#projectTitle").value.trim(),prompt:$("#projectPrompt").value.trim(),direction:$("#projectDirection").value.trim(),characterIds:chosenIds,aliases,characterMappings,language:$("#projectLanguage").value,ratio:$("#projectRatio").value,duration:Number($("#projectDuration").value),scenes:[],created_at:new Date().toISOString()};if(StudioDB.connected){if(!requireCloudAuth())return;try{const {data,error}=await StudioDB.client.from("projects").insert({user_id:StudioDB.user.id,title:p.title,story_prompt:packProjectText(p.prompt,p.direction,p.characterIds,p.aliases,p.characterMappings),language:p.language,aspect_ratio:p.ratio,target_duration_seconds:p.duration}).select().single();if(error)throw error;p.id=data.id;}catch(err){toast("Cloud save failed: "+err.message);return;}}state.projects.unshift(p);state.activeProject=p;saveLocal();$("#sceneBuilder").hidden=false;renderSceneList();renderProjects();toast("Project created. Generate your storyboard scenes.");$("#sceneBuilder").scrollIntoView({behavior:"smooth"});});
function renderSceneList(){
  const p=state.activeProject;if(!p)return;
  $("#sceneList").innerHTML=(p.scenes||[]).map((s,i)=>sceneMarkup(s,i)).join("");
}
function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function detectCharactersInText(text){
  const source=String(text||"");const p=state.activeProject;
  return state.characters.filter(c=>{
    if(p?.characterIds?.length&&!p.characterIds.includes(c.id))return false;
    const names=[c.name,...Object.entries(p?.aliases||{}).filter(([,target])=>String(target).toLowerCase()===String(c.name).toLowerCase()).map(([alias])=>alias),...(p?.characterMappings||[]).filter(m=>m.characterId===c.id).map(m=>m.storyName)];
    return names.some(name=>{name=String(name||"").trim();if(!name)return false;try{return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}_])`,"iu").test(source);}catch{return source.toLocaleLowerCase().includes(name.toLocaleLowerCase());}});
  });
}
function sceneCharacterIds(scene){
  const text=[scene.visual_prompt,scene.dialogue,...(scene.characters||[]).map(c=>c.name||c.speaker),...(scene.dialogue_lines||[]).map(c=>c.speaker)].filter(Boolean).join("\n");
  const detected=detectCharactersInText(text).map(c=>c.id);
  const saved=Array.isArray(scene.character_ids)?scene.character_ids:(scene.character_id?[scene.character_id]:[]);
  return [...new Set([...saved,...detected])].filter(id=>state.characters.some(c=>c.id===id));
}
function sceneCharacterPrompt(scene){
  const ids=sceneCharacterIds(scene);
  const selected=ids.map(id=>state.characters.find(c=>c.id===id)).filter(Boolean);
  if(!selected.length)return "No saved character name was detected. Create suitable characters that fit the scene.";
  return "Use these exact saved character identities in this scene; include every listed character and do not add unrelated main characters: "+selected.map(c=>`${c.name} (${c.style||"3D animated"}; ${c.description||"preserve the saved character identity and appearance"})`).join("; ");
}
function parseDialogueLines(text){return String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{const m=line.match(/^([^:：-]{1,50})\s*[:：-]\s*(.+)$/);return m?{speaker:m[1].trim(),action:"",text:m[2].trim(),sound_prompt:"",voice_style:"Warm, natural voice",language:"en"}:{speaker:"Narrator",action:"",text:line,sound_prompt:"",voice_style:"Warm, smooth narration",language:"en"};});}
function dialogueLineMarkup(s,i){const lines=Array.isArray(s.dialogue_lines)&&s.dialogue_lines.length?s.dialogue_lines:parseDialogueLines(s.dialogue);return lines.map((line,j)=>{const mapped=(state.activeProject?.characterMappings||[]).find(m=>m.storyName?.toLowerCase()===String(line.speaker||"").toLowerCase());const studio=mapped?.characterId&&mapped.characterId!=="ai"?state.characters.find(c=>c.id===mapped.characterId):state.characters.find(c=>c.name?.toLowerCase()===String(line.speaker||"").toLowerCase());const source=studio?`Studio character: ${studio.name}`:"AI character";return `<div class="dialogue-line" data-dialogue-line="${j}" data-line-id="${safe(line.id||j)}"><div class="dialogue-line-head"><b>${safe(line.speaker||`Character ${j+1}`)} <small class="soft-tag">${source}</small></b><button type="button" class="text-button danger-text" data-delete-dialogue="${j}">Delete</button></div><div class="scene-fields"><label>Character name<input data-line-speaker value="${safe(line.speaker||"")}" placeholder="Maya / Robot"></label><label>Voice language<select data-line-language><option value="si" ${(line.language||s.voice_language)==="si"?"selected":""}>Sinhala</option><option value="en" ${(line.language||s.voice_language)==="en"?"selected":""}>English</option></select></label><label class="wide">Character appearance<input data-line-appearance value="${safe(line.appearance||"")}" placeholder="Appearance / identity details"></label><label class="wide">Acting / Action<textarea data-line-action rows="2" placeholder="What this character does in this scene...">${safe(line.action||"")}</textarea></label><label class="wide">Dialogue<textarea data-line-text rows="2" placeholder="Exact spoken words. Leave empty if silent.">${safe(line.text||"")}</textarea></label><label class="wide">Character sound / SFX<input data-line-sound value="${safe(line.sound_prompt||"")}" placeholder="Robot electronic sound, footsteps, breathing..."></label><label class="wide">Voice style<input data-line-style value="${safe(line.voice_style||"Girl voice, warm, smooth")}" placeholder="Girl voice, warm, smooth / deep male robot voice..."></label><div class="ai-action-row"><button type="button" class="secondary-button" data-generate-voice="${j}" ${line.text?"":"disabled"}>✦ Generate voice</button><button type="button" class="secondary-button" data-preview-line="${j}" ${line.text?"":"disabled"}>▶ Browser preview</button>${line.audio?`<button type="button" class="text-button danger-text" data-delete-voice="${j}">Delete generated voice</button>`:""}</div>${line.audio?`<audio class="generated-voice-audio" controls src="${line.audio}"></audio>`:""}</div></div>`;}).join("")||'<p class="helper">No character rows yet. Add every character in this scene, including silent characters.</p>';}
function sceneMarkup(s,i){return `<div class="scene-card" data-scene="${i}"><div class="scene-top"><b>Scene ${String(i+1).padStart(2,"0")}</b><button class="scene-remove" data-remove-scene="${i}">Remove</button></div><div class="scene-fields"><label class="wide">Characters (multiple)<select data-field="character_ids" multiple size="${Math.max(2,Math.min(5,state.characters.length||2))}">${state.characters.map(c=>`<option value="${safe(c.id)}" ${sceneCharacterIds(s).includes(c.id)?"selected":""}>${safe(c.name)}</option>`).join("")}</select><small class="helper">Names in the story (including your mapping) are detected automatically. You can also select more than one character.</small><small class="detected-character-note" data-detected-characters>${sceneCharacterIds(s).length?`Detected/selected: ${sceneCharacterIds(s).map(id=>safe(state.characters.find(c=>c.id===id)?.name||"")).join(", ")}`:"No saved character names detected yet."}</small></label><label>Duration (seconds)<input data-field="duration" type="number" min="1" max="3600" value="${s.duration||8}"></label><label class="wide">Visual prompt<textarea data-field="visual_prompt" rows="2" placeholder="Describe the scene, action, camera and environment...">${safe(s.visual_prompt||"")}</textarea></label><textarea data-field="dialogue" hidden>${safe(s.dialogue||"")}</textarea><label>Default voice language<select data-field="voice_language"><option value="si" ${s.voice_language==="si"?"selected":""}>Sinhala</option><option value="en" ${s.voice_language==="en"?"selected":""}>English</option></select></label><label>Background sound<input data-field="sound_prompt" value="${safe(s.sound_prompt||"")}" placeholder="Wind, birds, music..."></label></div><h4>Character actions, dialogue & sounds</h4><p class="helper">Each row represents one character in this scene. Add an action even when the character is silent.</p>${dialogueLineMarkup(s,i)}<div class="ai-action-row"><button type="button" class="secondary-button" data-add-dialogue="${i}">＋ Add character dialogue</button><button type="button" class="secondary-button" data-generate-scene-image="${i}">✦ Generate / replace image</button><label class="secondary-button upload-scene-label">↑ Upload image<input type="file" accept="image/*" data-upload-scene-image="${i}" hidden></label>${s.generated_image?`<button type="button" class="text-button danger-text" data-remove-scene-image="${i}">Remove image</button>`:""}</div>${s.generated_image?`<img class="ai-scene-image" src="${s.generated_image}" alt="Scene ${i+1} image"><small class="helper">Text-to-image generation may not reproduce a reference character exactly. Upload a finished scene image when exact matching is essential.</small>`:""}</div>`;}
$("#addSceneBtn").addEventListener("click",()=>{if(!state.activeProject)return;state.activeProject.scenes.push({id:crypto.randomUUID(),character_id:"",character_ids:[],duration:8,voice_language:"si"});renderSceneList();});
$("#sceneList").addEventListener("click",e=>{const b=e.target.closest("[data-remove-scene]");if(b){state.activeProject.scenes.splice(Number(b.dataset.removeScene),1);renderSceneList();}});
$("#sceneList").addEventListener("input",e=>{
  const card=e.target.closest(".scene-card");if(!card||!e.target.matches('[data-field="visual_prompt"],[data-line-text],[data-line-speaker]'))return;
  const dialogue=readDialogueLines(card).map(x=>`${x.speaker}: ${x.text}`).join("\n");
  const text=[card.querySelector('[data-field="visual_prompt"]')?.value,...readDialogueLines(card).map(x=>x.speaker),dialogue].join("\n");
  const detected=detectCharactersInText(text);const select=card.querySelector('[data-field="character_ids"]');
  const detectedIds=new Set(detected.map(c=>c.id));
  [...select.options].forEach(o=>{if(detectedIds.has(o.value))o.selected=true;});
  const chosen=[...select.selectedOptions].map(o=>o.value);
  const note=card.querySelector('[data-detected-characters]');
  if(note)note.textContent=chosen.length?`Detected/selected: ${chosen.map(id=>state.characters.find(c=>c.id===id)?.name).filter(Boolean).join(", ")}`:"No saved character names detected yet.";
});
$("#sceneList").addEventListener("change",e=>{
  if(!e.target.matches('[data-field="character_ids"]'))return;
  const card=e.target.closest(".scene-card"),note=card?.querySelector('[data-detected-characters]');
  const chosen=[...e.target.selectedOptions].map(o=>o.value).map(id=>state.characters.find(c=>c.id===id)?.name).filter(Boolean);
  if(note)note.textContent=chosen.length?`Detected/selected: ${chosen.join(", ")}`:"No saved character names detected yet.";
});
$("#saveScenesBtn").addEventListener("click",async()=>{
  if(!state.activeProject)return;
  if(analysedStoryCharacters.length){state.activeProject.characterMappings=readStoryCharacterMappings();state.activeProject.characterIds=[...new Set(state.activeProject.characterMappings.map(m=>m.characterId).filter(id=>id&&id!=="ai"))];state.activeProject.aliases=Object.fromEntries(state.activeProject.characterMappings.filter(m=>m.characterId&&m.characterId!=="ai").map(m=>[m.storyName,state.characters.find(c=>c.id===m.characterId)?.name||""]).filter(([,v])=>v));}
  const cards=$$(".scene-card");const scenes=cards.map((card,i)=>collectSceneCard(card,i));
  if(StudioDB.connected && !requireCloudAuth())return;
  if(StudioDB.signedIn){
    try{
      const project=state.activeProject;const {error:projectError}=await StudioDB.client.from("projects").update({title:project.title,story_prompt:packProjectText(project.prompt,project.direction,project.characterIds||[],project.aliases||{},project.characterMappings||[]),language:project.language,aspect_ratio:project.ratio,target_duration_seconds:project.duration}).eq("id",project.id);if(projectError)throw projectError;
      for(let i=0;i<scenes.length;i++){
        const s=scenes[i];let refPath=null;
        if(s.generated_image?.startsWith("data:")){const generatedFile=await dataUrlToFile(s.generated_image,`scene-${i+1}.jpg`);refPath=await StudioDB.uploadPrivate("project-assets",`projects/${state.activeProject.id}/scene-${i+1}-${crypto.randomUUID()}`,generatedFile);}else if(s.generated_image?.startsWith("http")){refPath=s.reference_image_path||null;}
        for(let j=0;j<(s.dialogue_lines||[]).length;j++){const line=s.dialogue_lines[j];if(line.audio?.startsWith("data:")){const audioFile=await dataUrlToFile(line.audio,`scene-${i+1}-line-${j+1}.mp3`);line.audio_path=await StudioDB.uploadPrivate("project-assets",`projects/${state.activeProject.id}/scene-${i+1}-line-${j+1}-${crypto.randomUUID()}.mp3`,audioFile);}}const dialogueData=(s.dialogue_lines||[]).map(({audio,...line})=>line);const row={project_id:state.activeProject.id,character_id:s.character_id||null,character_ids:s.character_ids||[],scene_order:i+1,duration_seconds:s.duration,visual_prompt:s.visual_prompt,dialogue_text:JSON.stringify({__dialogueLines:dialogueData}),voice_language:s.voice_language,sound_prompt:s.sound_prompt,reference_image_path:refPath,};
        const {error}=await StudioDB.client.from("scenes").upsert(row,{onConflict:"project_id,scene_order"});if(error)throw error;
      }
      const {error:delErr}=await StudioDB.client.from("scenes").delete().eq("project_id",state.activeProject.id).gt("scene_order",scenes.length);if(delErr)throw delErr;
    }catch(err){toast("Scene cloud save failed: "+err.message);return;}
  }
  state.activeProject.scenes=scenes;try{saveLocal();}catch{toast("Scenes saved for this session, but local storage is full. Use Supabase cloud storage for generated images.");}renderSceneList();renderTimeline();toast("Scenes saved.");
});

$("#sceneList").addEventListener("change",async e=>{
  const input=e.target.closest("[data-upload-scene-image]");if(!input||!input.files?.[0])return;
  const file=input.files[0];if(!file.type.startsWith("image/")){toast("Choose an image file.");return;}if(file.size>8*1024*1024){toast("Scene image must be 8 MB or smaller.");return;}
  const idx=Number(input.dataset.uploadSceneImage);const scene=state.activeProject.scenes[idx];scene.generated_image=await fileToDataURL(file);scene.reference_image_path=null;saveLocal();renderSceneList();toast("Your uploaded scene image is ready. Save scenes to sync it to cloud.");
});
function renderTimeline(){
  const p=state.activeProject||state.projects[0];if(!p||!p.scenes?.length){$("#timeline").innerHTML='<div class="empty-state">Create a project and add scenes to see your timeline.</div>';return;}
  const blocks=p.scenes.map((s,i)=>`<div class="timeline-block" title="${safe(s.visual_prompt)}">${i+1}</div>`).join("");
  const voices=p.scenes.map((s,i)=>`<div class="timeline-block voice" title="${safe(s.dialogue)}">${s.dialogue?"Voice "+(i+1):"—"}</div>`).join("");
  $("#timeline").innerHTML=`<div class="timeline-row"><span class="timeline-label">Video</span><div class="timeline-track">${blocks}</div></div><div class="timeline-row"><span class="timeline-label">Dialogue</span><div class="timeline-track">${voices}</div></div><div class="timeline-row"><span class="timeline-label">Music / SFX</span><div class="timeline-track">${p.scenes.map((s,i)=>`<div class="timeline-block music">${s.sound_prompt?"SFX "+(i+1):"—"}</div>`).join("")}</div></div>`;
}
$("#refreshTimeline").addEventListener("click",renderTimeline);
$("#sourceVideo").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;if(state.sourceVideoUrl)URL.revokeObjectURL(state.sourceVideoUrl);state.sourceVideoUrl=URL.createObjectURL(f);$("#sourcePreview").src=state.sourceVideoUrl;$("#sourcePreview").hidden=false;});
$("#processBackgroundBtn").addEventListener("click",()=>{if(!$("#sourceVideo").files[0]){toast("Upload an original video first.");return;}if($('input[name="bgMode"]:checked').value==="text"&&!$("#backgroundPrompt").value.trim()){toast("Enter a background prompt.");return;}$("#backgroundStatus").textContent="Upload selected. The next backend step will create a private upload and enqueue segmentation.";toast("Background edit request is ready for backend integration.");});
// Free Cloudflare Workers AI connection and generation tools.
const aiUrlInput=$("#aiWorkerUrl");
if(aiUrlInput){aiUrlInput.value=aiWorkerSaved();if(aiWorkerSaved())$("#aiWorkerStatus").textContent="Worker URL saved. Test the connection before generating.";}
$("#saveAiWorker").addEventListener("click",()=>{
  const value=$("#aiWorkerUrl").value.trim().replace(/\/$/,"");
  if(!/^https:\/\//i.test(value)){ $("#aiWorkerStatus").textContent="Enter a valid HTTPS Worker URL.";return; }
  localStorage.setItem("afs_ai_worker_url",value);$("#aiWorkerStatus").textContent="Worker URL saved. Test the connection.";toast("Free AI Worker URL saved.");
});
$("#testAiWorker").addEventListener("click",async()=>{
  const value=$("#aiWorkerUrl").value.trim().replace(/\/$/,"");
  if(!value){$("#aiWorkerStatus").textContent="Enter and save your Worker URL first.";return;}
  try{const r=await fetch(`${value}/api/health`);const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"Worker health check failed");localStorage.setItem("afs_ai_worker_url",value);$("#aiWorkerStatus").textContent="Connected: storyboards, scene artwork and English AI voice generation are available. Motion-video generation is not included.";toast("Cloud AI connection successful.");}
  catch(err){$("#aiWorkerStatus").textContent=`Connection failed: ${err.message}. Check Worker URL and ALLOWED_ORIGIN.`;}
});
$("#projectPrompt").addEventListener("input",()=>{if(analysedStoryCharacters.length){analysedStoryCharacters=[];renderStoryCharacterMap([]);$("#characterAnalysisStatus").textContent="Story changed. Click Analyse Story again to refresh its character list.";}});
$("#analyzeStoryBtn").addEventListener("click",async()=>{const story=$("#projectPrompt").value.trim();if(!story){toast("Write the story first, then analyse it.");return;}const status=$("#characterAnalysisStatus"),button=$("#analyzeStoryBtn");button.disabled=true;button.textContent="Analysing story…";status.textContent="AI is finding every named character in your story.";try{const result=await aiRequest("/api/analyze-story",{story,language:$("#projectLanguage").value});renderStoryCharacterMap(result.characters||[]);status.textContent=`Found ${result.characters?.length||0} story characters. Choose a saved Studio character for each name, or leave AI creates this character.`;}catch(err){status.textContent=err.message;toast("Story analysis failed.");}finally{button.disabled=false;button.textContent="✦ Analyse Story & Find Characters";}});
$("#generateStoryBtn").addEventListener("click",async()=>{
  const idea=$("#projectPrompt").value.trim();if(!idea){toast("Write a short story idea in the Story field first.");return;}
  const status=$("#storyAiStatus");status.textContent="AI is writing your story…";status.classList.add("ai-status-working");
  try{const result=await aiRequest("/api/story",{idea,language:$("#projectLanguage").value});$("#projectPrompt").value=result.story;status.textContent="Story generated by Cloudflare Workers AI. Review and edit it before creating the project.";}
  catch(err){status.textContent=err.message;toast("AI story generation failed.");}finally{status.classList.remove("ai-status-working");}
});
$("#aiDraftScenesBtn").addEventListener("click",async()=>{const p=state.activeProject;if(!p){toast("Create or open a project first.");return;}try{$("#aiDraftScenesBtn").disabled=true;$("#aiDraftScenesBtn").textContent="Generating scenes…";p.characterMappings=readStoryCharacterMappings();p.characterIds=[...new Set(p.characterMappings.map(m=>m.characterId).filter(id=>id&&id!=="ai"))];p.aliases=Object.fromEntries(p.characterMappings.filter(m=>m.characterId&&m.characterId!=="ai").map(m=>[m.storyName,state.characters.find(c=>c.id===m.characterId)?.name||""]).filter(([,v])=>v));saveLocal();const assignments=(p.characterMappings||[]).map(m=>{const c=state.characters.find(x=>x.id===m.characterId);return c?`Story character ${m.storyName} MUST use saved Studio identity ${c.name}. Appearance: ${c.style||"3D animated"}; ${c.description||"use saved design"}. Keep the story name ${m.storyName} in the scene.`:`${m.storyName} is an AI-created character; invent a consistent appearance and retain the exact story name.`;}).join("\n");const story=[`STORY:\n${p.prompt||""}`,p.direction?`OVERALL DIRECTION:\n${p.direction}`:"",assignments?`CHARACTER ASSIGNMENTS:\n${assignments}`:""].filter(Boolean).join("\n\n");const result=await aiRequest("/api/storyboard",{story,language:p.language||"si",duration:p.duration||300});const map=new Map((p.characterMappings||[]).map(m=>[m.storyName.toLowerCase(),m]));p.scenes=result.scenes.map((sc,i)=>{let cast=Array.isArray(sc.characters)?sc.characters:[];if(!cast.length&&Array.isArray(sc.dialogue_lines))cast=sc.dialogue_lines.map(d=>({name:d.speaker,action:d.action,dialogue:d.text,sound_prompt:d.sound_prompt,voice_style:d.voice_style}));if(!cast.length&&sc.dialogue)cast=parseDialogueLines(sc.dialogue).map(d=>({name:d.speaker,action:"",dialogue:d.text}));const rows=cast.map(ch=>{const name=String(ch.name||"Character").trim(),m=map.get(name.toLowerCase()),saved=m?.characterId&&m.characterId!=="ai"?state.characters.find(c=>c.id===m.characterId):null;return {id:crypto.randomUUID(),speaker:name,source:saved?"studio":"ai",character_id:saved?.id||null,appearance:ch.appearance||saved?.description||"",action:ch.action||"",text:ch.dialogue||"",sound_prompt:ch.sound_prompt||"",voice_style:ch.voice_style||"Warm, natural voice",language:p.language==="en"?"en":"si"};});const ids=rows.map(x=>x.character_id).filter(Boolean);return {id:crypto.randomUUID(),title:sc.title||`Scene ${i+1}`,duration:sc.duration,character_ids:[...new Set(ids)],character_id:ids[0]||"",characters:rows,visual_prompt:sc.visual_prompt||"",dialogue:rows.filter(x=>x.text).map(x=>`${x.speaker}: ${x.text}`).join("\n"),dialogue_lines:rows,voice_language:p.language==="en"?"en":"si",sound_prompt:sc.sound_prompt||""};});renderSceneList();saveLocal();for(let i=0;i<p.scenes.length;i++){const scene=p.scenes[i];$("#aiDraftScenesBtn").textContent=`Creating artwork ${i+1}/${p.scenes.length}…`;const detail=scene.characters.map(c=>{const saved=c.character_id?state.characters.find(x=>x.id===c.character_id):null;return `${c.speaker}: ${saved?`saved ${saved.name}, ${saved.style}, ${saved.description}`:`AI character ${c.appearance}`}; action: ${c.action}`;}).join(". ");try{const art=await aiRequest("/api/image",{prompt:`Cinematic film still. ${scene.visual_prompt}. Characters and actions: ${detail}. ${sceneCharacterPrompt(scene)}. No words, no captions, no typography.`.slice(0,1950)});scene.generated_image=art.image;renderSceneList();}catch(imageErr){toast(`Storyboard created; image ${i+1} could not be generated: ${imageErr.message}`);if(/limit|quota|neurons|rate/i.test(imageErr.message))break;}}saveLocal();renderSceneList();toast(`Created ${p.scenes.length} scenes with separate character actions and dialogue.`);}catch(err){toast(err.message);}finally{$("#aiDraftScenesBtn").disabled=false;$("#aiDraftScenesBtn").textContent="✦ Generate Story · Scenes + Artwork";}});
$("#generateCharacterImageBtn").addEventListener("click",async()=>{
  const name=$("#characterName").value.trim(),description=$("#characterDescription").value.trim(),style=$("#characterStyle").value;
  if(!name){toast("Enter a character name first.");return;}
  const status=$("#characterAiStatus");status.textContent="Generating character concept image…";status.classList.add("ai-status-working");$("#generateCharacterImageBtn").disabled=true;
  try{
    const prompt=`Full-body character concept art, ${style} style. Character name: ${name}. Character design: ${description||"Create an original memorable character"}. Single character only, neutral standing pose, entire body visible, clear face, clean simple studio background, polished professional character design sheet, consistent clothing and proportions.`;
    const result=await aiRequest("/api/image",{prompt});generatedCharacterDataUrl=result.image;
    const blob=await (await fetch(result.image)).blob();generatedCharacterFile=new File([blob],`${name.replace(/[^a-z0-9-_]/gi,"-")}-ai-character.jpg`,{type:"image/jpeg"});
    $("#generatedCharacterPreview").src=result.image;$("#generatedCharacterPreview").hidden=false;status.textContent="Generated image ready. Save the character to add it to your library.";
  }catch(err){status.textContent=err.message;toast("Character image generation failed.");}finally{$("#generateCharacterImageBtn").disabled=false;status.classList.remove("ai-status-working");}
});
$("#sceneList").addEventListener("click",async e=>{
  const addLine=e.target.closest("[data-add-dialogue]");
  if(addLine){const idx=Number(addLine.dataset.addDialogue),scene=state.activeProject.scenes[idx];scene.dialogue_lines=Array.isArray(scene.dialogue_lines)?scene.dialogue_lines:parseDialogueLines(scene.dialogue);scene.dialogue_lines.push({id:crypto.randomUUID(),speaker:state.characters[0]?.name||"New AI Character",action:"",text:"",sound_prompt:"",voice_style:"Warm, natural voice",language:scene.voice_language||"en"});renderSceneList();return;}
  const delLine=e.target.closest("[data-delete-dialogue]");
  if(delLine){const card=delLine.closest(".scene-card"),idx=Number(card.dataset.scene),scene=state.activeProject.scenes[idx];scene.dialogue_lines=readDialogueLines(card).filter((_,j)=>j!==Number(delLine.dataset.deleteDialogue));scene.dialogue=scene.dialogue_lines.filter(x=>x.text).map(x=>`${x.speaker}: ${x.text}`).join("\n");renderSceneList();return;}
  const previewLine=e.target.closest("[data-preview-line]");
  if(previewLine){const card=previewLine.closest(".scene-card"),line=readDialogueLines(card)[Number(previewLine.dataset.previewLine)];if(line)previewVoice(line);return;}
  const deleteVoice=e.target.closest("[data-delete-voice]");
  if(deleteVoice){const card=deleteVoice.closest(".scene-card"),idx=Number(card.dataset.scene),lineIdx=Number(deleteVoice.dataset.deleteVoice),scene=state.activeProject.scenes[idx];scene.dialogue_lines=readDialogueLines(card);if(scene.dialogue_lines[lineIdx]){delete scene.dialogue_lines[lineIdx].audio;delete scene.dialogue_lines[lineIdx].audio_path;}renderSceneList();saveLocal();toast("Generated voice removed.");return;}
  const generateVoice=e.target.closest("[data-generate-voice]");
  if(generateVoice){const card=generateVoice.closest(".scene-card"),idx=Number(card.dataset.scene),lineIdx=Number(generateVoice.dataset.generateVoice),scene=state.activeProject.scenes[idx],lines=readDialogueLines(card),line=lines[lineIdx];if(!line)return;if(line.language!=="en"){toast("Cloud AI voice generation is currently available for English. Use Browser preview for Sinhala.");return;}generateVoice.disabled=true;generateVoice.textContent="Generating voice…";try{const result=await aiRequest("/api/voice",{text:line.text,language:line.language,voiceStyle:line.voice_style});line.audio=`data:audio/mpeg;base64,${result.audio}`;lines[lineIdx]=line;scene.dialogue_lines=lines;scene.dialogue=lines.filter(x=>x.text).map(x=>`${x.speaker}: ${x.text}`).join("\n");saveLocal();renderSceneList();toast("AI voice generated. Save scenes to sync it to cloud.");}catch(err){toast(err.message);}finally{generateVoice.disabled=false;generateVoice.textContent="✦ Generate voice";}return;}
  const removeImage=e.target.closest("[data-remove-scene-image]");
  if(removeImage){const idx=Number(removeImage.dataset.removeSceneImage);state.activeProject.scenes[idx].generated_image="";state.activeProject.scenes[idx].reference_image_path=null;saveLocal();renderSceneList();toast("Scene image removed.");return;}
  const imageButton=e.target.closest("[data-generate-scene-image]");
  if(imageButton){
    const index=Number(imageButton.dataset.generateSceneImage),scene=state.activeProject?.scenes?.[index];if(!scene)return;
    const card=imageButton.closest(".scene-card"),visual=card.querySelector('[data-field="visual_prompt"]').value,lines=readDialogueLines(card),dialogue=lines.filter(x=>x.text).map(x=>`${x.speaker}: ${x.text}`).join("\n");
    const chosen=[...card.querySelector('[data-field="character_ids"]').selectedOptions].map(o=>o.value);
    scene.visual_prompt=visual;scene.dialogue=dialogue;scene.dialogue_lines=lines;scene.characters=lines.map(x=>({name:x.speaker,action:x.action,dialogue:x.text,sound_prompt:x.sound_prompt}));
    const detected=detectCharactersInText(`${visual}\n${dialogue}\n${lines.map(x=>x.speaker).join(" ")}`).map(c=>c.id);
    scene.character_ids=[...new Set([...chosen,...detected])];scene.character_id=scene.character_ids[0]||"";
    const actions=lines.map(x=>`${x.speaker}: ${x.action}; dialogue ${x.text}; sound ${x.sound_prompt}`).join(". ");
    const prompt=`Cinematic film still, ${scene.visual_prompt}. Character actions: ${actions}. ${sceneCharacterPrompt(scene)}. Reproduce each listed character's described face, hairstyle, clothing, body proportions and colors consistently. Include all selected characters when the scene calls for them. Expressive action, detailed environment, film lighting, composition. No text, no captions.`;
    imageButton.disabled=true;imageButton.textContent="Generating…";
    try{const result=await aiRequest("/api/image",{prompt:prompt.slice(0,1950)});scene.generated_image=result.image;renderSceneList();try{saveLocal();}catch{}toast(`Scene ${index+1} image generated. Save scenes to sync it to Supabase.`);}
    catch(err){toast(err.message);imageButton.disabled=false;imageButton.textContent="✦ Generate scene image";}
    return;
  }
  const speak=e.target.closest("[data-speak-dialogue]");if(speak){const scene=state.activeProject?.scenes?.[Number(speak.dataset.speakDialogue)];if(scene)readSceneDialogueFromCard(speak.closest(".scene-card"),scene);}
});
function readDialogueLines(card){const scene=state.activeProject?.scenes?.[Number(card.dataset.scene)],previous=scene?.dialogue_lines||[];return $$("[data-dialogue-line]",card).map((row,j)=>{const id=row.dataset.lineId||String(j),old=previous.find(x=>String(x.id??"")===id)||previous[j]||{};return {id,speaker:row.querySelector("[data-line-speaker]")?.value.trim()||"Character",appearance:row.querySelector("[data-line-appearance]")?.value.trim()||"",action:row.querySelector("[data-line-action]")?.value.trim()||"",text:row.querySelector("[data-line-text]")?.value.trim()||"",sound_prompt:row.querySelector("[data-line-sound]")?.value.trim()||"",language:row.querySelector("[data-line-language]")?.value||"en",voice_style:row.querySelector("[data-line-style]")?.value||"Warm, smooth",audio:old.audio||"",audio_path:old.audio_path||null};});}
function readSceneDialogueFromCard(card,scene){const lines=readDialogueLines(card);scene.dialogue_lines=lines;scene.dialogue=lines.filter(x=>x.text).map(x=>`${x.speaker}: ${x.text}`).join("\n");const spoken=lines.find(x=>x.text);if(spoken)previewVoice(spoken);}
function previewVoice(line){if(!("speechSynthesis" in window)){toast("This browser does not support voice preview.");return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(line.text);u.lang=line.language==="si"?"si-LK":"en-US";const voices=speechSynthesis.getVoices();const female=/female|woman|girl|zira|samantha|susan|aria|jenny|sara|salli/i;const wantFemale=/girl|female|woman/i.test(line.voice_style||"");const match=voices.find(v=>v.lang.toLowerCase().startsWith(line.language==="si"?"si":"en")&&(!wantFemale||female.test(v.name)))||voices.find(v=>v.lang.toLowerCase().startsWith(line.language==="si"?"si":"en"));if(match)u.voice=match;const style=(line.voice_style||"").toLowerCase();u.pitch=style.includes("deep")||style.includes("male")?0.82:style.includes("girl")||style.includes("female")?1.12:1.0;u.rate=style.includes("slow")?0.86:style.includes("fast")?1.08:0.96;speechSynthesis.speak(u);}
function collectSceneCard(card,index){const get=n=>card.querySelector(`[data-field="${n}"]`);const lines=readDialogueLines(card);const dialogue=lines.filter(x=>x.text).map(x=>`${x.speaker}: ${x.text}`).join("\n");const visual_prompt=get("visual_prompt").value;const selected=[...get("character_ids").selectedOptions].map(o=>o.value);const detected=detectCharactersInText(`${visual_prompt}\n${dialogue}\n${lines.map(x=>x.speaker).join("\n")}`).map(c=>c.id);const character_ids=[...new Set([...selected,...detected])];return {id:state.activeProject.scenes[index]?.id||crypto.randomUUID(),character_ids,character_id:character_ids[0]||null,duration:Number(get("duration").value)||8,visual_prompt,dialogue,dialogue_lines:lines,characters:lines.map(x=>({name:x.speaker,appearance:x.appearance,action:x.action,dialogue:x.text,sound_prompt:x.sound_prompt})),voice_language:get("voice_language").value,sound_prompt:get("sound_prompt").value,generated_image:state.activeProject.scenes[index]?.generated_image||"",reference_image_path:state.activeProject.scenes[index]?.reference_image_path||null};}



$("#characterGrid").addEventListener("click",async e=>{
  const view=e.target.closest("[data-view-character]");
  if(view){const c=state.characters.find(x=>x.id===view.dataset.viewCharacter);if(c){$("#characterDetailsTitle").textContent=c.name;$("#characterDetailsBody").innerHTML=`${c.image?`<img class="character-detail-image" src="${c.image}" alt="">`:""}<p><b>Style:</b> ${safe(c.style)}</p><p>${safe(c.description||"No description saved.")}</p>`;$("#characterDetailsDialog").showModal();}return;}
  const edit=e.target.closest("[data-edit-character]");if(edit){const c=state.characters.find(x=>x.id===edit.dataset.editCharacter);if(!c)return;generatedCharacterFile=null;generatedCharacterDataUrl="";editingCharacterId=c.id;$("#characterFormTitle").textContent="Edit character";$("#saveCharacterButton").textContent="Save changes";$("#characterName").value=c.name||"";$("#characterStyle").value=c.style||"3D animated";$("#characterDescription").value=c.description||"";$("#characterImage").value="";$("#generatedCharacterPreview").hidden=!c.image;if(c.image)$("#generatedCharacterPreview").src=c.image;$("#characterForm").hidden=false;$("#characterForm").scrollIntoView({behavior:"smooth"});return;}
  const del=e.target.closest("[data-delete-character]");
  if(del){
    const c=state.characters.find(x=>x.id===del.dataset.deleteCharacter);if(!c||!confirm(`Delete character "${c.name}"?`))return;
    try{
      if(StudioDB.signedIn){if(c.reference_image_path)await StudioDB.client.storage.from("character-references").remove([c.reference_image_path]);const {error}=await StudioDB.client.from("characters").delete().eq("id",c.id);if(error)throw error;}
      state.characters=state.characters.filter(x=>x.id!==c.id);
      state.projects.forEach(p=>{p.characterMappings=(p.characterMappings||[]).map(m=>m.characterId===c.id?{...m,characterId:"ai"}:m);(p.scenes||[]).forEach(s=>{if(s.character_id===c.id)s.character_id="";s.character_ids=(s.character_ids||[]).filter(id=>id!==c.id);(s.dialogue_lines||[]).forEach(line=>{if(line.character_id===c.id){line.character_id=null;line.source="ai";}});});});
      if(state.activeProject?.scenes)state.activeProject.scenes.forEach(s=>{if(s.character_id===c.id)s.character_id="";s.character_ids=(s.character_ids||[]).filter(id=>id!==c.id);});
      saveLocal();renderCharacters();if(analysedStoryCharacters.length)renderStoryCharacterMap(analysedStoryCharacters,state.activeProject?.characterMappings||[]);toast("Character deleted.");
    }catch(err){toast("Could not delete character: "+err.message);}
  }
});
$("#closeCharacterDetails").addEventListener("click",()=>$("#characterDetailsDialog").close());
async function deleteProjectById(id){
  const p=state.projects.find(x=>x.id===id);if(!p||!confirm(`Delete project "${p.title}" and all its scenes?`))return;
  try{
    if(StudioDB.signedIn){const paths=(p.scenes||[]).map(s=>s.reference_image_path).filter(Boolean);if(paths.length)await StudioDB.client.storage.from("project-assets").remove(paths);const {error}=await StudioDB.client.from("projects").delete().eq("id",id);if(error)throw error;}
    state.projects=state.projects.filter(x=>x.id!==id);if(state.activeProject?.id===id)state.activeProject=null;
    saveLocal();renderProjects();renderTimeline();toast("Project and its scenes deleted.");
  }catch(err){toast("Could not delete project: "+err.message);}
}
["allProjects","recentProjects"].forEach(id=>$("#"+id).addEventListener("click",e=>{const b=e.target.closest("[data-delete-project]");if(b)deleteProjectById(b.dataset.deleteProject);}));

$("#saveSupabase").addEventListener("click",async()=>{
  const url=$("#supabaseUrl").value.trim(),key=$("#supabaseKey").value.trim();
  if(!url||!key){$("#supabaseStatus").textContent="Enter both values.";return;}
  if(!await StudioDB.init(url,key)){ $("#supabaseStatus").textContent="Supabase client could not initialize.";return;}
  localStorage.setItem("afs_supabase_url",url);localStorage.setItem("afs_supabase_key",key);
  $("#supabaseStatus").textContent="Supabase connected. Sign in above to access your private cloud workspace.";updateAuthUI();toast("Supabase client configured.");
});
$("#signInBtn").addEventListener("click",async()=>{
  if(!StudioDB.connected){toast("Configure Supabase first.");return;}
  const {error}=await StudioDB.client.auth.signInWithPassword({email:$("#authEmail").value.trim(),password:$("#authPassword").value});
  if(error){$("#authStatus").textContent=error.message;return;}await syncCloud();updateAuthUI();
});
$("#signUpBtn").addEventListener("click",async()=>{
  if(!StudioDB.connected){toast("Configure Supabase first.");return;}
  const {data,error}=await StudioDB.client.auth.signUp({email:$("#authEmail").value.trim(),password:$("#authPassword").value});
  if(error){$("#authStatus").textContent=error.message;return;}
  $("#authStatus").textContent=data.session?"Account created and signed in.":"Account created. Check your email to confirm, then sign in.";
  if(data.session){await syncCloud();updateAuthUI();}
});
$("#signOutBtn").addEventListener("click",async()=>{const {error}=await StudioDB.client.auth.signOut();if(error){toast(error.message);return;}state.characters=[];state.projects=[];state.activeProject=null;saveLocal();renderCharacters();renderProjects();updateAuthUI();toast("Signed out.");});
window.addEventListener("studio-auth-change",async()=>{updateAuthUI();if(StudioDB.signedIn)await syncCloud();});
(async function init(){
  loadLocal();
  const u=localStorage.getItem("afs_supabase_url"),k=localStorage.getItem("afs_supabase_key");
  if(u&&k){await StudioDB.init(u,k);updateAuthUI();if(StudioDB.signedIn)await syncCloud();}
  else updateAuthUI();
  renderProjects();renderCharacters();
})();

// Production-friendly local storyboard and export helpers.
function downloadBlob(name, content, type="text/plain;charset=utf-8"){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function activeProject(){return state.activeProject||state.projects[0]||null;}
function screenplayText(p){
  if(!p)return "No project selected.";
  const lines=[p.title||"Untitled Film","=".repeat((p.title||"Untitled Film").length),`Language: ${p.language||"si"}`,`Aspect ratio: ${p.ratio||p.aspect_ratio||"16:9"}`,`Target duration: ${p.duration||p.target_duration_seconds||300} seconds`,"","STORY",p.prompt||p.story_prompt||"","","OVERALL DIRECTION",p.direction||"","\nSCREENPLAY / STORYBOARD","----------------------"];
  (p.scenes||[]).forEach((s,i)=>{const chars=sceneCharacterIds(s).map(id=>state.characters.find(c=>c.id===id)?.name).filter(Boolean);lines.push(`\nSCENE ${String(i+1).padStart(2,"0")} · ${s.duration||s.duration_seconds||8}s`,`CHARACTERS: ${chars.join(", ")||"Not assigned"}`,`VISUAL: ${s.visual_prompt||"(No visual prompt)"}`,...(s.dialogue_lines||[]).map(c=>`CHARACTER: ${c.speaker} [${c.source||"AI"}]\n  APPEARANCE: ${c.appearance||""}\n  ACTION: ${c.action||""}\n  DIALOGUE: ${c.text||"(Silent)"}\n  CHARACTER SOUND: ${c.sound_prompt||""}\n  VOICE STYLE: ${c.voice_style||""}`),`DIALOGUE (${s.voice_language||"si"}): ${s.dialogue||"(No dialogue)"}`,`SOUND: ${s.sound_prompt||"(No sound direction)"}`);});
  return lines.join("\n");
}
function exportScript(){const p=activeProject();if(!p){toast("Create or open a project first.");return;}downloadBlob(`${(p.title||"film").replace(/[^a-z0-9-_]+/gi,"-")}-screenplay.txt`,screenplayText(p));}
function exportProject(){const p=activeProject();if(!p){toast("Create or open a project first.");return;}const clean={...p,scenes:(p.scenes||[]).map(({reference_file,...s})=>s)};downloadBlob(`${(p.title||"film").replace(/[^a-z0-9-_]+/gi,"-")}-project.json`,JSON.stringify({project:clean,characters:state.characters.map(({image,...c})=>c),exported_at:new Date().toISOString()},null,2),"application/json");}
["exportScriptBtn","editorExportScript"].forEach(id=>{const el=$("#"+id);if(el)el.addEventListener("click",exportScript);});
["exportProjectBtn","editorExportProject"].forEach(id=>{const el=$("#"+id);if(el)el.addEventListener("click",exportProject);});
const draftBtn=$("#draftScenesBtn");
if(draftBtn)draftBtn.addEventListener("click",()=>{
  const p=state.activeProject;if(!p){toast("Create a project first.");return;}
  const story=(p.prompt||"").trim();if(!story){toast("Add a story in the Story field first.");return;}
  const sentences=story.split(/(?<=[.!?。])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
  const beats=["Opening / establish the world","Introduce the main character","A challenge or conflict appears","The character takes action","Climax and resolution"];
  const source=sentences.length>=2?sentences:beats.map((b,i)=>`${b}: ${story}`);
  const count=Math.min(8,Math.max(3,source.length));
  const chosen=Array.from({length:count},(_,i)=>source[Math.min(source.length-1,Math.floor(i*source.length/count))]);
  p.scenes=chosen.map((line,i)=>{const visual_prompt=`Scene ${i+1}: ${line}. Cinematic composition, expressive character acting, consistent character appearance, detailed environment, deliberate camera movement.`;const character_ids=detectCharactersInText(line).map(c=>c.id);return {id:crypto.randomUUID(),duration:Math.max(1,Math.round((p.duration||300)/count)),character_id:character_ids[0]||"",character_ids,visual_prompt,dialogue:"",voice_language:p.language==="en"?"en":"si",sound_prompt:"Atmospheric score and natural environmental sound."};});
  renderSceneList();saveLocal();toast(`${count} editable storyboard scenes drafted.`);
});
const bgImg=$("#backgroundImage");if(bgImg)bgImg.addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;$("#backgroundImagePreview").src=URL.createObjectURL(f);$("#backgroundImagePreview").hidden=false;});
const sourceInput=$("#sourceVideo");if(sourceInput)sourceInput.addEventListener("change",e=>{const f=e.target.files[0];if(f)$("#sourceVideoInfo").textContent=`Selected: ${f.name} · ${(f.size/1024/1024).toFixed(1)} MB · Local preview only`;});
// Open existing local/cloud projects from the project library.
$("#allProjects").addEventListener("click",e=>{const b=e.target.closest("[data-open-project]");if(!b)return;const p=state.projects.find(x=>x.id===b.dataset.openProject);if(!p)return;state.activeProject=p;$("#projectTitle").value=p.title||"";$("#projectPrompt").value=p.prompt||p.story_prompt||"";$("#projectDirection").value=p.direction||"";$("#projectLanguage").value=p.language||"si";$("#projectRatio").value=p.ratio||p.aspect_ratio||"16:9";$("#projectDuration").value=String(p.duration||p.target_duration_seconds||300);renderStoryCharacterMap((p.characterMappings||[]).map(m=>({name:m.storyName,description:m.description||""})),p.characterMappings||[]);$("#characterAnalysisStatus").textContent=p.characterMappings?.length?"Restored this project’s character assignments.":"No saved story character analysis.";$("#sceneBuilder").hidden=false;renderSceneList();showPage("creator");toast(`Opened ${p.title}.`);});
$("#recentProjects").addEventListener("click",e=>{const b=e.target.closest("[data-open-project]");if(!b)return;const p=state.projects.find(x=>x.id===b.dataset.openProject);if(!p)return;state.activeProject=p;$("#projectTitle").value=p.title||"";$("#projectPrompt").value=p.prompt||p.story_prompt||"";$("#projectDirection").value=p.direction||"";$("#projectLanguage").value=p.language||"si";$("#projectRatio").value=p.ratio||p.aspect_ratio||"16:9";$("#projectDuration").value=String(p.duration||p.target_duration_seconds||300);renderStoryCharacterMap((p.characterMappings||[]).map(m=>({name:m.storyName,description:m.description||""})),p.characterMappings||[]);$("#characterAnalysisStatus").textContent=p.characterMappings?.length?"Restored this project’s character assignments.":"No saved story character analysis.";$("#sceneBuilder").hidden=false;renderSceneList();showPage("creator");toast(`Opened ${p.title}.`);});

// Export a consistent multi-angle character sheet prompt for external image models.
$("#characterGrid").addEventListener("click",e=>{const b=e.target.closest("[data-turnaround]");if(!b)return;const c=state.characters.find(x=>x.id===b.dataset.turnaround);if(!c)return;const prompt=`CHARACTER TURNAROUND SHEET\nName: ${c.name}\nStyle: ${c.style}\nDescription: ${c.description||"Use the supplied reference image as the identity source."}\n\nCreate one clean model-sheet image showing the exact same character in these views: front view, front three-quarter view, left profile, left three-quarter rear, full back view, right three-quarter rear, right profile, right three-quarter front. Keep face, hairstyle, body proportions, clothing, colors and accessories identical in every view. Neutral standing pose, full body visible, consistent scale, orthographic studio presentation, plain light background, evenly spaced views, no labels, no extra characters. Do not redesign the character.\n\nREFERENCE IMAGE: attach the saved character reference when using this prompt.`;downloadBlob(`${c.name.replace(/[^a-z0-9-_]+/gi,"-")}-turnaround-prompt.txt`,prompt);toast("Turnaround prompt exported. Attach the character reference in your image model.");});
$("#characterGrid").addEventListener("click",e=>{const b=e.target.closest("[data-use-character]");if(!b)return;const characterId=b.dataset.useCharacter;const p=state.activeProject;if(p){p.scenes.push({id:crypto.randomUUID(),character_id:characterId,character_ids:[characterId],duration:8,visual_prompt:"Describe this character's action, camera framing and environment.",dialogue:"",voice_language:p.language==="en"?"en":"si",sound_prompt:""});renderSceneList();saveLocal();showPage("creator");toast("Character added to a new scene.");}else{sessionStorage.setItem("afs_pending_character",characterId);showPage("creator");toast("Create a project, then add this character to a scene.");}});
