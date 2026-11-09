const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = { characters: [], projects: [], activeProject: null, sourceVideoUrl: null, cloudLoaded: false };
let generatedCharacterFile = null;
let generatedCharacterDataUrl = "";
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
  if(nav){showPage(nav.dataset.page); if(nav.classList.contains("nav-item")) e.preventDefault();}
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
    state.projects=await Promise.all(projects.map(async p=>({...p,duration:p.target_duration_seconds,ratio:p.aspect_ratio,scenes:await Promise.all((scenesResult.data||[]).filter(s=>s.project_id===p.id).map(async s=>({id:s.id,character_id:s.character_id,duration:s.duration_seconds,visual_prompt:s.visual_prompt,dialogue:s.dialogue_text,voice_language:s.voice_language,sound_prompt:s.sound_prompt,reference_image_path:s.reference_image_path,generated_image:s.reference_image_path?await StudioDB.signedUrl("project-assets",s.reference_image_path):""})))})));
    state.cloudLoaded=true;saveLocal();renderCharacters();renderProjects();toast("Your cloud workspace is synced.");
  }catch(err){toast("Cloud sync failed: "+(err.message||"Check table policies."));}
}
function renderCharacters(){
  const grid=$("#characterGrid");
  if(!state.characters.length){grid.innerHTML='<div class="empty-state">Your saved characters will appear here.</div>';return;}
  grid.innerHTML=state.characters.map(c=>`<article class="character-card"><div class="character-thumb">${c.image?`<img src="${c.image}" alt="">`:"♙"}</div><div class="character-info"><b>${safe(c.name)}</b><p>${safe(c.style)} · ${safe(c.description||"No description added")}</p><button class="text-button" data-use-character="${safe(c.id)}">Use in a project →</button><button class="text-button" data-turnaround="${safe(c.id)}">360° turnaround prompt ↓</button></div></article>`).join("");
}
function renderProjects(){
  const html=state.projects.length?state.projects.map(p=>`<article class="project-card"><div class="project-cover">▶</div><div class="project-info"><b>${safe(p.title)}</b><p>${p.scenes?.length||0} scenes · ${Math.round((p.duration||p.target_duration_seconds||300)/60)} min · ${safe(p.language||"")}</p><button class="text-button" data-open-project="${safe(p.id)}">Open project →</button></div></article>`).join(""):'<div class="empty-state">No projects yet. Start by creating your first video.</div>';
  $("#allProjects").innerHTML=html; $("#recentProjects").innerHTML=html;
}
$("#newCharacterBtn").addEventListener("click",()=>{$("#characterForm").hidden=false;$("#characterName").focus();});
$("#closeCharacterForm").addEventListener("click",()=>$("#characterForm").hidden=true);
$("#cancelCharacter").addEventListener("click",()=>$("#characterForm").hidden=true);
$("#characterCreateForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const file=$("#characterImage").files[0] || generatedCharacterFile; const name=$("#characterName").value.trim();
  if(state.characters.some(c=>c.name.toLowerCase()===name.toLowerCase())){toast("Please choose a unique character name.");return;}
  const character={id:crypto.randomUUID(),name,style:$("#characterStyle").value,description:$("#characterDescription").value.trim(),image:"",created_at:new Date().toISOString()};
  if(StudioDB.connected && StudioDB.signedIn){
    try{
      let imagePath=null;
      if(file) imagePath=await StudioDB.uploadPrivate("character-references",`characters/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`,file);
      const {data,error}=await StudioDB.client.from("characters").insert({user_id:StudioDB.user.id,name:character.name,style:character.style,description:character.description,reference_image_path:imagePath}).select().single();
      if(error)throw error;character.id=data.id;character.reference_image_path=imagePath;character.image=imagePath?await StudioDB.signedUrl("character-references",imagePath):"";
    }catch(err){toast("Cloud save failed: "+(err.message||"Check setup"));return;}
  } else if(StudioDB.connected){toast("Sign in before saving cloud characters.");return;}
  else if(file){if(file.size>5*1024*1024){toast("Local preview image limit is 5 MB.");return;}character.image=await fileToDataURL(file);}
  state.characters.unshift(character);try{saveLocal();}catch(err){toast("Character saved for this session, but browser storage is full. Connect Supabase to keep the image.");}renderCharacters();$("#characterCreateForm").reset();generatedCharacterFile=null;generatedCharacterDataUrl="";$("#generatedCharacterPreview").hidden=true;$("#characterForm").hidden=true;toast(StudioDB.signedIn?"Character saved to your cloud library.":"Character saved in this browser.");
});
function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}
async function dataUrlToFile(dataUrl,name){const blob=await (await fetch(dataUrl)).blob();return new File([blob],name,{type:blob.type||"image/jpeg"});}
$("#projectForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const p={id:crypto.randomUUID(),title:$("#projectTitle").value.trim(),prompt:$("#projectPrompt").value.trim(),language:$("#projectLanguage").value,ratio:$("#projectRatio").value,duration:Number($("#projectDuration").value),scenes:[],created_at:new Date().toISOString()};
  if(StudioDB.connected){
    if(!requireCloudAuth())return;
    try{const {data,error}=await StudioDB.client.from("projects").insert({user_id:StudioDB.user.id,title:p.title,story_prompt:p.prompt,language:p.language,aspect_ratio:p.ratio,target_duration_seconds:p.duration}).select().single();if(error)throw error;p.id=data.id;}
    catch(err){toast("Cloud save failed: "+err.message);return;}
  }
  state.projects.unshift(p);state.activeProject=p;saveLocal();$("#sceneBuilder").hidden=false;renderSceneList();renderProjects();toast("Project created. Add your scenes.");$("#sceneBuilder").scrollIntoView({behavior:"smooth"});
});
function renderSceneList(){
  const p=state.activeProject;if(!p)return;
  $("#sceneList").innerHTML=(p.scenes||[]).map((s,i)=>sceneMarkup(s,i)).join("");
}
function sceneMarkup(s,i){return `<div class="scene-card" data-scene="${i}"><div class="scene-top"><b>Scene ${String(i+1).padStart(2,"0")}</b><button class="scene-remove" data-remove-scene="${i}">Remove</button></div><div class="scene-fields"><label>Character<select data-field="character_id"><option value="">No character</option>${state.characters.map(c=>`<option value="${safe(c.id)}" ${s.character_id===c.id?"selected":""}>${safe(c.name)}</option>`).join("")}</select></label><label>Duration (seconds)<input data-field="duration" type="number" min="2" max="15" value="${s.duration||8}"></label><label class="wide">Visual prompt<textarea data-field="visual_prompt" rows="2" placeholder="Describe the scene, action, camera and environment...">${safe(s.visual_prompt||"")}</textarea></label><label class="wide">Reference image<input data-field="reference_image" type="file" accept="image/*"></label><label class="wide">Dialogue<textarea data-field="dialogue" rows="2" placeholder="Enter Sinhala or English dialogue...">${safe(s.dialogue||"")}</textarea></label><label>Voice language<select data-field="voice_language"><option value="si" ${s.voice_language==="si"?"selected":""}>Sinhala</option><option value="en" ${s.voice_language==="en"?"selected":""}>English</option></select></label><label>Background sound<input data-field="sound_prompt" value="${safe(s.sound_prompt||"")}" placeholder="Wind, birds, music..."></label></div><div class="ai-action-row"><button type="button" class="secondary-button" data-generate-scene-image="${i}">✦ Generate scene image</button><button type="button" class="secondary-button" data-speak-dialogue="${i}">▶ Preview dialogue voice</button></div>${s.generated_image?`<img class="ai-scene-image" src="${s.generated_image}" alt="Generated scene ${i+1}">`:""}</div>`;}
$("#addSceneBtn").addEventListener("click",()=>{if(!state.activeProject)return;state.activeProject.scenes.push({id:crypto.randomUUID(),duration:8,voice_language:"si"});renderSceneList();});
$("#sceneList").addEventListener("click",e=>{const b=e.target.closest("[data-remove-scene]");if(b){state.activeProject.scenes.splice(Number(b.dataset.removeScene),1);renderSceneList();}});
$("#saveScenesBtn").addEventListener("click",async()=>{
  if(!state.activeProject)return;
  const cards=$$(".scene-card");const scenes=[];
  for(let i=0;i<cards.length;i++){
    const card=cards[i],get=n=>card.querySelector(`[data-field="${n}"]`),file=get("reference_image").files[0];
    scenes.push({id:card.dataset.id||crypto.randomUUID(),character_id:get("character_id").value||null,duration:Number(get("duration").value)||8,visual_prompt:get("visual_prompt").value,dialogue:get("dialogue").value,voice_language:get("voice_language").value,sound_prompt:get("sound_prompt").value,reference_file:file,generated_image:state.activeProject.scenes[i]?.generated_image||""});
  }
  if(StudioDB.connected && !requireCloudAuth())return;
  if(StudioDB.signedIn){
    try{
      for(let i=0;i<scenes.length;i++){
        const s=scenes[i];let refPath=null;
        if(s.reference_file)refPath=await StudioDB.uploadPrivate("project-assets",`projects/${state.activeProject.id}/scene-${i+1}-${crypto.randomUUID()}`,s.reference_file);
        else if(s.generated_image?.startsWith("data:")){const generatedFile=await dataUrlToFile(s.generated_image,`scene-${i+1}.jpg`);refPath=await StudioDB.uploadPrivate("project-assets",`projects/${state.activeProject.id}/scene-${i+1}-${crypto.randomUUID()}`,generatedFile);}
        else if(s.generated_image?.startsWith("http")){refPath=s.reference_image_path||null;}
        const row={project_id:state.activeProject.id,character_id:s.character_id||null,scene_order:i+1,duration_seconds:s.duration,visual_prompt:s.visual_prompt,dialogue_text:s.dialogue,voice_language:s.voice_language,sound_prompt:s.sound_prompt,reference_image_path:refPath};
        const {error}=await StudioDB.client.from("scenes").upsert(row,{onConflict:"project_id,scene_order"});if(error)throw error;
      }
      const {error:delErr}=await StudioDB.client.from("scenes").delete().eq("project_id",state.activeProject.id).gt("scene_order",scenes.length);if(delErr)throw delErr;
    }catch(err){toast("Scene cloud save failed: "+err.message);return;}
  }
  state.activeProject.scenes=scenes.map(({reference_file,...s})=>s);try{saveLocal();}catch{toast("Scenes saved for this session, but local storage is full. Use Supabase cloud storage for generated images.");}renderSceneList();renderTimeline();toast("Scenes saved.");
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
  try{const r=await fetch(`${value}/api/health`);const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"Worker health check failed");localStorage.setItem("afs_ai_worker_url",value);$("#aiWorkerStatus").textContent="Connected: Cloudflare Workers AI is responding. Story + image tools are available.";toast("Cloud AI connection successful.");}
  catch(err){$("#aiWorkerStatus").textContent=`Connection failed: ${err.message}. Check Worker URL and ALLOWED_ORIGIN.`;}
});
$("#generateStoryBtn").addEventListener("click",async()=>{
  const idea=$("#projectPrompt").value.trim();if(!idea){toast("Write a short film idea first.");return;}
  const status=$("#storyAiStatus");status.textContent="AI is writing your story…";status.classList.add("ai-status-working");
  try{const result=await aiRequest("/api/story",{idea,language:$("#projectLanguage").value});$("#projectPrompt").value=result.story;status.textContent="Story generated by Cloudflare Workers AI. Review and edit it before creating the project.";}
  catch(err){status.textContent=err.message;toast("AI story generation failed.");}finally{status.classList.remove("ai-status-working");}
});
$("#aiDraftScenesBtn").addEventListener("click",async()=>{
  const p=state.activeProject;if(!p){toast("Create or open a project first.");return;}
  const status=$("#aiWorkerStatus");
  try{
    $("#aiDraftScenesBtn").disabled=true;$("#aiDraftScenesBtn").textContent="Generating…";
    const result=await aiRequest("/api/storyboard",{story:p.prompt||p.story_prompt||"",language:p.language||"si",duration:p.duration||300});
    p.scenes=result.scenes.map((s,i)=>({id:crypto.randomUUID(),duration:s.duration,character_id:"",visual_prompt:s.visual_prompt,dialogue:s.dialogue,voice_language:p.language==="en"?"en":"si",sound_prompt:s.sound_prompt}));
    renderSceneList();saveLocal();toast(`${p.scenes.length} AI storyboard scenes created.`);
  }catch(err){toast(err.message);}finally{$("#aiDraftScenesBtn").disabled=false;$("#aiDraftScenesBtn").textContent="✦ Generate with free AI";}
});
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
  const imageButton=e.target.closest("[data-generate-scene-image]");
  if(imageButton){
    const index=Number(imageButton.dataset.generateSceneImage),scene=state.activeProject?.scenes?.[index];if(!scene)return;
    const character=state.characters.find(c=>c.id===scene.character_id);
    const prompt=`Cinematic film still, ${scene.visual_prompt}. ${character?`Character identity: ${character.name}. ${character.description||""} `:""}Maintain continuity with the character design, expressive action, detailed environment, film lighting, composition. No text, no captions.`;
    imageButton.disabled=true;imageButton.textContent="Generating…";
    try{const result=await aiRequest("/api/image",{prompt:prompt.slice(0,1950)});scene.generated_image=result.image;renderSceneList();try{saveLocal();}catch{}toast(`Scene ${index+1} image generated. Save scenes to sync it to Supabase.`);}
    catch(err){toast(err.message);imageButton.disabled=false;imageButton.textContent="✦ Generate scene image";}
    return;
  }
  const speak=e.target.closest("[data-speak-dialogue]");if(!speak)return;
  const scene=state.activeProject?.scenes?.[Number(speak.dataset.speakDialogue)];if(!scene?.dialogue?.trim()){toast("Add dialogue to this scene first.");return;}
  if(!("speechSynthesis" in window)){toast("This browser does not support speech preview.");return;}
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(scene.dialogue);utterance.lang=scene.voice_language==="si"?"si-LK":"en-US";
  const voices=speechSynthesis.getVoices();const match=voices.find(v=>v.lang.toLowerCase().startsWith(scene.voice_language==="si"?"si":"en"));if(match)utterance.voice=match;speechSynthesis.speak(utterance);
});

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
  const lines=[p.title||"Untitled Film","=".repeat((p.title||"Untitled Film").length),`Language: ${p.language||"si"}`,`Aspect ratio: ${p.ratio||p.aspect_ratio||"16:9"}`,`Target duration: ${p.duration||p.target_duration_seconds||300} seconds`,"",p.prompt||p.story_prompt||"","\nSCREENPLAY / STORYBOARD","----------------------"];
  (p.scenes||[]).forEach((s,i)=>{const ch=state.characters.find(c=>c.id===s.character_id);lines.push(`\nSCENE ${String(i+1).padStart(2,"0")} · ${s.duration||s.duration_seconds||8}s`,`CHARACTER: ${ch?.name||"Not assigned"}`,`VISUAL: ${s.visual_prompt||"(No visual prompt)"}`,`DIALOGUE (${s.voice_language||"si"}): ${s.dialogue||"(No dialogue)"}`,`SOUND: ${s.sound_prompt||"(No sound direction)"}`);});
  return lines.join("\n");
}
function exportScript(){const p=activeProject();if(!p){toast("Create or open a project first.");return;}downloadBlob(`${(p.title||"film").replace(/[^a-z0-9-_]+/gi,"-")}-screenplay.txt`,screenplayText(p));}
function exportProject(){const p=activeProject();if(!p){toast("Create or open a project first.");return;}const clean={...p,scenes:(p.scenes||[]).map(({reference_file,...s})=>s)};downloadBlob(`${(p.title||"film").replace(/[^a-z0-9-_]+/gi,"-")}-project.json`,JSON.stringify({project:clean,characters:state.characters.map(({image,...c})=>c),exported_at:new Date().toISOString()},null,2),"application/json");}
["exportScriptBtn","editorExportScript"].forEach(id=>{const el=$("#"+id);if(el)el.addEventListener("click",exportScript);});
["exportProjectBtn","editorExportProject"].forEach(id=>{const el=$("#"+id);if(el)el.addEventListener("click",exportProject);});
const draftBtn=$("#draftScenesBtn");
if(draftBtn)draftBtn.addEventListener("click",()=>{
  const p=state.activeProject;if(!p){toast("Create a project first.");return;}
  const story=(p.prompt||"").trim();if(!story){toast("Add a story direction in Project setup first.");return;}
  const sentences=story.split(/(?<=[.!?。])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
  const beats=["Opening / establish the world","Introduce the main character","A challenge or conflict appears","The character takes action","Climax and resolution"];
  const source=sentences.length>=2?sentences:beats.map((b,i)=>`${b}: ${story}`);
  const count=Math.min(8,Math.max(3,source.length));
  const chosen=Array.from({length:count},(_,i)=>source[Math.min(source.length-1,Math.floor(i*source.length/count))]);
  p.scenes=chosen.map((line,i)=>({id:crypto.randomUUID(),duration:Math.max(5,Math.min(15,Math.round((p.duration||300)/count))),character_id:"",visual_prompt:`Scene ${i+1}: ${line}. Cinematic composition, expressive character acting, consistent character appearance, detailed environment, deliberate camera movement.`,dialogue:"",voice_language:p.language==="en"?"en":"si",sound_prompt:"Atmospheric score and natural environmental sound."}));
  renderSceneList();saveLocal();toast(`${count} editable storyboard scenes drafted.`);
});
const bgImg=$("#backgroundImage");if(bgImg)bgImg.addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;$("#backgroundImagePreview").src=URL.createObjectURL(f);$("#backgroundImagePreview").hidden=false;});
const sourceInput=$("#sourceVideo");if(sourceInput)sourceInput.addEventListener("change",e=>{const f=e.target.files[0];if(f)$("#sourceVideoInfo").textContent=`Selected: ${f.name} · ${(f.size/1024/1024).toFixed(1)} MB · Local preview only`;});
// Open existing local/cloud projects from the project library.
$("#allProjects").addEventListener("click",e=>{const b=e.target.closest("[data-open-project]");if(!b)return;const p=state.projects.find(x=>x.id===b.dataset.openProject);if(!p)return;state.activeProject=p;$("#projectTitle").value=p.title||"";$("#projectPrompt").value=p.prompt||p.story_prompt||"";$("#projectLanguage").value=p.language||"si";$("#projectRatio").value=p.ratio||p.aspect_ratio||"16:9";$("#projectDuration").value=String(p.duration||p.target_duration_seconds||300);$("#sceneBuilder").hidden=false;renderSceneList();showPage("creator");toast(`Opened ${p.title}.`);});
$("#recentProjects").addEventListener("click",e=>{const b=e.target.closest("[data-open-project]");if(!b)return;const p=state.projects.find(x=>x.id===b.dataset.openProject);if(!p)return;state.activeProject=p;$("#projectTitle").value=p.title||"";$("#projectPrompt").value=p.prompt||p.story_prompt||"";$("#projectLanguage").value=p.language||"si";$("#projectRatio").value=p.ratio||p.aspect_ratio||"16:9";$("#projectDuration").value=String(p.duration||p.target_duration_seconds||300);$("#sceneBuilder").hidden=false;renderSceneList();showPage("creator");toast(`Opened ${p.title}.`);});

