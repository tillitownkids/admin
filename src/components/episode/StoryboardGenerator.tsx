"use client";

import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StepStart } from "@/components/episode/StepStart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { callAi } from "@/actions/actions";
import { saveStoryboardScenesAction, getSavedStoryboardsAction } from "@/actions/saveStoryboardAction";
import { getStoryCharactersAndLocationsAction } from "@/actions/saveStoryAction";
import { MAX_BEATS_PER_SCENE, parseStoryboardJson, validateScenePlan } from "@/lib/storyboardGeneration";
import { generateStoryboardBatchAction } from "@/actions/generateStoryboardBatchAction";
import { matchCharactersByName, normalizeCharacterName } from "@/lib/characterNames";


interface DatabaseScript {
  id: string;
  story_id?: string | null;
  topic?: string;
  episode_number?: string;
  title?: string;
  content?: string;
  status?: string;
  generated_at?: string;
}

interface SavedStoryboard {
  id: string;
  episode_number: string;
  topic: string;
  generated_at: string;
}

interface StoryboardScene {
  scene_number: number;
  title: string;
  beat_numbers?: number[] | string;
  scene_script_beats?: string;
  description?: string;
  storyboard_prompt: string;
  location_name?: string;
  character_names?: string[];
  episodeLocationId?: string;
}

function stripHtmlToMarkdown(text: string): string {
  if (!text) return "";
  if (!/<[a-z][\s\S]*>/i.test(text)) return text;

  let cleaned = text;
  cleaned = cleaned.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  cleaned = cleaned.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  cleaned = cleaned.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  cleaned = cleaned.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  cleaned = cleaned.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  cleaned = cleaned.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
  cleaned = cleaned.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, "$1");
  cleaned = cleaned.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n");
  cleaned = cleaned.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  cleaned = cleaned.replace(/<\/?ul[^>]*>/gi, "\n");
  cleaned = cleaned.replace(/<\/?ol[^>]*>/gi, "\n");
  cleaned = cleaned.replace(/<[^>]+>/g, "");
  cleaned = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

