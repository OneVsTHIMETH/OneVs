from pathlib import Path
p=Path('/mnt/data/aifilm_next/assets/js/app.js')
s=p.read_text()
s=s.replace('let generatedCharacterDataUrl = "";','let generatedCharacterDataUrl = "";\nlet editingCharacterId = null;\nlet analysedStoryCharacters = [];')
s=s.replace('const packProjectText = (story, direction, characterIds=[], aliases={}) => `[[STORY]]\\n${String(story||"").trim()}\\n\\n[[OVERALL_DIRECTION]]\\n${String(direction||"").trim()}\\n\\n[[CHARACTER_SETTINGS]]\\n${JSON.stringify({characterIds,aliases})}`;', 'const packProjectText = (story, direction, characterIds=[], aliases={}, characterMappings=[]) => `[[STORY]]\\n${String(story||"").trim()}\\n\\n[[OVERALL_DIRECTION]]\\n${String(direction||"").trim()}\\n\\n[[CHARACTER_SETTINGS]]\\n${JSON.stringify({characterIds,aliases,characterMappings})}`;')
s=s.replace('return {prompt:raw.slice("[[STORY]]\\n".length,raw.indexOf(marker)).trim(),direction:(settingsAt>=0?raw.slice(directionStart,settingsAt):raw.slice(directionStart)).trim(),characterIds:settings.characterIds||[],aliases:settings.aliases||{}};', 'return {prompt:raw.slice("[[STORY]]\\n".length,raw.indexOf(marker)).trim(),direction:(settingsAt>=0?raw.slice(directionStart,settingsAt):raw.slice(directionStart)).trim(),characterIds:settings.characterIds||[],aliases:settings.aliases||{},characterMappings:settings.characterMappings||[]};')
# replace renderProjectCharacterChoices with mapping renderer helper
start=s.index('function renderProjectCharacterChoices(selected=[]){')
end=s.index('function renderCharacters(){', start)
s=s[:start]+'''function renderProjectCharacterChoices(selected=[]){
  // Kept for restoring legacy project data; the new workflow maps each analysed story name below.
  const el=$("#projectCharacters");if(el)el.innerHTML=state.characters.map(c=>`<option value="${safe(c.id)}" ${selected.includes(c.id)?"selected":""}>${safe(c.name)}</option>`).join("");
}
function renderStoryCharacterMap(characters=analysedStoryCharacters, mappings=[]){
  const root=$("#storyCharacterMap");if(!root)return;
  analysedStoryCharacters=characters||[];
  if(!analysedStoryCharacters.length){root.innerHTML='<p class="helper">No named characters were found. You can continue and let AI invent characters from the story.</p>';return;}
  root.innerHTML=analysedStoryCharacters.map((ch,i)=>{
    const old=mappings.find(m=>String(m.storyName).toLowerCase()===ch.name.toLowerCase());
    const selected=old?.characterId||"ai";
    return `<div class="story-character-row" data-story-character-row="${i}"><div class="story-character-name"><b>${safe(ch.name)}</b><small>${safe(ch.description||"Character found in your story")}</small></div><label>Use character<select data-story-character-select="${i}"><option value="ai" ${selected==="ai"?"selected":""}>AI creates this character</option>${state.characters.map(c=>`<option value="${safe(c.id)}" ${selected===c.id?"selected":""}>${safe(c.name)} · Studio character</option>`).join("")}</select></label></div>`;
  }).join("");
}
function readStoryCharacterMappings(){return $$("[data-story-character-row]").map((row,i)=>({storyName:analysedStoryCharacters[i]?.name||"",characterId:row.querySelector("select")?.value||"ai",description:analysedStoryCharacters[i]?.description||""})).filter(x=>x.storyName);}
''' + s[end:]
# add edit button in card rendering
s=s.replace('<button class="text-button" data-view-character="${safe(c.id)}">View details</button><button class="text-button" data-use-character=', '<button class="text-button" data-view-character="${safe(c.id)}">View details</button><button class="text-button" data-edit-character="${safe(c.id)}">Edit character</button><button class="text-button" data-use-character=')
# replace form listeners and submit block
old='''$("#newCharacterBtn").addEventListener("click",()=>{$("#characterForm").hidden=false;$("#characterName").focus();});
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
});'''
new='''$("#newCharacterBtn").addEventListener("click",()=>{editingCharacterId=null;$("#characterCreateForm").reset();$("#characterFormTitle").textContent="Create a character";$("#saveCharacterButton").textContent="Save character";$("#characterForm").hidden=false;$("#characterName").focus();});
$("#closeCharacterForm").addEventListener("click",()=>$("#characterForm").hidden=true);
$("#cancelCharacter").addEventListener("click",()=>$("#characterForm").hidden=true);
$("#characterCreateForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const file=$("#characterImage").files[0] || generatedCharacterFile; const name=$("#characterName").value.trim();
  const existing=editingCharacterId?state.characters.find(c=>c.id===editingCharacterId):null;
  if(state.characters.some(c=>c.id!==editingCharacterId&&c.name.toLowerCase()===name.toLowerCase())){toast("Please choose a unique character name.");return;}
  if(existing){
    const updated={...existing,name,style:$("#characterStyle").value,description:$("#characterDescription").value.trim()};
    try{
      if(StudioDB.connected&&!StudioDB.signedIn){toast("Sign in before editing cloud characters.");return;}
      if(StudioDB.signedIn){
        let imagePath=existing.reference_image_path||null;
        if(file){if(file.size>5*1024*1024){toast("Character image limit is 5 MB.");return;}imagePath=await StudioDB.uploadPrivate("character-references",`characters/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`,file);}
        const {error}=await StudioDB.client.from("characters").update({name:updated.name,style:updated.style,description:updated.description,reference_image_path:imagePath}).eq("id",existing.id);if(error)throw error;
        updated.reference_image_path=imagePath;updated.image=imagePath?await StudioDB.signedUrl("character-references",imagePath):"";
      }else if(file){if(file.size>5*1024*1024){toast("Character image limit is 5 MB.");return;}updated.image=await fileToDataURL(file);}
      state.characters=state.characters.map(c=>c.id===existing.id?updated:c);
      state.projects.forEach(p=>(p.characterMappings||[]).forEach(m=>{if(m.characterId===existing.id)m.characterName=updated.name;}));
      saveLocal();renderCharacters();$("#characterCreateForm").reset();$("#characterForm").hidden=true;generatedCharacterFile=null;generatedCharacterDataUrl="";$("#generatedCharacterPreview").hidden=true;editingCharacterId=null;toast("Character updated.");
    }catch(err){toast("Could not update character: "+err.message);}return;
  }
  const character={id:crypto.randomUUID(),name,style:$("#characterStyle").value,description:$("#characterDescription").value.trim(),image:"",created_at:new Date().toISOString()};
  if(StudioDB.connected && StudioDB.signedIn){try{let imagePath=null;if(file)imagePath=await StudioDB.uploadPrivate("character-references",`characters/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`,file);const {data,error}=await StudioDB.client.from("characters").insert({user_id:StudioDB.user.id,name:character.name,style:character.style,description:character.description,reference_image_path:imagePath}).select().single();if(error)throw error;character.id=data.id;character.reference_image_path=imagePath;character.image=imagePath?await StudioDB.signedUrl("character-references",imagePath):"";}catch(err){toast("Cloud save failed: "+(err.message||"Check setup"));return;}}
  else if(StudioDB.connected){toast("Sign in before saving cloud characters.");return;}
  else if(file){if(file.size>5*1024*1024){toast("Local preview image limit is 5 MB.");return;}character.image=await fileToDataURL(file);}
  state.characters.unshift(character);try{saveLocal();}catch(err){toast("Character saved for this session, but browser storage is full. Connect Supabase to keep the image.");}renderCharacters();$("#characterCreateForm").reset();generatedCharacterFile=null;generatedCharacterDataUrl="";$("#generatedCharacterPreview").hidden=true;$("#characterForm").hidden=true;toast(StudioDB.signedIn?"Character saved to your cloud library.":"Character saved in this browser.");
});'''
if old not in s: print('WARNING character block not found')
else: s=s.replace(old,new)
# Replace project submit
start=s.index('$("#projectForm").addEventListener("submit",async e=>{')
end=s.index('function renderSceneList(){',start)
newblock='''$("#projectForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const characterMappings=readStoryCharacterMappings();
  const chosenIds=[...new Set(characterMappings.map(m=>m.characterId).filter(id=>id&&id!=="ai"))];
  const aliases=Object.fromEntries(characterMappings.filter(m=>m.characterId&&m.characterId!=="ai").map(m=>[m.storyName,state.characters.find(c=>c.id===m.characterId)?.name||""]).filter(([,v])=>v));
  const p={id:crypto.randomUUID(),title:$("#projectTitle").value.trim(),prompt:$("#projectPrompt").value.trim(),direction:$("#projectDirection").value.trim(),characterIds:chosenIds,aliases,characterMappings,language:$("#projectLanguage").value,ratio:$("#projectRatio").value,duration:Number($("#projectDuration").value),scenes:[],created_at:new Date().toISOString()};
  if(StudioDB.connected){if(!requireCloudAuth())return;try{const {data,error}=await StudioDB.client.from("projects").insert({user_id:StudioDB.user.id,title:p.title,story_prompt:packProjectText(p.prompt,p.direction,p.characterIds,p.aliases,p.characterMappings),language:p.language,aspect_ratio:p.ratio,target_duration_seconds:p.duration}).select().single();if(error)throw error;p.id=data.id;}catch(err){toast("Cloud save failed: "+err.message);return;}}
  state.projects.unshift(p);state.activeProject=p;saveLocal();renderProjectCharacterChoices(p.characterIds);$("#sceneBuilder").hidden=false;renderSceneList();renderProjects();toast("Project created. Generate your storyboard scenes.");$("#sceneBuilder").scrollIntoView({behavior:"smooth"});
});
'''
s=s[:start]+newblock+s[end:]
# replace parseDialogueLines and dialogue markup with expanded character rows
start=s.index('function parseDialogueLines(text){')
end=s.index('function sceneMarkup(s,i){',start)
newdialog='''function parseDialogueLines(text){
  const lines=String(text||"").split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);
  return lines.map(line=>{const m=line.match(/^([^:：-]{1,50})\\s*[:：-]\\s*(.+)$/);return m?{speaker:m[1].trim(),action:"",text:m[2].trim(),sound_prompt:"",voice_style:"Warm, natural voice",language:"en"}:{speaker:"Narrator",action:"",text:line,sound_prompt:"",voice_style:"Warm, smooth narration",language:"en"};});
}
function dialogueLineMarkup(s,i){
  const lines=Array.isArray(s.dialogue_lines)&&s.dialogue_lines.length?s.dialogue_lines:parseDialogueLines(s.dialogue);
  return lines.map((line,j)=>{const mapped=(state.activeProject?.characterMappings||[]).find(m=>m.storyName?.toLowerCase()===String(line.speaker||"").toLowerCase());const studio=mapped?.characterId&&mapped.characterId!=="ai"?state.characters.find(c=>c.id===mapped.characterId):state.characters.find(c=>c.name?.toLowerCase()===String(line.speaker||"").toLowerCase());const source=studio?`Studio character: ${studio.name}`:"AI character";return `<div class="dialogue-line" data-dialogue-line="${j}"><div class="dialogue-line-head"><b>${safe(line.speaker||`Character ${j+1}`)} <small class="soft-tag">${source}</small></b><button type="button" class="text-button danger-text" data-delete-dialogue="${j}">Delete</button></div><div class="scene-fields"><label>Character name<input data-line-speaker value="${safe(line.speaker||"")}" placeholder="Maya / Robot"></label><label>Voice language<select data-line-language><option value="si" ${(line.language||s.voice_language)==="si"?"selected":""}>Sinhala</option><option value="en" ${(line.language||s.voice_language)==="en"?"selected":""}>English</option></select></label><label class="wide">Acting / Action<textarea data-line-action rows="2" placeholder="What this character does in this scene...">${safe(line.action||"")}</textarea></label><label class="wide">Dialogue<textarea data-line-text rows="2" placeholder="Exact spoken words. Leave empty if silent.">${safe(line.text||"")}</textarea></label><label class="wide">Character sound / SFX<input data-line-sound value="${safe(line.sound_prompt||"")}" placeholder="Robot electronic voice, footsteps, breathing..."></label><label class="wide">Voice style<input data-line-style value="${safe(line.voice_style||"Girl voice, warm, smooth")}" placeholder="Girl voice, warm, smooth / deep male robot voice..."></label><div class="ai-action-row"><button type="button" class="secondary-button" data-generate-voice="${j}" ${line.text?"":"disabled"}>✦ Generate voice</button><button type="button" class="secondary-button" data-preview-line="${j}" ${line.text?"":"disabled"}>▶ Browser preview</button>${line.audio?`<button type="button" class="text-button danger-text" data-delete-voice="${j}">Delete generated voice</button>`:""}</div>${line.audio?`<audio class="generated-voice-audio" controls src="${line.audio}"></audio>`:""}</div></div>`;}).join("")||'<p class="helper">No character rows yet. Add one for every character in this scene, including silent characters.</p>';
}
'''
s=s[:start]+newdialog+s[end:]
# alter sceneMarkup top-level heading and note to emphasize per character
s=s.replace('<h4>Character dialogue & voice</h4>${dialogueLineMarkup(s,i)}', '<h4>Character actions, dialogue & sounds</h4><p class="helper">Each row represents one character in this scene. Include silent characters too; add their action even when they have no dialogue.</p>${dialogueLineMarkup(s,i)}')
# analyze click handler before generate story button
needle='$("#generateStoryBtn").addEventListener("click",async()=>{'
insert='''$("#analyzeStoryBtn").addEventListener("click",async()=>{
  const story=$("#projectPrompt").value.trim();if(!story){toast("Write the story first, then analyse it.");return;}
  const status=$("#characterAnalysisStatus"),button=$("#analyzeStoryBtn");button.disabled=true;button.textContent="Analysing story…";status.textContent="AI is finding every named character in your story.";
  try{const result=await aiRequest("/api/analyze-story",{story,language:$("#projectLanguage").value});renderStoryCharacterMap(result.characters||[]);status.textContent=`Found ${result.characters?.length||0} story characters. Choose a saved Studio character for each name, or leave AI creates this character.`;}
  catch(err){status.textContent=err.message;toast("Story analysis failed.");}
  finally{button.disabled=false;button.textContent="✦ Analyse Story & Find Characters";}
});
'''+needle
s=s.replace(needle,insert)
# replace aiDraftScenes handler body whole block until generateCharacterImageBtn
start=s.index('$("#aiDraftScenesBtn").addEventListener("click",async()=>{')
end=s.index('$("#generateCharacterImageBtn").addEventListener',start)
newgen='''$("#aiDraftScenesBtn").addEventListener("click",async()=>{
  const p=state.activeProject;if(!p){toast("Create or open a project first.");return;}
  try{
    $("#aiDraftScenesBtn").disabled=true;$("#aiDraftScenesBtn").textContent="Generating scenes…";
    const mappingInstructions=(p.characterMappings||[]).map(m=>{const c=state.characters.find(x=>x.id===m.characterId);return c?`Story character name \\"${m.storyName}\\" MUST use the exact saved Studio character identity \\"${c.name}\\". Appearance/style: ${c.style||"3D animated"}; ${c.description||"Use the saved character design"}. In the storyboard keep the story name \\"${m.storyName}\\" but set this character as assigned to saved character \\"${c.name}\\".`:`Story character \\"${m.storyName}\\" is AI-created; invent and keep one consistent design for this character.`;}).join("\\n");
    const roster=(p.characterIds||[]).map(id=>state.characters.find(c=>c.id===id)).filter(Boolean).map(c=>`${c.name}: ${c.style||"3D animated"}; ${c.description||"saved character"}`).join("\\n");
    const storyboardStory=[`STORY:\\n${p.prompt||p.story_prompt||""}`,p.direction?`OVERALL DIRECTION:\\n${p.direction}`:"",mappingInstructions?`CHARACTER ASSIGNMENTS:\\n${mappingInstructions}`:"",roster?`SAVED STUDIO CHARACTER LIBRARY:\\n${roster}`:""].filter(Boolean).join("\\n\\n");
    const result=await aiRequest("/api/storyboard",{story:storyboardStory,language:p.language||"si",duration:p.duration||300});
    const mapByName=new Map((p.characterMappings||[]).map(m=>[m.storyName.toLowerCase(),m]));
    p.scenes=result.scenes.map((sc,i)=>{
      let cast=Array.isArray(sc.characters)?sc.characters:[];
      let lines=Array.isArray(sc.dialogue_lines)?sc.dialogue_lines:[];
      if(!cast.length&&lines.length)cast=lines.map(d=>({name:d.speaker,action:d.action,dialogue:d.text,sound_prompt:d.sound_prompt,voice_style:d.voice_style}));
      if(!cast.length&&sc.dialogue){lines=parseDialogueLines(sc.dialogue);cast=lines.map(d=>({name:d.speaker,action:d.action,dialogue:d.text,sound_prompt:d.sound_prompt,voice_style:d.voice_style}));}
      const character_ids=[];
      const characterRows=cast.map(ch=>{const name=String(ch.name||ch.story_name||"Character").trim();const m=mapByName.get(name.toLowerCase());const saved=m?.characterId&&m.characterId!=="ai"?state.characters.find(c=>c.id===m.characterId):null;if(saved)character_ids.push(saved.id);return {speaker:name,source:saved?"studio":"ai",character_id:saved?.id||null,appearance:ch.appearance||saved?.description||"",action:ch.action||"",text:ch.dialogue||"",sound_prompt:ch.sound_prompt||"",voice_style:ch.voice_style||"Warm, natural voice",language:p.language==="en"?"en":"si"};});
      if(!characterRows.length)characterRows.push(...lines.map(d=>({speaker:d.speaker,source:"ai",action:d.action||"",text:d.text||"",sound_prompt:d.sound_prompt||"",voice_style:d.voice_style||"Warm, natural voice",language:p.language==="en"?"en":"si"})));
      const dialogue=characterRows.filter(x=>x.text).map(x=>`${x.speaker}: ${x.text}`).join("\\n");
      const visual_prompt=String(sc.visual_prompt||"");
      return {id:crypto.randomUUID(),title:sc.title||`Scene ${i+1}`,duration:sc.duration,character_ids:[...new Set(character_ids)],character_id:character_ids[0]||"",characters:characterRows,visual_prompt,dialogue,dialogue_lines:characterRows,voice_language:p.language==="en"?"en":"si",sound_prompt:sc.sound_prompt||""};
    });
    renderSceneList();saveLocal();
    for(let i=0;i<p.scenes.length;i++){
      const scene=p.scenes[i];$("#aiDraftScenesBtn").textContent=`Creating artwork ${i+1}/${p.scenes.length}…`;
      const perCharacter=scene.characters.map(c=>{const saved=c.character_id?state.characters.find(x=>x.id===c.character_id):null;return `${c.speaker}: ${saved?`SAVED STUDIO CHARACTER ${saved.name}; ${saved.style}; ${saved.description}`:`AI character, consistent appearance ${c.appearance||"as described in story"}`}; action: ${c.action}`;}).join(". ");
      try{const art=await aiRequest("/api/image",{prompt:`Cinematic film still. ${scene.visual_prompt}. Character identities and actions: ${perCharacter}. ${sceneCharacterPrompt(scene)}. Show the listed characters together where appropriate. Expressive natural acting, cinematic lighting and composition. No words, no captions, no typography.`.slice(0,1950)});scene.generated_image=art.image;renderSceneList();}
      catch(imageErr){toast(`Storyboard created; image ${i+1} could not be generated: ${imageErr.message}`);if(/limit|quota|neurons|rate/i.test(imageErr.message))break;}
    }
    saveLocal();renderSceneList();toast(`Created ${p.scenes.length} scenes with character-by-character actions and dialogue.`);
  }catch(err){toast(err.message);}finally{$("#aiDraftScenesBtn").disabled=false;$("#aiDraftScenesBtn").textContent="✦ Generate scenes + artwork";}
});
'''
s=s[:start]+newgen+s[end:]
# update readDialogueLines preserving all rows and action/sound
old='''function readDialogueLines(card){const scene=state.activeProject?.scenes?.[Number(card.dataset.scene)];return $$("[data-dialogue-line]",card).map((row,j)=>({speaker:row.querySelector("[data-line-speaker]")?.value||"Narrator",text:row.querySelector("[data-line-text]")?.value.trim()||"",language:row.querySelector("[data-line-language]")?.value||"en",voice_style:row.querySelector("[data-line-style]")?.value||"Warm, smooth",audio:scene?.dialogue_lines?.[j]?.audio||"",audio_path:scene?.dialogue_lines?.[j]?.audio_path||null})).filter(x=>x.text);}'''
new='''function readDialogueLines(card){const scene=state.activeProject?.scenes?.[Number(card.dataset.scene)];return $$("[data-dialogue-line]",card).map((row,j)=>({speaker:row.querySelector("[data-line-speaker]")?.value.trim()||"Character",action:row.querySelector("[data-line-action]")?.value.trim()||"",text:row.querySelector("[data-line-text]")?.value.trim()||"",sound_prompt:row.querySelector("[data-line-sound]")?.value.trim()||"",language:row.querySelector("[data-line-language]")?.value||"en",voice_style:row.querySelector("[data-line-style]")?.value||"Warm, smooth",audio:scene?.dialogue_lines?.[j]?.audio||"",audio_path:scene?.dialogue_lines?.[j]?.audio_path||null}));}'''
if old not in s: print('WARNING readDialogue old not found')
else:s=s.replace(old,new)
# when adding dialogue line use richer fields
s=s.replace('scene.dialogue_lines.push({speaker:state.characters[0]?.name||"Narrator",text:"",voice_style:"Girl voice, warm, smooth",language:scene.voice_language||"en"});', 'scene.dialogue_lines.push({speaker:state.characters[0]?.name||"New AI Character",action:"",text:"",sound_prompt:"",voice_style:"Warm, natural voice",language:scene.voice_language||"en"});')
# dialogue construction should only nonempty text, keep action lines separately
s=s.replace('scene.dialogue=scene.dialogue_lines.map(x=>`${x.speaker}: ${x.text}`).join("\\n");', 'scene.dialogue=scene.dialogue_lines.filter(x=>x.text).map(x=>`${x.speaker}: ${x.text}`).join("\\n");')
s=s.replace('const dialogue=lines.map(x=>`${x.speaker}: ${x.text}`).join("\\n");', 'const dialogue=lines.filter(x=>x.text).map(x=>`${x.speaker}: ${x.text}`).join("\\n");')
# collectSceneCard return characters and preserve scene rows
s=s.replace('return {id:state.activeProject.scenes[index]?.id||crypto.randomUUID(),character_ids,character_id:character_ids[0]||null,duration:Number(get("duration").value)||8,visual_prompt,dialogue,dialogue_lines:lines,voice_language:get("voice_language").value,sound_prompt:get("sound_prompt").value,generated_image:', 'return {id:state.activeProject.scenes[index]?.id||crypto.randomUUID(),character_ids,character_id:character_ids[0]||null,duration:Number(get("duration").value)||8,visual_prompt,dialogue,dialogue_lines:lines,characters:lines.map(x=>({name:x.speaker,action:x.action,dialogue:x.text,sound_prompt:x.sound_prompt})),voice_language:get("voice_language").value,sound_prompt:get("sound_prompt").value,generated_image:')
# add edit handler into characterGrid click listener after view branch
needle='''  if(view){const c=state.characters.find(x=>x.id===view.dataset.viewCharacter);if(c){$("#characterDetailsTitle").textContent=c.name;$("#characterDetailsBody").innerHTML=`${c.image?`<img class="character-detail-image" src="${c.image}" alt="">`:""}<p><b>Style:</b> ${safe(c.style)}</p><p>${safe(c.description||"No description saved.")}</p>`;$("#characterDetailsDialog").showModal();}return;}
  const del=e.target.closest("[data-delete-character]");'''