// Export a consistent multi-angle character sheet prompt for external image models.
$("#characterGrid").addEventListener("click",e=>{const b=e.target.closest("[data-turnaround]");if(!b)return;const c=state.characters.find(x=>x.id===b.dataset.turnaround);if(!c)return;const prompt=`CHARACTER TURNAROUND SHEET\nName: ${c.name}\nStyle: ${c.style}\nDescription: ${c.description||"Use the supplied reference image as the identity source."}\n\nCreate one clean model-sheet image showing the exact same character in these views: front view, front three-quarter view, left profile, left three-quarter rear, full back view, right three-quarter rear, right profile, right three-quarter front. Keep face, hairstyle, body proportions, clothing, colors and accessories identical in every view. Neutral standing pose, full body visible, consistent scale, orthographic studio presentation, plain light background, evenly spaced views, no labels, no extra characters. Do not redesign the character.\n\nREFERENCE IMAGE: attach the saved character reference when using this prompt.`;downloadBlob(`${c.name.replace(/[^a-z0-9-_]+/gi,"-")}-turnaround-prompt.txt`,prompt);toast("Turnaround prompt exported. Attach the character reference in your image model.");});
$("#characterGrid").addEventListener("click",e=>{const b=e.target.closest("[data-use-character]");if(!b)return;const characterId=b.dataset.useCharacter;const p=state.activeProject;if(p){p.scenes.push({id:crypto.randomUUID(),character_id:characterId,duration:8,visual_prompt:"Describe this character's action, camera framing and environment.",dialogue:"",voice_language:p.language==="en"?"en":"si",sound_prompt:""});renderSceneList();saveLocal();showPage("creator");toast("Character added to a new scene.");}else{sessionStorage.setItem("afs_pending_character",characterId);showPage("creator");toast("Create a project, then add this character to a scene.");}});
