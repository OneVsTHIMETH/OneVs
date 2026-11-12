from pathlib import Path
p=Path('/mnt/data/filmstudio_work/assets/js/app.js')
s=p.read_text()
# Cloud sync: restore multi-character IDs, with legacy fallback
s=s.replace('({id:s.id,character_id:s.character_id,duration:s.duration_seconds,visual_prompt:s.visual_prompt,dialogue:s.dialogue_text,voice_language:s.voice_language,sound_prompt:s.sound_prompt,reference_image_path:s.reference_image_path,generated_image:s.reference_image_path?await StudioDB.signedUrl("project-assets",s.reference_image_path):""})', '({id:s.id,character_id:s.character_id,character_ids:Array.isArray(s.character_ids)&&s.character_ids.length?s.character_ids:(s.character_id?[s.character_id]:[]),duration:s.duration_seconds,visual_prompt:s.visual_prompt,dialogue:s.dialogue_text,voice_language:s.voice_language,sound_prompt:s.sound_prompt,reference_image_path:s.reference_image_path,generated_image:s.reference_image_path?await StudioDB.signedUrl("project-assets",s.reference_image_path):""})')
# Insert helper functions before sceneMarkup
old='function sceneMarkup(s,i){return `'
new='''function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&");}
function detectCharactersInText(text){
  const source=String(text||"");
  return state.characters.filter(c=>{
    const name=String(c.name||"").trim();if(!name)return false;
    try{return new RegExp(`(^|[^\\\\p{L}\\\\p{N}_])${escapeRegExp(name)}(?=$|[^\\\\p{L}\\\\p{N}_])`,"iu").test(source);}
    catch{return source.toLocaleLowerCase().includes(name.toLocaleLowerCase());}
  });
}
function sceneCharacterIds(scene){
  const text=[scene.visual_prompt,scene.dialogue].filter(Boolean).join("\\n");
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
function sceneMarkup(s,i){return `'''
if old not in s: raise SystemExit('sceneMarkup anchor missing')
s=s.replace(old,new,1)
# Replace old markup function's single character select with multi-select and help text
old='''<label>Character<select data-field="character_id"><option value="">No character</option>${state.characters.map(c=>`<option value="${safe(c.id)}" ${s.character_id===c.id?"selected":""}>${safe(c.name)}</option>`).join("")}</select></label>'''
new='''<label class="wide">Characters (multiple)<select data-field="character_ids" multiple size="${Math.max(2,Math.min(5,state.characters.length||2))}">${state.characters.map(c=>`<option value="${safe(c.id)}" ${sceneCharacterIds(s).includes(c.id)?"selected":""}>${safe(c.name)}</option>`).join("")}</select><small class="helper">Write saved character names in the Visual prompt or Dialogue. Matching names are automatically selected; you can also select multiple characters here.</small><small class="detected-character-note" data-detected-characters>${sceneCharacterIds(s).length?`Detected/selected: ${sceneCharacterIds(s).map(id=>safe(state.characters.find(c=>c.id===id)?.name||"")).join(", ")}`:"No saved character names detected yet."}</small></label>'''
if old not in s: raise SystemExit('old character field missing')
s=s.replace(old,new,1)
# Update add scene default shape
s=s.replace('state.activeProject.scenes.push({id:crypto.randomUUID(),duration:8,voice_language:"si"});','state.activeProject.scenes.push({id:crypto.randomUUID(),character_id:"",character_ids:[],duration:8,voice_language:"si"});')
# Add input handler for automatic detection after sceneList click handler
anchor='''$("#sceneList").addEventListener("click",e=>{const b=e.target.closest("[data-remove-scene]");if(b){state.activeProject.scenes.splice(Number(b.dataset.removeScene),1);renderSceneList();}});'''
insert=anchor+'''
$("#sceneList").addEventListener("input",e=>{
  const card=e.target.closest(".scene-card");if(!card||!e.target.matches('[data-field="visual_prompt"],[data-field="dialogue"]'))return;
  const text=[card.querySelector('[data-field="visual_prompt"]')?.value,card.querySelector('[data-field="dialogue"]')?.value].join("\\n");
  const detected=detectCharactersInText(text);const select=card.querySelector('[data-field="character_ids"]');
  const detectedIds=new Set(detected.map(c=>c.id));
  [...select.options].forEach(o=>{if(detectedIds.has(o.value))o.selected=true;});
  const chosen=[...select.selectedOptions].map(o=>o.value);
  const note=card.querySelector('[data-detected-characters]');
  if(note)note.textContent=chosen.length?`Detected/selected: ${chosen.map(id=>state.characters.find(c=>c.id===id)?.name).filter(Boolean).join(", ")}`:"No saved character names detected yet.";
});'''
if anchor not in s: raise SystemExit('scene click anchor missing')
s=s.replace(anchor,insert,1)
# Save scenes read multi select + detect text, and legacy primary id
old='''scenes.push({id:card.dataset.id||crypto.randomUUID(),character_id:get("character_id").value||null,duration:Number(get("duration").value)||8,visual_prompt:get("visual_prompt").value,dialogue:get("dialogue").value,voice_language:get("voice_language").value,sound_prompt:get("sound_prompt").value,generated_image:state.activeProject.scenes[i]?.generated_image||""});'''
new='''const visual_prompt=get("visual_prompt").value,dialogue=get("dialogue").value;
    const selectedIds=[...get("character_ids").selectedOptions].map(o=>o.value);
    const detectedIds=detectCharactersInText(`${visual_prompt}\\n${dialogue}`).map(c=>c.id);
    const character_ids=[...new Set([...selectedIds,...detectedIds])];
    scenes.push({id:card.dataset.id||crypto.randomUUID(),character_ids,character_id:character_ids[0]||null,duration:Number(get("duration").value)||8,visual_prompt,dialogue,voice_language:get("voice_language").value,sound_prompt:get("sound_prompt").value,generated_image:state.activeProject.scenes[i]?.generated_image||"",reference_image_path:state.activeProject.scenes[i]?.reference_image_path||null});'''