replace='''  if(view){const c=state.characters.find(x=>x.id===view.dataset.viewCharacter);if(c){$("#characterDetailsTitle").textContent=c.name;$("#characterDetailsBody").innerHTML=`${c.image?`<img class="character-detail-image" src="${c.image}" alt="">`:""}<p><b>Style:</b> ${safe(c.style)}</p><p>${safe(c.description||"No description saved.")}</p>`;$("#characterDetailsDialog").showModal();}return;}
  const edit=e.target.closest("[data-edit-character]");
  if(edit){const c=state.characters.find(x=>x.id===edit.dataset.editCharacter);if(!c)return;editingCharacterId=c.id;$("#characterFormTitle").textContent="Edit character";$("#saveCharacterButton").textContent="Save changes";$("#characterName").value=c.name||"";$("#characterStyle").value=c.style||"3D animated";$("#characterDescription").value=c.description||"";$("#characterImage").value="";$("#generatedCharacterPreview").hidden=!c.image;if(c.image)$("#generatedCharacterPreview").src=c.image;$("#characterForm").hidden=false;$("#characterForm").scrollIntoView({behavior:"smooth"});return;}
  const del=e.target.closest("[data-delete-character]");'''
if needle not in s: print('WARNING edit listener insertion not found')
else:s=s.replace(needle,replace)
# Update both project open handlers: mappings and UI
s=s.replace('renderProjectCharacterChoices(p.characterIds||[]);$("#projectAliases").value=Object.entries(p.aliases||{}).map(([a,b])=>`${a} -> ${b}`).join("\\n");$("#sceneBuilder").hidden=false;', 'renderProjectCharacterChoices(p.characterIds||[]);renderStoryCharacterMap(p.characterMappings?.map(m=>({name:m.storyName,description:m.description||""}))||[],p.characterMappings||[]);$("#characterAnalysisStatus").textContent=p.characterMappings?.length?"Restored this project’s story character assignments.":"This project has no saved story character analysis yet.";$("#sceneBuilder").hidden=false;')
# scene character IDs function includes scene.characters and dialogue speaker matching mapped story names
s=s.replace('const text=[scene.visual_prompt,scene.dialogue].filter(Boolean).join("\\n");', 'const text=[scene.visual_prompt,scene.dialogue,...(scene.characters||[]).map(c=>c.name||c.speaker),...(scene.dialogue_lines||[]).map(c=>c.speaker)].filter(Boolean).join("\\n");')
# scene image character prompt can use mapped studio ids already set. Add CSS later
p.write_text(s)