function splitScriptIntoBeatChunks(fullScriptText: string, chunkSize = 10): string[] {
  if (!fullScriptText) return [];
  const beatRegex = /(?=(?:###?\s*)?(?:\*\*)?\s*BEAT\s*\d+)/i;
  const blocks = fullScriptText.split(beatRegex).filter((b) => b.trim().length > 0);

  if (blocks.length <= chunkSize) {
    return [fullScriptText];
  }

  const chunks: string[] = [];
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const group = blocks.slice(i, i + chunkSize);
    chunks.push(group.join("\n\n---\n\n"));
  }

  return chunks;
}

export function StoryboardGenerator({ scriptId, onPlanned }: { scriptId: string; onPlanned?: () => void }) {
  const router = useRouter();

  // The episode decides the script; there is nothing to pick.
  const [selectedScript] = useState(scriptId);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scripts, setScripts] = useState<DatabaseScript[]>([]);
  const [savedStoryboards, setSavedStoryboards] = useState<SavedStoryboard[]>([]);
  const [isFetchingScripts, setIsFetchingScripts] = useState(true);
  const [storyLocations, setStoryLocations] = useState<any[]>([]);
  const [storyCharacters, setStoryCharacters] = useState<any[]>([]);

  function getScriptLabel(script: DatabaseScript) {
    if (script.title) return script.title;
    const ep = script.episode_number ? `Episode ${script.episode_number}` : "";
    const topic = script.topic || "";
    if (ep && topic) return `${ep} - ${topic}`;
    if (topic) return topic;
    if (ep) return ep;
    return `Script #${script.id.slice(0, 8)}`;
  }

  useEffect(() => {
    async function fetchData() {
      try {
        setIsFetchingScripts(true);
        const [scriptResponse, savedRes] = await Promise.all([
          fetch("/api/scripts"),
          getSavedStoryboardsAction()
        ]);

        if (scriptResponse.ok) {
          const data = await scriptResponse.json();
          setScripts(data.scripts || []);
        }

        if (savedRes.success && savedRes.storyboards) {
          setSavedStoryboards(savedRes.storyboards);
        }
      } catch (err) {
        console.error("Failed to fetch storyboard data:", err);
      } finally {
        setIsFetchingScripts(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (!selectedScript) {
      setPrompt("");
      setStoryLocations([]);
      setStoryCharacters([]);
      return;
    }

    const scriptObj = scripts.find((s) => s.id === selectedScript);
    if (scriptObj && scriptObj.content) {
      setPrompt(stripHtmlToMarkdown(scriptObj.content));
    } else {
      setPrompt("");
    }

    async function loadEpisodeContext() {
      try {
        const res = await getStoryCharactersAndLocationsAction(scriptObj?.story_id || selectedScript);
        if (res.success) {
          setStoryLocations(res.locations || []);
          setStoryCharacters(res.characters || []);
        }
      } catch (err) {
        console.error("Error fetching story characters/locations:", err);
      }
    }
    loadEpisodeContext();
  }, [selectedScript, scripts]);

  async function handleGenerateStoryboard() {
    if (!selectedScript || !prompt.trim()) return;

    setIsLoading(true);
    setError(null);

    const locationPromptSection = storyLocations.length > 0
      ? `OFFICIAL EPISODE LOCATIONS & DESCRIPTIONS:
${storyLocations.map(l => `- "${l.name}": ${l.description || 'No visual description provided.'}`).join("\n")}

Assign the exact matching location name in the "location_name" field for each scene.`
      : "";

    // Character names double as reference-image keys downstream, so they must be copied exactly.
    const castPromptSection = storyCharacters.length > 0
      ? `OFFICIAL EPISODE CAST (exact names):
${storyCharacters.map(c => `- "${c.name}"`).join("\n")}

For each scene, list in "character_names" ONLY the characters who physically appear on screen in that scene's beats, copying their names EXACTLY as written above (character-for-character, no nicknames, no shortening). Do not list characters who are only mentioned, heard off-screen, or not in the cast list.`
      : "";

    // PASS 1: Detect all scenes across the ENTIRE script at once (100% natural scene boundaries)
    const pass1DetectPrompt = `You are a professional storyboard artist for a 3D animated children's series.

Analyze the provided beat script and group consecutive beats into visual scenes across the entire episode.

---

## SCENE GROUPING RULES
A scene is one storyboard sheet: a 2x2 grid with one panel per beat. Every beat is later generated as its own short video clip, so grouping only decides which beats share a sheet. Runtime does not limit a scene.
Group consecutive beats together when they share:
- The same physical location.
- The same time of day and lighting.
- Continuous character action or interaction.

CRITICAL GRID CAP (STRICT MAX ${MAX_BEATS_PER_SCENE} BEATS PER SCENE):
- A single scene MUST NOT contain more than ${MAX_BEATS_PER_SCENE} beats.
- If a continuous sequence in the same location contains more than ${MAX_BEATS_PER_SCENE} beats (e.g., Beats 17 through 24), you MUST split it into consecutive scenes (e.g., Scene 5: Beats 17-20, Scene 6: Beats 21-24).
- Split at a natural story boundary (the end of a small moment), never in the middle of an action.

ONE LOCATION AND ONE LIGHTING STATE PER SCENE (STRICT):
- Never put beats from two locations, from an interior and an exterior, or from two times of day into the same scene. The image model blends backgrounds and lighting across every panel of a sheet.
- Read each beat's location header (EXT/INT — LOCATION — TIME OF DAY). Start a new scene at every change of location, INT/EXT, or time of day, even when the current scene has only one beat.
- Different time-of-day words are different lighting states (for example LATE AFTERNOON and SUNSET, or DUSK and NIGHT), so those beats never share a scene.

Start a new scene when:
- The location or INT/EXT changes.
- The time of day or lighting changes.
- A new dramatic sequence starts.
- The beat count reaches ${MAX_BEATS_PER_SCENE} beats (split into a new scene sheet).

Every beat must belong to exactly ONE scene.
Never reorder, skip, duplicate, or omit any beats.
After grouping, verify every scene: no more than ${MAX_BEATS_PER_SCENE} beats, one location, one time of day.

${castPromptSection}

${locationPromptSection}

---

## OUTPUT FORMAT
Return ONLY valid JSON with this structure:
Return a compact plan only. Do NOT copy script text or generate storyboard image prompts in this pass.
Count ALL beats in the source, including the final beat, and put that count in total_beats. Beat numbering must be consecutive starting at 1. Include every beat through the ending.

{
  "total_beats": 3,
  "scenes": [
    {
      "scene_number": 1,
      "title": "Short descriptive scene title",
      "location_name": "Location Name",
      "character_names": ["Character Name 1", "Character Name 2"],
      "beat_numbers": [1, 2, 3]
    }
  ]
}

---

## BEAT SCRIPT
${prompt}`;

    try {
      // Execute Pass 1: Scene Detection
      const detectScenes = async (correction = "") => {
        const pass1Response = await callAi(pass1DetectPrompt + correction, 64000);
        const pass1Text = typeof pass1Response === "string" ? pass1Response : pass1Response?.text || "";
        return validateScenePlan(parseStoryboardJson(pass1Text));
      };
      const castNames = new Set(storyCharacters.map((c) => normalizeCharacterName(c.name || "")));
      const offCastNames = (plan: { character_names: string[] }[]) => Array.from(new Set(
        plan.flatMap((scene) => scene.character_names).filter((name) => !castNames.has(normalizeCharacterName(name)))
      ));

      let detectedScenes = await detectScenes();
      // A nickname or shortened name matches no cast member, so that character would get no
      // reference image. Ask once more, naming the mistake, and keep the better plan.
      const firstOffCast = castNames.size > 0 ? offCastNames(detectedScenes) : [];
      if (firstOffCast.length > 0) {
        const retried = await detectScenes(`\n\n---\n\nCORRECTION: a previous answer listed character names that are not in the cast list: ${firstOffCast.map((name) => `"${name}"`).join(", ")}. Copy names EXACTLY from the OFFICIAL EPISODE CAST list.`);
        if (offCastNames(retried).length < firstOffCast.length) detectedScenes = retried;
      }

      // PASS 2: Extract each scene's original beats and produce its image prompt.
      const sceneRequests = detectedScenes.map((scene, idx) => {
        const beatNums = scene.beat_numbers.join(", ");

        const { matched: sceneCast } = matchCharactersByName(storyCharacters, scene.character_names || []);
        const characterPromptSection = sceneCast.length > 0
          ? `CHARACTERS IN THIS SCENE (use these exact names; a reference image of each is attached to the image request):
${sceneCast.map(c => `- "${c.name}": ${c.description || 'Standard character'}`).join("\n")}

Refer to every character ONLY by the exact name in quotes above, every time (no nicknames, pronoun-only references, or role words like "father" in place of the name). Do NOT include any character not listed here. Do NOT describe their physical appearance (species, colors, face, hair, body, outfit) — the attached reference images define it. Describe only expression, pose, action and position in frame.`
          : storyCharacters.length > 0
          ? `No cast characters appear in this scene. Do NOT add any named characters.`
          : "";

        // Only this scene's location is described, so the prompt cannot blend two places.
        const sceneLocation = storyLocations.find(
          (l) => normalizeCharacterName(l.name || "") === normalizeCharacterName(scene.location_name || "")
        );
        const sceneLocationSection = sceneLocation
          ? `OFFICIAL LOCATION FOR THIS SCENE:
- "${sceneLocation.name}": ${sceneLocation.description || 'No visual description provided.'}`
          : locationPromptSection;

        // Panel N = the Nth beat. The video stage relies on this mapping to open each clip on its own panel.
        const beatCount = scene.beat_numbers.length;
        const isGrid = beatCount > 1;
        const panelMap = scene.beat_numbers.map((beat, i) => `Panel ${i + 1} = Beat ${beat}`).join(", ");
        const sparePanels = Array.from({ length: 4 - beatCount }, (_, i) => beatCount + i + 1);
        const layoutSection = isGrid
          ? `This scene has ${beatCount} beats, so the image is a 2x2 grid of exactly 4 panels. Never use any other layout (no 1x2, 1x3, 2x3 or 3x3).
- ${panelMap}. Each video clip later opens on its own panel, so never reorder, merge, or skip story panels.
${sparePanels.length > 0
  ? `- Panel${sparePanels.length > 1 ? "s" : ""} ${sparePanels.join(" and ")} ${sparePanels.length > 1 ? "are" : "is"} spare. Give each a real job from the same beats, location and lighting: an alternate take of a key shot, or a detail insert. Start a spare panel's description with "(spare)".`
  : "- All 4 panels are story panels."}`
          : `This scene has 1 beat, so the image is a single full-frame shot of Beat ${scene.beat_numbers[0]}. Do not create a grid, panels, or panel numbers.`;

        // Written here, not by the AI, so the image prompt never describes a character's looks in text.
        const charactersLine = sceneCast.length > 0
          ? `${sceneCast.map(c => c.name).join(", ")}. Each appears as exactly one individual, matching the attached reference images.`
          : "None.";
        const referenceLine = "Keep the characters and the location visually identical";
        const promptTemplate = isGrid
          ? `Create a single 4-panel 3D animation panel grid for a full-color 3D animated children's film, arranged in a 2x2 grid, landscape 16:9 per panel, one panel per camera shot.\\n\\nCharacters: ${charactersLine}\\n\\nSetting: [location name, then one line on the place, matching the attached location reference]\\n\\nAll panels: [time of day and one specific lighting phrase]\\n\\nPanel 1: [Shot size, angle] — [who is where, facing which way, doing what]\\n\\nPanel 2: ...\\n\\nPanel 3: ...\\n\\nPanel 4: ...\\n\\n${referenceLine} across all panels and matching the attached reference images — same faces, same proportions. Clean 3D CGI render in every panel. Label each panel with a small number in its corner.`
          : `Create a single full-frame 3D animation frame for a full-color 3D animated children's film, landscape 16:9.\\n\\nCharacters: ${charactersLine}\\n\\nSetting: [location name, then one line on the place, matching the attached location reference]\\n\\nLighting: [time of day and one specific lighting phrase]\\n\\nShot: [Shot size, angle] — [who is where, facing which way, doing what]\\n\\n${referenceLine} to the attached reference images — same faces, same proportions. Clean 3D CGI render. No text, labels, or panel borders.`;

        const pass2Prompt = `You are a professional storyboard artist for a 3D animated children's series.

Your task is to generate a production-ready storyboard image-generation prompt for Scene #${scene.scene_number || idx + 1}: "${scene.title || 'Scene'}".

---

## STRICT CHARACTER FIDELITY & NO FABRICATION RULE (CRITICAL)

1. NEVER INVENT, ASSUME, OR FABRICATE any physical traits, body mechanics, technological qualities, powers, or unstated equipment for any character.
2. DO NOT describe any character as a robot, machine, mechanical companion, or as having wheels, engines, metallic parts, glowing eyes, or spinning compasses UNLESS those exact traits are explicitly stated in the provided official character profile or beat script.
3. STRICT SINGLE-CHARACTER INSTANCE RULE (ANTI-CLONING / NO DUPLICATION):
   - NEVER CLONE, DUPLICATE, REPLICATE, OR RENDER MULTIPLE COPIES OF ANY CHARACTER IN THE SAME SCENE.
   - Every named character MUST appear as EXACTLY ONE (1) single individual character figure.
   - FORBIDDEN: DO NOT depict twin copies, cloned figures, or multiple instances of any character standing or hovering side-by-side. Describe every character strictly as a single unique individual figure.
4. For example: If a character is named "Tilli", DO NOT add "on wheels", "robot", "mechanical companion", or any unmentioned fantasy/scifi traits.
5. Character looks come from the attached reference images, not from text. Only describe expressions, posture, and physical actions relevant to each beat.

${characterPromptSection}

---

## STRICT LOCATION FIDELITY & NO FABRICATION RULE (CRITICAL)

1. NEVER INVENT OR FABRICATE futuristic, sci-fi, metallic, neon, or conflicting architectural features for any location.
2. Write the Setting line strictly from the official location description provided below and the beat script details.
3. The whole image shows one location in one lighting state (time of day, lighting, color palette, architectural style).

${sceneLocationSection}

---

## STRICT 3D CGI RENDER STYLE RULE (CRITICAL)

1. EVERY storyboard_prompt MUST explicitly start with 3D CGI animation render style keywords: "Full-color 3D CGI animation frame, Disney Pixar and DreamWorks feature film quality, Octane 3D render, smooth digital CGI character models, crisp lighting, zero pencil lines."
2. ABSOLUTELY FORBIDDEN: DO NOT use words that cause image generation models to render 2D hand-drawn sketches or pencil outlines. NEVER use keywords like "hand-drawn", "pencil sketch", "line art", "drawing", "illustration", "sketchbook", or "storybook sketch".
3. Always frame each shot as a polished 3D CGI animation frame.

---

## IMAGE LAYOUT (STRICT)

${layoutSection}

---

## SHOT DESCRIPTION RULES

- Start every panel or shot description with the shot size and angle of that beat's opening framing, taken from its CAMERA line, using only these terms. Shot size: wide shot, medium wide shot, medium shot, medium close-up, close-up, extreme close-up. Angle: eye level, low angle, high angle, over-the-shoulder, POV, child-eye height.
- Follow it with an em dash, then who is in frame, where they are, which way they face, and the one thing they are doing.
- Each description is a still frame: no camera movement, no "then", no second moment.
- One sentence each, at most 30 words. No decorative adjectives.
- Copy the template's Characters line exactly as written. Never add to it or describe a character's looks anywhere in the prompt.
- The Setting line is the location name plus at most 20 words. Do not copy the whole official description.
- State the time of day and lighting ONCE, in the single lighting line of at most 15 words. Never repeat lighting or describe the environment again inside a panel or shot description.
- Keep the whole storyboard_prompt under 260 words. A short, plain prompt produces a better image than a long one.

---

## TARGET SCENE DETAILS
Scene Number: ${scene.scene_number || idx + 1}
Title: ${scene.title || 'Scene'}
Location Name: ${scene.location_name || ''}
Beats Included: ${beatNums}

Use the FULL SOURCE BEAT SCRIPT appended below to extract ONLY Beats ${beatNums}.
Copy their complete original text verbatim into scene_script_beats, including headers, emotion, WPM, all dialogue and pause tags, ACTION, CAMERA, MOTION, SFX, and any existing fields. Do not summarize, rewrite, add, omit, or duplicate content.
Generate the storyboard image from ONLY those assigned beats, in the same order. The rest of the source script is context only and must not be included in this scene.

---

## OUTPUT FORMAT

Return ONLY valid JSON with this structure:

{
  "beat_numbers": ${JSON.stringify(scene.beat_numbers)},
  "scene_script_beats": "Complete verbatim source text of ONLY the assigned beats, in order. Escape newlines and quotes as valid JSON.",
  "storyboard_prompt": "Full-color 3D CGI animation frame, Disney Pixar and DreamWorks feature film quality, Octane 3D render, smooth digital CGI models, cinematic volumetric lighting, zero line art.\\n\\n${promptTemplate}"
}`;
        return { prompt: pass2Prompt, beatNumbers: scene.beat_numbers };
      });
      const generatedScenes = await generateStoryboardBatchAction(prompt, sceneRequests);
      const finalScenes = detectedScenes.map((scene, index) => ({ ...scene, ...generatedScenes[index] }));

      if (finalScenes.length > 0) {
        const payload = finalScenes.map((scene, idx) => ({
          scriptId: selectedScript,
          sceneNumber: scene.scene_number || idx + 1,
          title: scene.title,
          description: scene.title,
          storyboardPrompt: scene.storyboard_prompt,

          locationName: scene.location_name,
          characterNames: scene.character_names,
          beatNumbers: scene.beat_numbers,
          sceneScriptBeats: scene.scene_script_beats,
        }));

        const saveRes = await saveStoryboardScenesAction(payload);
        if (saveRes.success) {
          onPlanned?.();
          router.refresh();
        } else {
          setError(saveRes.error || "Failed to save initial storyboard scenes.");
        }
      } else {
        setError("Could not parse storyboard scenes from the AI response.");
      }
    } catch (err: any) {
      setError(err?.message || "An error occurred while generating storyboard prompts.");
    } finally {
      setIsLoading(false);
    }
  }

  const hasScript = Boolean(prompt.trim());

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>The storyboard was not planned</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <StepStart
        title="Plan the storyboard"
        description="Groups the script's beats into scenes of up to four beats in one location, and writes an image prompt for each scene. No images are generated yet; you review the prompts first."
        action={
          <Button onClick={handleGenerateStoryboard} disabled={isLoading || !hasScript}>
            {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {isLoading ? "Planning the storyboard…" : "Generate storyboard prompts"}
          </Button>
        }
        note={
          isLoading
            ? "This takes a few minutes for a full script. Keep this tab open."
            : isFetchingScripts
            ? "Loading the script…"
            : !hasScript
            ? "This episode's script is empty. Write it in the Script step first."
            : undefined
        }
      />
    </div>
  );
}
