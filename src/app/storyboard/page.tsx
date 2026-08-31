"use client";

import { 
  ImageIcon, 
  Loader2, 
  Sparkles, 
  Plus, 
  Clock, 
  ArrowRight, 
  ArrowLeft, 
  BookOpen, 
  Users, 
  User, 
  MapPin, 
  ExternalLink,
  ChevronDown,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { GlassPanel } from "@/components/GlassPanel";
import { labelClass, selectFieldClass, primaryButtonClass } from "@/lib/styles";
import { callAi } from "@/actions/actions";
import { saveStoryboardScenesAction, getSavedStoryboardsAction } from "@/actions/saveStoryboardAction";
import { getStoryCharactersAndLocationsAction } from "@/actions/saveStoryAction";
import { parseAiJson } from "@/lib/parseAiJson";


interface DatabaseScript {
  id: string;
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
  beat_numbers?: number[];
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

export default function StoryboardPage() {
  const router = useRouter();

  const [viewMode, setViewMode] = useState<'history' | 'create'>('history');
  const [selectedScript, setSelectedScript] = useState("");
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
        const res = await getStoryCharactersAndLocationsAction(selectedScript);
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

Assign the exact matching location name in the "location_name" field for each scene. Use these official location descriptions directly to populate the Environment section for each scene prompt.`
      : "";

    const characterPromptSection = storyCharacters.length > 0
      ? `OFFICIAL CHARACTER PROFILES FOR THIS STORY:
${storyCharacters.map(c => `- ${c.name}: ${c.description || 'Standard character'}`).join("\n")}`
      : "";

    const storyboardAiPrompt = `You are a professional storyboard artist for a 3D animated children's series.

Your task is to convert the provided beat script into storyboard scenes
and generate a production-ready storyboard image-generation prompt for
each scene.

---

## STRICT CHARACTER FIDELITY & NO FABRICATION RULE (CRITICAL)

1. NEVER INVENT, ASSUME, OR FABRICATE any physical traits, body mechanics, technological qualities, powers, or unstated equipment for any character.
2. DO NOT describe any character as a robot, machine, mechanical companion, or as having wheels, engines, metallic parts, glowing eyes, or spinning compasses UNLESS those exact traits are explicitly stated in the provided official character profile or beat script.
3. For example: If a character is named "Tilli", describe Tilli strictly as defined in the official character profile or script. DO NOT add "on wheels", "robot", "mechanical companion", or any unmentioned fantasy/scifi traits.
4. Keep all character descriptions 100% faithful to the official character profiles provided below. Only describe character clothing, expressions, posture, and physical actions relevant to each beat.

${characterPromptSection}

---

## STRICT LOCATION FIDELITY & NO FABRICATION RULE (CRITICAL)

1. NEVER INVENT OR FABRICATE futuristic, sci-fi, metallic, neon, or conflicting architectural features for any location.
2. Build each scene's Environment section strictly using the official location descriptions provided below and the beat script details.
3. Maintain environmental continuity (time of day, lighting, color palette, architectural style) across all panels in the same location.

---

## STRICT 3D CGI RENDER STYLE RULE (CRITICAL)

1. EVERY storyboard_prompt MUST explicitly start with 3D CGI animation render style keywords: "Full-color 3D CGI animation frame, Disney Pixar and DreamWorks feature film quality, Octane 3D render, smooth digital CGI character models, crisp lighting, zero pencil lines."
2. ABSOLUTELY FORBIDDEN: DO NOT use words that cause image generation models to render 2D hand-drawn sketches or pencil outlines. NEVER use keywords like "hand-drawn", "pencil sketch", "line art", "drawing", "illustration", "sketchbook", or "storybook sketch".
3. Always frame each shot as a polished 3D CGI animation frame.

---

## YOUR TASK

1. Group consecutive beats into coherent scenes.
2. Each scene should contain one or more consecutive beats.
3. Generate one storyboard prompt for each scene.
4. Each beat within a scene should become one storyboard panel.

---

## SCENE GROUPING

A scene is a continuous visual and dramatic sequence.

Group consecutive beats together when they share:

- The same physical location or closely connected setting.
- The same general time of day.
- Continuous character action or interaction.
- Strong visual and dramatic continuity.

Start a new scene when there is:

- A significant location change.
- A meaningful INT/EXT change.
- A significant time-of-day change.
- A major environmental change.
- A new dramatic sequence.

Every beat must belong to exactly one scene.

Never reorder, skip, duplicate, or modify beats.

---

## LOCATION ASSIGNMENT
${locationPromptSection}

---

## STORYBOARD PANELS

Each beat becomes exactly ONE storyboard panel.

---

## GRID SIZE

Choose the grid based on the number of beats in the scene:

1 beat → 1 panel
2 beats → 1x2 grid
3 beats → 1x3 grid
4 beats → 2x2 grid
5-6 beats → 2x3 grid

If a scene contains more than 6 beats, split the scene into
multiple storyboard sheets while preserving beat order.

---

## OUTPUT FORMAT

Return ONLY valid JSON.

Use exactly this structure:

{
  "scenes": [
    {
      "scene_number": 1,
      "title": "Short descriptive scene title",
      "location_name": "Location Name",
      "character_names": ["Character Name 1", "Character Name 2"],
      "beat_numbers": [1, 2, 3],
      "scene_script_beats": "Full exact text of all script beats grouped into this scene (including beat headers, [ACTION], [DIALOGUE], [CAMERA], [MOTION], and [SFX] lines).",
      "storyboard_prompt": "Complete prompt for generating this storyboard sheet."
    }
  ]
}

The storyboard_prompt MUST strictly follow this structure:

"Full-color 3D CGI animation frame, Disney Pixar and DreamWorks feature film quality, Octane 3D render, smooth digital CGI models, cinematic volumetric lighting, zero line art.

Create a [GRID] 3D animation panel grid, [NUMBER] panels, for a full-color 3D animated children's film.

Scene: [short scene description]

Environment: [location, time of day, lighting and important environmental details]

Characters: [characters present and strictly their appearance as explicitly defined in their official character profile without any added qualities or fictional traits]

Panel 1: [visual description based on Beat 1]

Panel 2: [visual description based on Beat 2]

...

Maintain 3D CGI visual continuity across all panels. Number each panel in the corner.

Style Directive: Clean 3D CGI digital animation render only. No 2D sketches, no pencil outlines, no hand-drawn artwork."

---

## BEAT SCRIPT

${prompt}`;

    try {
      const response = await callAi(storyboardAiPrompt, 8000);
      const rawText = typeof response === "string" ? response : response?.text || "";

      const parsed = parseAiJson(rawText);

      let scenesList: StoryboardScene[] = [];
      if (parsed && Array.isArray(parsed.scenes)) {
        scenesList = parsed.scenes;
      } else if (Array.isArray(parsed)) {
        scenesList = parsed;
      }


      if (scenesList.length > 0) {
        const payload = scenesList.map((scene, idx) => ({
          scriptId: selectedScript,
          sceneNumber: scene.scene_number || idx + 1,
          title: scene.title,
          description: scene.description || scene.title,
          storyboardPrompt: scene.storyboard_prompt,

          locationName: scene.location_name,
          characterNames: scene.character_names,
          episodeLocationId: scene.episodeLocationId,
        }));

        const saveRes = await saveStoryboardScenesAction(payload);
        if (saveRes.success) {
          router.push(`/storyboard/${selectedScript}`);
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

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={ImageIcon}
        title="Storyboard"
        highlight="Generator"
        description={
          viewMode === 'create'
            ? "Select an episode script to generate 3D CGI storyboard prompts."
            : "Browse existing episode storyboards or create a new one."
        }
      />


      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl text-sm font-medium flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {viewMode === 'create' ? (
        /* CREATE STORYBOARD FORM PANEL */
        <GlassPanel
          footer={
            <div className="flex w-full sm:w-auto items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleGenerateStoryboard}
                disabled={isLoading || !selectedScript || !prompt.trim()}
                className={primaryButtonClass}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
                    Generating Storyboard...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    Generate Storyboard Prompt
                  </>
                )}
              </button>
            </div>
          }
        >
          <div className="space-y-6 p-2">
            {/* Script Selection Dropdown */}
            <div className="space-y-3">
              <label className={labelClass}>
                <BookOpen className="w-4 h-4 text-primary" />
                Select Episode Script
              </label>
              <div className="relative">
                <select
                  value={selectedScript}
                  onChange={(e) => setSelectedScript(e.target.value)}
                  disabled={isFetchingScripts || isLoading}
                  className={selectFieldClass}
                >
                  <option value="">
                    {isFetchingScripts
                      ? "Loading scripts from database..."
                      : scripts.length === 0
                      ? "No scripts found in database"
                      : "Select a script from database"}
                  </option>
                  {scripts.map((script) => (
                    <option key={script.id} value={script.id}>
                      {getScriptLabel(script)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
              </div>
            </div>

            {/* Selected Script Details */}
            {selectedScript && (
              <div className="space-y-6 pt-4 border-t border-border/60 animate-in fade-in duration-300">
                {/* Characters Section */}
                {storyCharacters.length > 0 && (
                  <div className="space-y-3">
                    <label className={labelClass}>
                      <Users className="w-4 h-4 text-primary" />
                      Story Characters
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {storyCharacters.map((char: any, i: number) => {
                        const hasImage = Boolean(char.reference_image_url);
                        return (
                          <div 
                            key={char.id || i}
                            onClick={() => {
                              if (hasImage) {
                                window.open(char.reference_image_url, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className={`group p-3 rounded-xl bg-background/60 border border-border/60 flex items-center gap-3 transition-all ${
                              hasImage 
                                ? 'cursor-pointer hover:border-primary/60 hover:bg-background/80 hover:scale-[1.01] active:scale-[0.99]' 
                                : 'hover:border-primary/40'
                            }`}
                            title={hasImage ? `Click to view ${char.name || 'character'} image in new tab` : undefined}
                          >
                            {hasImage ? (
                              <img 
                                src={char.reference_image_url} 
                                alt={char.name || 'Character'} 
                                className="w-10 h-10 rounded-full object-cover border border-primary/30 shrink-0 group-hover:border-primary transition-colors"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                                <User className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm text-foreground truncate flex items-center justify-between gap-1">
                                <span className="truncate">{char.name || 'Unnamed Character'}</span>
                                {hasImage && (
                                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:text-primary shrink-0 transition-opacity" />
                                )}
                              </div>
                              {char.description && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {char.description}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Locations Section */}
                {storyLocations.length > 0 && (
                  <div className="space-y-3">
                    <label className={labelClass}>
                      <MapPin className="w-4 h-4 text-emerald-500" />
                      Episode Locations
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {storyLocations.map((loc: any, i: number) => {
                        const hasImage = Boolean(loc.Location?.generated_image_url || loc.Location?.reference_image_url);
                        const imgUrl = loc.Location?.generated_image_url || loc.Location?.reference_image_url;
                        return (
                          <div 
                            key={loc.id || i}
                            onClick={() => {
                              if (hasImage) {
                                window.open(imgUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className={`group p-3 rounded-xl bg-background/60 border border-border/60 flex items-center gap-3 transition-all ${
                              hasImage 
                                ? 'cursor-pointer hover:border-emerald-500/60 hover:bg-background/80 hover:scale-[1.01] active:scale-[0.99]' 
                                : 'hover:border-emerald-500/40'
                            }`}
                            title={hasImage ? `Click to view ${loc.name || 'location'} image in new tab` : undefined}
                          >
                            {hasImage ? (
                              <img 
                                src={imgUrl} 
                                alt={loc.name || 'Location'} 
                                className="w-10 h-10 rounded-lg object-cover border border-emerald-500/30 shrink-0 group-hover:border-emerald-500 transition-colors"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-sm shrink-0">
                                <MapPin className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm text-foreground truncate flex items-center justify-between gap-1">
                                <span className="truncate">{loc.name || 'Unnamed Location'}</span>
                                {hasImage && (
                                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:text-emerald-500 shrink-0 transition-opacity" />
                                )}
                              </div>
                              {loc.description && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {loc.description}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Beat Script Preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className={labelClass}>
                      <BookOpen className="w-4 h-4 text-primary" />
                      Beat Script Content
                    </label>
                    <span className="text-xs text-muted-foreground">Editable</span>
                  </div>

                  <textarea
                    rows={10}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Beat script content will populate here..."
                    className="min-h-[220px] w-full resize-y rounded-xl border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary font-sans leading-relaxed text-foreground"
                  />
                </div>
              </div>
            )}
          </div>
        </GlassPanel>
      ) : (
        /* HISTORY GRID VIEW (MATCHING SCRIPT GENERATE PAGE) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Create New Storyboard Card */}
          <div
            onClick={() => {
              setSelectedScript('');
              setPrompt('');
              setStoryCharacters([]);
              setStoryLocations([]);
              setViewMode('create');
            }}
            className="cursor-pointer flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors min-h-[200px]"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-primary">Create New Storyboard</h3>
            <p className="text-sm text-muted-foreground mt-1 text-center">Generate 3D CGI prompts for a script</p>
          </div>

          {/* Existing Saved Storyboards Cards */}
          {savedStoryboards.map((sb) => (
            <div
              key={sb.id}
              onClick={() => router.push(`/storyboard/${sb.id}`)}
              className="cursor-pointer flex flex-col p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-all min-h-[200px] justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-primary/10 text-primary">
                    {sb.episode_number ? `Episode ${sb.episode_number}` : 'Episode'}
                  </span>
                  {sb.generated_at && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(sb.generated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 line-clamp-2">
                  {sb.topic || `Storyboard #${sb.id.slice(0, 8)}`}
                </h3>
              </div>
              <div className="mt-auto pt-4 border-t border-border/50 text-sm font-medium text-primary flex items-center gap-1.5 group-hover:translate-x-0.5 transition-transform">
                Open Storyboard <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Page Loader Overlay for Storyboard Generation */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-start pt-[180px] bg-background/80 backdrop-blur-md transition-all animate-in fade-in-0 duration-200">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-border/80 shadow-2xl max-w-sm text-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <Loader2 className="w-10 h-10 animate-spin text-primary relative z-10" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-semibold text-base text-foreground">Generating Storyboard</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Converting beat script into production-ready 3D CGI storyboard prompts and opening editor...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}