if old not in s: raise SystemExit('save scenes mapping missing')
s=s.replace(old,new,1)
# Cloud row includes array column
s=s.replace('const row={project_id:state.activeProject.id,character_id:s.character_id||null,scene_order:i+1,', 'const row={project_id:state.activeProject.id,character_id:s.character_id||null,character_ids:s.character_ids||[],scene_order:i+1,')
# AI storyboard mapping auto detect
old='''p.scenes=result.scenes.map((s,i)=>({id:crypto.randomUUID(),duration:s.duration,character_id:"",visual_prompt:s.visual_prompt,dialogue:s.dialogue,voice_language:p.language==="en"?"en":"si",sound_prompt:s.sound_prompt}));'''
new='''p.scenes=result.scenes.map((s,i)=>{const character_ids=detectCharactersInText(`${s.visual_prompt||""}\\n${s.dialogue||""}`).map(c=>c.id);return {id:crypto.randomUUID(),duration:s.duration,character_ids,character_id:character_ids[0]||"",visual_prompt:s.visual_prompt,dialogue:s.dialogue,voice_language:p.language==="en"?"en":"si",sound_prompt:s.sound_prompt};});'''
if old not in s: raise SystemExit('AI storyboard mapping missing')
s=s.replace(old,new,1)
# AI storyboard artwork prompt includes identities
s=s.replace('`Cinematic film still, ${scene.visual_prompt}. Expressive natural acting, coherent character design, cinematic lighting and composition. No words, no captions, no typography.`.slice(0,1950)', '`Cinematic film still, ${scene.visual_prompt}. ${sceneCharacterPrompt(scene)}. Expressive natural acting, cinematic lighting and composition. No words, no captions, no typography.`.slice(0,1950)')
# Scene image generator uses all characters not single legacy ID
old='''const character=state.characters.find(c=>c.id===scene.character_id);
    const prompt=`Cinematic film still, ${scene.visual_prompt}. ${character?`Character identity: ${character.name}. ${character.description||""} `:""}Maintain continuity with the character design, expressive action, detailed environment, film lighting, composition. No text, no captions.`;'''
