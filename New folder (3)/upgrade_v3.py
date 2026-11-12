from pathlib import Path
p=Path('/mnt/data/aifilm_next/index.html')
s=p.read_text()
s=s.replace('''            <div class="character-setup-block">
              <h3>Characters for this project <span class="soft-tag">Optional</span></h3>
              <p class="helper">Select saved characters before creating scenes. Leave empty if you want AI to invent characters.</p>
              <label>Saved characters<select id="projectCharacters" multiple size="4"></select></label>
              <label>Story name mapping<textarea id="projectAliases" rows="3" placeholder="Jessica -> MAYA&#10;Tom -> RAVI"></textarea><small class="helper">One mapping per line. The name on the left is used in your story; the saved character on the right will appear in the generated scenes.</small></label>
            </div>''','''            <div class="character-setup-block">
              <h3>Story character analysis <span class="soft-tag">AI assisted</span></h3>
              <p class="helper">Story එකේ character names AI එකෙන් හඳුනාගන්න. ඊට පස්සේ එක් එක් නමට Studio character එකක් තෝරන්න, නැත්නම් AI character එකක් ලෙස තබන්න.</p>
              <button type="button" class="secondary-button" id="analyzeStoryBtn">✦ Analyse Story & Find Characters</button>
              <span class="helper" id="characterAnalysisStatus">Write your Story first, then analyse it to find character names.</span>
              <div id="storyCharacterMap" class="story-character-map"><p class="helper">Analyse Story කළාම characters මෙතැන පෙන්වයි.</p></div>
            </div>''')
s=s.replace('<button class="text-button" data-view-character="${safe(c.id)}">View details</button><button class="text-button" data-use-character=', '<button class="text-button" data-view-character="${safe(c.id)}">View details</button><button class="text-button" data-edit-character="${safe(c.id)}">Edit character</button><button class="text-button" data-use-character=')
s=s.replace('<div class="panel-heading"><div><h3>Create a character</h3><p>Give your character a unique identity.</p></div>', '<div class="panel-heading"><div><h3 id="characterFormTitle">Create a character</h3><p>Give your character a unique identity.</p></div>')
s=s.replace('<button class="primary-button" type="submit">Save character</button>', '<button class="primary-button" type="submit" id="saveCharacterButton">Save character</button>')
p.write_text(s)

p=Path('/mnt/data/aifilm_next/worker/worker.js')
s=p.read_text()
# enrich parseJsonArray
s=s.replace('''      dialogue: String(s.dialogue || "").slice(0, 1200),
      sound_prompt: String(s.sound_prompt || s.sound || "").slice(0, 500),
      duration
''','''      dialogue: String(typeof s.dialogue === "string" ? s.dialogue : "").slice(0, 1200),
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
''')
# add analyse route before storyboard
needle='''      if (url.pathname === "/api/storyboard") {'''
insert='''      if (url.pathname === "/api/analyze-story") {
        const story = String(body.story || "").trim();
        if (!story) return json({ error: "Write a story before analysing characters." }, 400, headers);
        if (story.length > 12000) return json({ error: "Keep the story under 12,000 characters for analysis." }, 400, headers);
        const language = body.language === "en" ? "English" : body.language === "both" ? "Sinhala and English" : "Sinhala";
        const result = await env.AI.run(TEXT_MODEL, {
          messages: [
            { role: "system", content: "You are a script supervisor. Identify every named character who participates in the story. Do not list places, objects, animals unless they are named story characters, or unnamed crowds. Return ONLY valid JSON: {\\\"characters\\\":[{\\\"name\\\":\\\"exact name used in story\\\",\\\"description\\\":\\\"short role and identifying details\\\"}]}. Preserve exact names and language from the story. If no named characters exist, return an empty characters array." },
            { role: "user", content: `Analyse this ${language} film story and identify all named characters, including minor speaking characters. Story:\\n${story}` }
          ], max_tokens: 1200, temperature: 0.2
        });
        const raw = String(extractText(result)).replace(/^```(?:json)?\\s*/i, "").replace(/\\s*```$/, "").trim();
        const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
        if (start < 0 || end <= start) throw new Error("The AI could not return a character list. Please try again.");
        const parsed = JSON.parse(raw.slice(start, end + 1));
        const characters = (Array.isArray(parsed.characters) ? parsed.characters : []).slice(0, 30).map(c => ({ name: String(c.name || "").trim().slice(0, 60), description: String(c.description || "").trim().slice(0, 300) })).filter(c => c.name);
        return json({ ok: true, characters, model: TEXT_MODEL }, 200, headers);
      }

'''+needle
s=s.replace(needle,insert)
# replace storyboard system and user prompt
old='''{ role: "system", content: "You are a professional film screenwriter and storyboard artist. Follow the requested language. Invent suitable characters from the story when needed; never require saved characters or uploaded images. Keep character appearance consistent across scenes. Return ONLY a valid JSON array. Each item must contain title, visual_prompt, dialogue, sound_prompt, duration. No markdown fences or explanation." },
            { role: "user", content: `Create an editable storyboard for this film. Language: ${language}. Target total duration: ${target} seconds. Create 4 to 20 scenes with durations proportional to the story beats. The total scene duration must equal exactly ${target} seconds. Each visual_prompt must describe all visible characters, invent suitable characters if the story needs them, keep their appearance consistent, and include action, environment, lighting, camera angle and camera movement. Do not depend on uploaded images, background images or saved characters. dialogue should contain spoken lines or an empty string. sound_prompt should describe ambient sound/music. Story: ${story}\\nReturn JSON array only.` }'''
new='''{ role: "system", content: "You are a professional film screenwriter, script supervisor and storyboard artist. Follow the requested language. Keep every named character consistent across scenes. Return ONLY a valid JSON array. Each scene must contain title, visual_prompt, characters (array of per-character objects), sound_prompt and duration. Each character object must contain name, appearance, action, dialogue, sound_prompt and voice_style. Do not merge different speakers into one dialogue string. No markdown fences or explanation." },
            { role: "user", content: `Create an editable storyboard for this film. Language: ${language}. Target total duration: ${target} seconds. Create 4 to 20 scenes with durations proportional to story beats. Total duration must equal exactly ${target} seconds. In EVERY scene list every character who is actually visible or participates. For each character write their exact story name, a concise consistent appearance, their specific physical acting/action, their own spoken dialogue (empty string if silent), and their own vocal/sound effect direction (empty if none). Never omit a character who speaks or acts. Do not invent a new character when the story already names one. Keep character names and identities identical across scenes. visual_prompt must describe the full scene, environment, lighting, camera angle and movement. sound_prompt describes scene ambience/music only. Story and character mapping instructions: ${story}\\nReturn JSON array only.` }'''
if old not in s:
    print('WARNING storyboard prompt old not found')
else:s=s.replace(old,new)
p.write_text(s)
