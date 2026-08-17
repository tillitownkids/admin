"use client";

import { Image as ImageIcon, Loader2, Sparkles, Check, LayoutGrid, CheckCheck, Send, MessageSquareText, MapPin } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { callAi } from "@/actions/actions";
import { saveStoryboardScenesAction } from "@/actions/saveStoryboardAction";
import { brainstormStoryboardAction } from "@/actions/brainstormStoryboardAction";
import { getStoryCharactersAndLocationsAction } from "@/actions/saveStoryAction";

interface DatabaseScript {
  id: string;
  topic?: string;
  episode_number?: string;
  title?: string;
  content?: string;
  status?: string;
  generated_at?: string;
}

interface StoryboardScene {
  scene_number: number;
  title: string;
  beat_numbers?: number[];
  description?: string;
  storyboard_prompt: string;
  location_name?: string;
  episodeLocationId?: string;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  summary?: string;
  updatedScenes?: StoryboardScene[];
}

export default function StoryboardPage() {
  const [viewMode, setViewMode] = useState<'form' | 'storyboard'>('form');
  const [selectedScript, setSelectedScript] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scripts, setScripts] = useState<DatabaseScript[]>([]);
  const [isFetchingScripts, setIsFetchingScripts] = useState(true);
  const [generatedScenes, setGeneratedScenes] = useState<StoryboardScene[]>([]);
  const [storyLocations, setStoryLocations] = useState<any[]>([]);
  
  // Confirmation state
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Brainstorm Chat Assistant State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [isAiChatLoading, setIsAiChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  function getScriptLabel(script: DatabaseScript) {
    if (script.title) return script.title;
    const ep = script.episode_number ? `Episode ${script.episode_number}` : "";
    const topic = script.topic || "";
    if (ep && topic) return `${ep} - ${topic}`;
    if (topic) return topic;
    if (ep) return ep;
    return `Script #${script.id.slice(0, 8)}`;
  }

  function getGridBadge(beatCount: number) {
    if (beatCount === 1) return "1 Panel";
    if (beatCount === 2) return "1x2 Grid";
    if (beatCount === 3) return "1x3 Grid";
    if (beatCount === 4) return "2x2 Grid";
    if (beatCount >= 5 && beatCount <= 6) return "2x3 Grid";
    if (beatCount > 6) return `${beatCount} Panels (Multi-sheet)`;
    return `${beatCount} Panels`;
  }

  useEffect(() => {
    async function fetchScripts() {
      try {
        setIsFetchingScripts(true);
        const scriptResponse = await fetch("/api/scripts");
        if (scriptResponse.ok) {
          const data = await scriptResponse.json();
          setScripts(data.scripts || []);
        }
      } catch (err) {
        console.error("Failed to fetch scripts:", err);
      } finally {
        setIsFetchingScripts(false);
      }
    }

    fetchScripts();
  }, []);

  useEffect(() => {
    if (!selectedScript) {
      setPrompt("");
      setGeneratedScenes([]);
      setStoryLocations([]);
      setSuccessBanner(null);
      setChatHistory([]);
      return;
    }

    const scriptObj = scripts.find((s) => s.id === selectedScript);
    if (scriptObj) {
      let text = scriptObj.content || "";
      try {
        const parsed = typeof text === "string" ? JSON.parse(text) : text;
        if (typeof parsed === "object" && parsed !== null) {
          text = parsed.text || parsed.script || parsed.formattedContent || JSON.stringify(parsed, null, 2);
        }
      } catch {
        // text is plain text string
      }
      setPrompt(text);
      setGeneratedScenes([]);
      setSuccessBanner(null);
      setChatHistory([]);

      // Fetch linked locations for this script/story
      getStoryCharactersAndLocationsAction(selectedScript)
        .then((res) => {
          if (res.success && res.locations) {
            setStoryLocations(res.locations);
          }
        })
        .catch(() => setStoryLocations([]));
    }
  }, [selectedScript, scripts]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAiChatLoading]);

  function handlePromptChange(index: number, newPrompt: string) {
    setGeneratedScenes((prev) =>
      prev.map((sc, i) => (i === index ? { ...sc, storyboard_prompt: newPrompt } : sc))
    );
  }

  function handleLocationChange(index: number, locationName: string) {
    const matched = storyLocations.find(l => l.name === locationName);
    setGeneratedScenes((prev) =>
      prev.map((sc, i) => (i === index ? { ...sc, location_name: locationName, episodeLocationId: matched?.id || matched?.location_id } : sc))
    );
  }

  async function handleConfirmSingle(index: number) {
    if (!selectedScript) return;
    const scene = generatedScenes[index];
    if (!scene) return;

    setConfirmingIndex(index);
    setError(null);
    setSuccessBanner(null);

    try {
      const res = await saveStoryboardScenesAction([
        {
          scriptId: selectedScript,
          sceneNumber: scene.scene_number || index + 1,
          title: scene.title,
          description: scene.description,
          storyboardPrompt: scene.storyboard_prompt,
          locationName: scene.location_name,
          episodeLocationId: scene.episodeLocationId,
        },
      ]);

      if (res.success) {
        setSuccessBanner(`Scene #${scene.scene_number || index + 1} prompt confirmed and saved!`);
        setTimeout(() => setSuccessBanner(null), 4000);
      } else {
        setError(res.error || "Failed to confirm scene prompt.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save confirmed prompt.");
    } finally {
      setConfirmingIndex(null);
    }
  }

  async function handleConfirmAll() {
    if (!selectedScript || generatedScenes.length === 0) return;

    setIsConfirmingAll(true);
    setError(null);
    setSuccessBanner(null);

    try {
      const payload = generatedScenes.map((scene, idx) => ({
        scriptId: selectedScript,
        sceneNumber: scene.scene_number || idx + 1,
        title: scene.title,
        description: scene.description,
        storyboardPrompt: scene.storyboard_prompt,
        locationName: scene.location_name,
        episodeLocationId: scene.episodeLocationId,
      }));

      const res = await saveStoryboardScenesAction(payload);

      if (res.success) {
        setSuccessBanner(`All ${generatedScenes.length} storyboard scene prompts confirmed and saved!`);
        setTimeout(() => setSuccessBanner(null), 5000);
      } else {
        setError(res.error || "Failed to confirm all scene prompts.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save confirmed prompts.");
    } finally {
      setIsConfirmingAll(false);
    }
  }

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = userQuery.trim();
    if (!query || isAiChatLoading) return;

    setUserQuery("");
    setChatHistory((prev) => [...prev, { role: 'user', content: query }]);
    setIsAiChatLoading(true);

    try {
      const res = await brainstormStoryboardAction(prompt, generatedScenes, query);

      if (res.success && res.summary) {
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'ai',
            content: res.summary || "Updated scenes according to your request.",
            updatedScenes: res.updatedScenes
          }
        ]);
      } else {
        setChatHistory((prev) => [
          ...prev,
          { role: 'ai', content: res.error || "Could not process brainstorm request." }
        ]);
      }
    } catch (err) {
      console.error("Brainstorm error:", err);
      setChatHistory((prev) => [
        ...prev,
        { role: 'ai', content: "An error occurred while brainstorming with AI." }
      ]);
    } finally {
      setIsAiChatLoading(false);
    }
  }

  function handleMergeChanges(aiScenes?: StoryboardScene[]) {
    if (!aiScenes || aiScenes.length === 0) return;

    setGeneratedScenes((prevScenes) => {
      return prevScenes.map((existingScene, idx) => {
        const existingNum = existingScene.scene_number || idx + 1;

        const matchingAiScene = aiScenes.find((aiSc, aiIdx) => {
          const aiNum = aiSc.scene_number || (aiScenes.length === 1 ? existingNum : aiIdx + 1);
          return aiNum === existingNum;
        });

        if (matchingAiScene) {
          return {
            ...existingScene,
            ...matchingAiScene,
            storyboard_prompt: matchingAiScene.storyboard_prompt || existingScene.storyboard_prompt,
          };
        }

        return existingScene;
      });
    });

    setSuccessBanner("Merged AI brainstorm changes into storyboard prompts!");
    setTimeout(() => setSuccessBanner(null), 4000);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessBanner(null);

    const locationPromptSection = storyLocations.length > 0
      ? `AVAILABLE LOCATIONS FOR THIS EPISODE:
${storyLocations.map(l => `- "${l.name}"`).join("\n")}

Assign the exact matching location name in the "location_name" field for each scene.`
      : "";

    const storyboardAiPrompt = `You are a professional storyboard artist for a 3D animated children's series.

Your task is to convert the provided beat script into storyboard scenes
and generate a production-ready storyboard image-generation prompt for
each scene.

The ONLY input available to you is the beat script.

Do not assume that character reference images, location reference images,
style sheets, or other external assets are available.

Use only the information explicitly present in the beat script.

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
      "beat_numbers": [1, 2, 3],
      "storyboard_prompt": "Complete prompt for generating this storyboard sheet."
    }
  ]
}

The storyboard_prompt should follow this structure:

"Create a [GRID] storyboard grid, [NUMBER] panels, for a full-color
3D animated children's film.

Scene: [short scene description]

Environment: [location, time of day, lighting and important environmental details]

Characters: [characters present and their appearance as described in the script]

Panel 1: [visual description based on Beat 1]

Panel 2: [visual description based on Beat 2]

...

Maintain visual continuity across all panels. Number each panel in the corner."

---

## BEAT SCRIPT

${prompt}`;

    try {
      const response = await callAi(storyboardAiPrompt);
      const rawText = typeof response === "string" ? response : response?.text || "";

      const cleanedJson = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleanedJson);

      let scenesList: StoryboardScene[] = [];
      if (parsed && Array.isArray(parsed.scenes)) {
        scenesList = parsed.scenes;
      } else if (Array.isArray(parsed)) {
        scenesList = parsed;
      }

      if (scenesList.length > 0) {
        setGeneratedScenes(scenesList);
        setChatHistory([
          {
            role: 'ai',
            content: 'Welcome to Storyboard Brainstorm Assistant! Ask questions or request refinements (e.g. camera framing, lighting, poses) to brainstorm your prompts.'
          }
        ]);
        setViewMode('storyboard');
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
    <div className="max-w-[1400px] w-full mx-auto space-y-6 page-enter pb-10">
      {/* FORM VIEW MODE: Script Selection & Prompt */}
      {viewMode === 'form' && (
        <>
          <PageHeader
            icon={ImageIcon}
            title="Storyboard"
            highlight="Generation"
            description="Select an episode script to generate and edit production storyboard scene prompts."
          />

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
                  Script
                </label>
                <div className="relative">
                  <select 
                    value={selectedScript}
                    onChange={(e) => setSelectedScript(e.target.value)}
                    disabled={isFetchingScripts}
                    className="w-full appearance-none bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer hover:bg-background text-foreground disabled:opacity-50"
                  > 
                    <option value="">
                      {isFetchingScripts
                        ? "Loading scripts from database..."
                        : scripts.length === 0
                        ? "No scripts found in database"
                        : "Select a script"}
                    </option>
                    {scripts.map((script) => (
                      <option key={script.id} value={script.id}>
                        {getScriptLabel(script)}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4"></path></svg>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-end">
                  <span className="text-xs text-muted-foreground">Editable</span>
                </div>

                <textarea
                  rows={14}
                  value={prompt}
                  disabled={!selectedScript}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Select a script to load its prompt..."
                  className="min-h-[300px] w-full resize-y rounded-xl border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary font-sans leading-relaxed"
                />
              </div>

              {error && (
                <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl text-sm font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !selectedScript || !prompt.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating Storyboard Prompts...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Storyboard Prompt
                  </>
                )}
              </button>
            </form>
          </div>
        </>
      )}

      {/* STORYBOARD FULL-PAGE VIEW MODE WITH SPLIT LAYOUT (Scene Cards + Brainstorm Assistant) */}
      {viewMode === 'storyboard' && generatedScenes.length > 0 && (
        <div className="space-y-6">
          <PageHeader
            icon={ImageIcon}
            title="Storyboard"
            highlight="Brainstorm"
            description="Refine complete prompt specifications for each scene and confirm them to save to database."
          />

          {error && (
            <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {successBanner && (
            <div className="p-4 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl text-sm font-medium flex items-center gap-2">
              <Check className="w-4 h-4" />
              {successBanner}
            </div>
          )}

          {/* Top Control Bar */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleConfirmAll}
              disabled={isConfirmingAll || confirmingIndex !== null}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-sm hover:bg-primary/90 transition disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isConfirmingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Confirming All Prompts...
                </>
              ) : (
                <>
                  <CheckCheck className="w-4 h-4" />
                  Confirm All Prompts ({generatedScenes.length})
                </>
              )}
            </button>
          </div>

          {/* Split Grid Layout: Left Column (Scene Cards) & Right Column (Brainstorm Assistant) */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            {/* Left Column: Storyboard Scene Cards (3 cols) */}
            <div className="lg:col-span-3 space-y-6">
              {generatedScenes.map((scene, idx) => {
                const sceneNum = scene.scene_number || idx + 1;
                const isSavingThis = confirmingIndex === idx;

                return (
                  <div
                    key={idx}
                    className="bg-card border border-border/80 hover:border-primary/30 rounded-2xl p-6 shadow-sm space-y-4 transition-all"
                  >
                    {/* Scene Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 text-xs font-bold rounded-lg shrink-0">
                          Scene #{sceneNum}
                        </span>
                        <h3 className="text-lg font-bold text-foreground">
                          {scene.title || `Scene ${sceneNum}`}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        {storyLocations.length > 0 && (
                          <div className="flex items-center gap-1.5 bg-muted/60 px-3 py-1 rounded-full border border-border/50 text-xs">
                            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                            <select
                              value={scene.location_name || storyLocations[0]?.name || ""}
                              onChange={(e) => handleLocationChange(idx, e.target.value)}
                              className="bg-transparent font-medium text-foreground outline-none cursor-pointer"
                            >
                              {storyLocations.map((loc) => (
                                <option key={loc.id} value={loc.name}>
                                  {loc.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {scene.beat_numbers && scene.beat_numbers.length > 0 && (
                          <>
                            <span className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full font-medium">
                              Beats: {scene.beat_numbers.join(", ")}
                            </span>
                            <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full font-semibold flex items-center gap-1">
                              <LayoutGrid className="w-3 h-3" />
                              {getGridBadge(scene.beat_numbers.length)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Storyboard Prompt Editor */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary block">
                        Storyboard Prompt
                      </span>
                      <textarea
                        ref={(el) => {
                          if (el) {
                            el.style.height = "auto";
                            el.style.height = `${el.scrollHeight}px`;
                          }
                        }}
                        value={scene.storyboard_prompt}
                        onChange={(e) => {
                          e.target.style.height = "auto";
                          e.target.style.height = `${e.target.scrollHeight}px`;
                          handlePromptChange(idx, e.target.value);
                        }}
                        placeholder="Refine complete prompt specification for generating this storyboard sheet..."
                        className="w-full overflow-hidden resize-none rounded-xl border bg-background px-4 py-3 text-sm font-sans leading-relaxed text-foreground outline-none transition focus:border-primary"
                      />
                    </div>

                    {/* Scene Card Footer Actions */}
                    <div className="flex items-center justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => handleConfirmSingle(idx)}
                        disabled={isSavingThis || isConfirmingAll}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {isSavingThis ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Confirming & Saving...
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Confirm 1 Prompt
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Brainstorm Assistant Side Panel (2 cols) */}
            <div className="lg:col-span-2 rounded-2xl border border-border/70 bg-card/60 flex flex-col overflow-hidden h-[600px] sticky top-20 shadow-sm">
              <div className="p-3.5 bg-muted/40 border-b border-border/50 flex items-center justify-between shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  Brainstorm Assistant
                </span>
                <span className="text-[11px] text-muted-foreground font-medium">Interactive AI</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground gap-2">
                    <MessageSquareText className="w-8 h-8 text-primary/40" />
                    <p className="text-xs">Ask questions or request edits to refine storyboard prompts with AI.</p>
                  </div>
                ) : (
                  chatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`px-3.5 py-2.5 rounded-2xl text-xs max-w-[90%] ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-none font-medium'
                          : 'bg-background text-foreground border border-border/60 rounded-bl-none shadow-sm space-y-2'
                      }`}>
                        {msg.role === 'ai' ? (
                          <div className="space-y-2.5">
                            <p className="leading-relaxed">{msg.content}</p>

                            {/* Merge Changes Button */}
                            {msg.updatedScenes && msg.updatedScenes.length > 0 && (
                              <div className="pt-2 border-t border-border/40">
                                <button
                                  type="button"
                                  onClick={() => handleMergeChanges(msg.updatedScenes)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
                                  title="Merge AI updated scene prompts onto the storyboard editor"
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                                  Merge Changes
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isAiChatLoading && (
                  <div className="flex justify-start">
                    <div className="px-3.5 py-2.5 rounded-2xl text-xs bg-background text-foreground border border-border/60 rounded-bl-none flex items-center gap-2 shadow-sm">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                      <span>Brainstorming edits...</span>
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input Form */}
              <form onSubmit={handleChatSubmit} className="p-3 bg-background border-t border-border/50 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Ask or request a prompt edit (e.g. camera framing, lighting)..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl text-xs bg-muted/40 border border-border/60 focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground"
                  disabled={isAiChatLoading}
                />
                <button
                  type="submit"
                  disabled={!userQuery.trim() || isAiChatLoading}
                  className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shrink-0 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}