new='''const prompt=`Cinematic film still, ${scene.visual_prompt}. ${sceneCharacterPrompt(scene)}. Maintain continuity with every listed character design, expressive action, detailed environment, film lighting, composition. No text, no captions.`;'''
if old not in s: raise SystemExit('scene image prompt block missing')
s=s.replace(old,new,1)
# On character deletion remove from arrays too
s=s.replace('''state.projects.forEach(p=>(p.scenes||[]).forEach(s=>{if(s.character_id===c.id)s.character_id="";}));
      if(state.activeProject?.scenes)state.activeProject.scenes.forEach(s=>{if(s.character_id===c.id)s.character_id="";});''','''state.projects.forEach(p=>(p.scenes||[]).forEach(s=>{if(s.character_id===c.id)s.character_id="";s.character_ids=(s.character_ids||[]).filter(id=>id!==c.id);}));
      if(state.activeProject?.scenes)state.activeProject.scenes.forEach(s=>{if(s.character_id===c.id)s.character_id="";s.character_ids=(s.character_ids||[]).filter(id=>id!==c.id);});''')
# screenplay export all assigned names
s=s.replace('''(p.scenes||[]).forEach((s,i)=>{const ch=state.characters.find(c=>c.id===s.character_id);lines.push(`\\nSCENE ${String(i+1).padStart(2,"0")} · ${s.duration||s.duration_seconds||8}s`,`CHARACTER: ${ch?.name||"Not assigned"}`,''','''(p.scenes||[]).forEach((s,i)=>{const chars=sceneCharacterIds(s).map(id=>state.characters.find(c=>c.id===id)?.name).filter(Boolean);lines.push(`\\nSCENE ${String(i+1).padStart(2,"0")} · ${s.duration||s.duration_seconds||8}s`,`CHARACTERS: ${chars.join(", ")||"Not assigned"}`,''')
# draft scenes auto detect names from story lines
old='''p.scenes=chosen.map((line,i)=>({id:crypto.randomUUID(),duration:Math.max(1,Math.round((p.duration||300)/count)),character_id:"",visual_prompt:`Scene ${i+1}: ${line}. Cinematic composition, expressive character acting, consistent character appearance, detailed environment, deliberate camera movement.`,dialogue:"",voice_language:p.language==="en"?"en":"si",sound_prompt:"Atmospheric score and natural environmental sound."}));'''
new='''p.scenes=chosen.map((line,i)=>{const visual_prompt=`Scene ${i+1}: ${line}. Cinematic composition, expressive character acting, consistent character appearance, detailed environment, deliberate camera movement.`;const character_ids=detectCharactersInText(line).map(c=>c.id);return {id:crypto.randomUUID(),duration:Math.max(1,Math.round((p.duration||300)/count)),character_id:character_ids[0]||"",character_ids,visual_prompt,dialogue:"",voice_language:p.language==="en"?"en":"si",sound_prompt:"Atmospheric score and natural environmental sound."};});'''
if old not in s: raise SystemExit('draft scenes block missing')
s=s.replace(old,new,1)
# Use character action creates multi ids
s=s.replace('''{id:crypto.randomUUID(),character_id:characterId,duration:8,visual_prompt:"Describe this character's action, camera framing and environment."''','''{id:crypto.randomUUID(),character_id:characterId,character_ids:[characterId],duration:8,visual_prompt:"Describe this character's action, camera framing and environment."''')
p.write_text(s)

# CSS: improve multiselect readability and detected note
css=Path('/mnt/data/filmstudio_work/assets/css/style.css')
c=css.read_text()
c += '\n/* Multi-character scene assignment */\n.scene-fields select[multiple]{min-height:88px;padding:8px}.detected-character-note{font-size:11px;color:#5366b7;font-weight:600;line-height:1.5}.scene-fields .helper{margin-top:0}\n'
css.write_text(c)

# Add migration and update base schema for fresh installations
migration=Path('/mnt/data/filmstudio_work/supabase/migrations/20261109_scene_multiple_characters.sql')
migration.write_text('''-- Allow one scene to use multiple saved characters while retaining legacy character_id.\nalter table public.scenes\n  add column if not exists character_ids uuid[] not null default '{}'::uuid[];\n\n-- Backfill the existing single-character relation into the new array.\nupdate public.scenes\nset character_ids = array[character_id]\nwhere character_id is not null\n  and coalesce(array_length(character_ids, 1), 0) = 0;\n''')
schema=Path('/mnt/data/filmstudio_work/supabase/schema.sql')
sch=schema.read_text()
needle='  character_id uuid references public.characters(id) on delete set null,\n'
if needle in sch and 'character_ids uuid[]' not in sch:
    sch=sch.replace(needle,needle+"  character_ids uuid[] not null default '{}'::uuid[],\n",1)
schema.write_text(sch)
