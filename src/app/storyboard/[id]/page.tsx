"use client";

import Link from "next/link";
import { Image as ImageIcon, Loader2, Sparkles, Check, LayoutGrid, CheckCheck, Send, MessageSquareText, MapPin } from "lucide-react";
import { useEffect, useState, useRef, use } from "react";

import { PageHeader } from "@/components/PageHeader";
import { callAi } from "@/actions/actions";
import { saveStoryboardScenesAction, getStoryboardByStoryIdAction } from "@/actions/saveStoryboardAction";
import { brainstormStoryboardAction } from "@/actions/brainstormStoryboardAction";


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

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  summary?: string;
  updatedScenes?: StoryboardScene[];
}

function stripHtmlToMarkdown(html: string): string {
  if (!html) return "";
  let cleaned = html;
  cleaned = cleaned.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n");
  cleaned = cleaned.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n");
  cleaned = cleaned.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n\n");
  cleaned = cleaned.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  cleaned = cleaned.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  cleaned = cleaned.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
  cleaned = cleaned.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*");
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

function extractSceneBeats(fullScriptText: string, targetBeatNumbers?: number[]): string {
  if (!fullScriptText) return "";

  const beatBlocks = fullScriptText.split(/(?=(?:###?\s*)?(?:\*\*)?\s*BEAT\s*\d+)/i);

  if (targetBeatNumbers && targetBeatNumbers.length > 0) {
    const matchedBlocks = beatBlocks.filter((block) => {
      const match = block.match(/BEAT\s*(\d+)/i);
      if (!match) return false;
      const num = parseInt(match[1], 10);
      return targetBeatNumbers.includes(num);
    });

    if (matchedBlocks.length > 0) {
      return matchedBlocks.map((b) => b.trim()).join("\n\n---\n\n");
    }
  }

  const validBeatBlocks = beatBlocks.filter((block) => /BEAT\s*\d+/i.test(block));
  if (validBeatBlocks.length > 0) {
    return validBeatBlocks.slice(0, 1).map((b) => b.trim()).join("\n\n---\n\n");
  }

  return fullScriptText.trim();
}

export default function StoryboardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [generatedScenes, setGeneratedScenes] = useState<StoryboardScene[]>([]);
  const [storyLocations, setStoryLocations] = useState<any[]>([]);
  const [storyCharacters, setStoryCharacters] = useState<any[]>([]);
  
  // Confirmation state
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);


  // Brainstorm Chat Assistant State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [isAiChatLoading, setIsAiChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

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
    async function loadStoryboard() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await getStoryboardByStoryIdAction(id);
        if (res.success) {
          if (res.scriptContent) setPrompt(stripHtmlToMarkdown(res.scriptContent));
          if (res.scenes && res.scenes.length > 0) setGeneratedScenes(res.scenes);
          if (res.locations) setStoryLocations(res.locations);
          if (res.characters) setStoryCharacters(res.characters);

          setChatHistory([
            {
              role: 'ai',
              content: 'Welcome to Storyboard Brainstorm Assistant! Ask questions or request refinements (e.g. camera framing, lighting, poses) to brainstorm your prompts.'
            }
          ]);
        } else {
          setError(res.error || "Failed to load storyboard data.");
        }
      } catch (err: any) {
        console.error("Error loading storyboard details:", err);
        setError(err?.message || "Failed to load storyboard.");
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      loadStoryboard();
    }
  }, [id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAiChatLoading]);

  function handlePromptChange(index: number, newPrompt: string) {
    setGeneratedScenes((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], storyboard_prompt: newPrompt };
      return updated;
    });
  }

  async function handleConfirmSingle(index: number) {
    const sceneToSave = generatedScenes[index];
    if (!sceneToSave) return;

    setConfirmingIndex(index);
    setError(null);
    setSuccessBanner(null);

    try {
      const payload = [{
        scriptId: id,
        sceneNumber: sceneToSave.scene_number || index + 1,
        title: sceneToSave.title,
        description: sceneToSave.description,
        storyboardPrompt: sceneToSave.storyboard_prompt,
        locationName: sceneToSave.location_name,
        characterNames: sceneToSave.character_names,
        episodeLocationId: sceneToSave.episodeLocationId,
      }];

      const res = await saveStoryboardScenesAction(payload);

      if (res.success) {
        setSuccessBanner(`Scene #${sceneToSave.scene_number || index + 1} confirmed and saved!`);
        setTimeout(() => setSuccessBanner(null), 5000);
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
    if (generatedScenes.length === 0) return;

    setIsConfirmingAll(true);
    setError(null);
    setSuccessBanner(null);

    try {
      const payload = generatedScenes.map((scene, idx) => ({
        scriptId: id,
        sceneNumber: scene.scene_number || idx + 1,
        title: scene.title,
        description: scene.description,
        storyboardPrompt: scene.storyboard_prompt,
        locationName: scene.location_name,
        characterNames: scene.character_names,
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
  }

  return (
    <div className="max-w-[1400px] w-full mx-auto space-y-6 page-enter pb-10">
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

      {/* STORYBOARD FULL-PAGE VIEW MODE WITH SPLIT LAYOUT (Scene Cards + Brainstorm Assistant) */}
      {generatedScenes.length > 0 ? (
        <div className="space-y-6">
          {/* Top Control Bar */}
          <div className="flex items-center justify-end gap-3 flex-wrap">
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
                        {scene.location_name && (
                          <div className="flex items-center gap-1.5 bg-muted/60 px-3 py-1 rounded-full border border-border/50 text-xs font-semibold text-foreground">
                            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>{scene.location_name}</span>
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
      ) : !isLoading ? (
        <div className="p-12 text-center bg-card border border-border rounded-2xl space-y-3">
          <p className="text-muted-foreground text-sm">No storyboard scenes found for this story.</p>
          <Link
            href="/storyboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
          >
            Generate Storyboard
          </Link>
        </div>
      ) : null}

      {/* Full Page Loader Overlay for Page Loading */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-start pt-[180px] bg-background/80 backdrop-blur-md transition-all animate-in fade-in-0 duration-200">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-border/80 shadow-2xl max-w-sm text-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <Loader2 className="w-10 h-10 animate-spin text-primary relative z-10" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-semibold text-base text-foreground">Loading Storyboard</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Loading saved 3D CGI storyboard prompts and scene data...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

