"use client";

import { callAi } from "@/actions/actions";
import { PageHeader } from "@/components/PageHeader";
import { GlassPanel } from "@/components/GlassPanel";
import { BrainstormModal } from "@/components/story/BrainstormModal";
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/lib/styles";
import { useState } from "react";
import { Sparkles, BookOpen, FileText, GraduationCap, Loader2, X, Copy, Check, Wand2, RefreshCw } from "lucide-react";

interface ScriptInput {
  Concept: string;
  Overview: string;
  Lesson: string;
}

export default function StoryPage() {
  const [data, setData] = useState<ScriptInput>({
    Concept: "",
    Overview: "",
    Lesson: "",
  });

  const [storyData, setStoryData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isBrainstormModalOpen, setIsBrainstormModalOpen] = useState<boolean>(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const value = e.target.value;
    const name = e.target.name;
    setData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!data.Concept.trim() && !data.Overview.trim() && !data.Lesson.trim()) {
      setError("Please fill in at least one of the fields before generating.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setIsLoading(true);
    setError(null);

    const prompt = `
You are a creative director and storyteller for the children's animated show "Tilli & Jaksh."

You are given:
- Story Concept: ${data.Concept}
- Story Overview: ${data.Overview}
- Lesson to be Taught: ${data.Lesson}

Write the complete story for this episode as a warm, flowing bedtime-style narrative suitable for 5-year-olds.

Requirements:
- Build the story around the provided concept and overview while naturally conveying the given lesson.
- Stay fully consistent with the attached story bible, including all locked character designs, personalities, locations, and world rules.
- Reuse existing characters and locations whenever possible. If something new is required, introduce it clearly and naturally so it fits the world.
- Include natural dialogue for every character involved, matching each character's established personality and speaking style.
- Give the story a clear beginning, middle, and satisfying ending.
- Let the lesson emerge naturally through the characters' actions and experiences rather than stating it directly.
- Do NOT include camera directions, production notes, scene headings, or screenplay formatting. Write only the narrative story.

End the output with a one-paragraph recap of this episode so it can be used to prepare the next episode.`;

    try {
      const response = await callAi(prompt);
      if (response?.text) {
        setStoryData(response.text);
        setIsBrainstormModalOpen(true);
      } else {
        setError("No response text returned from AI.");
      }
    } catch (err: any) {
      console.error("Error generating story:", err);
      setError(err?.message || "An error occurred while generating the story.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopy() {
    if (!storyData) return;
    navigator.clipboard.writeText(storyData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClear() {
    setData({ Concept: "", Overview: "", Lesson: "" });
    setStoryData(null);
    setError(null);
  }

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={Wand2}
        title="Story"
        highlight="Generator"
        description="Craft warm bedtime stories for Tilli & Jaksh driven by custom concepts, overviews, and lessons."
      />

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center justify-between animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <X className="w-4 h-4 cursor-pointer" onClick={() => setError(null)} />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-destructive/80 hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <GlassPanel
        footer={
          <div className="flex w-full items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleClear}
              className={secondaryButtonClass}
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4" />
              Reset Form
            </button>
            <button
              type="submit"
              form="story-form"
              disabled={isLoading}
              className={`${primaryButtonClass} group`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Story...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
                  Generate Story
                </>
              )}
            </button>
          </div>
        }
      >
        <form id="story-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className={labelClass}>
              <Sparkles className="w-4 h-4 text-primary" />
              Concept
            </label>
            <textarea
              name="Concept"
              value={data.Concept}
              onChange={handleChange}
              rows={3}
              className={fieldClass}
              placeholder="Enter the core story concept or premise..."
            />
          </div>

          <div className="space-y-2">
            <label className={labelClass}>
              <FileText className="w-4 h-4 text-primary" />
              Story Overview
            </label>
            <textarea
              name="Overview"
              value={data.Overview}
              onChange={handleChange}
              rows={4}
              className={fieldClass}
              placeholder="Outline key events, character actions, and plot progression..."
            />
          </div>

          <div className="space-y-2">
            <label className={labelClass}>
              <GraduationCap className="w-4 h-4 text-primary" />
              Teach Lesson
            </label>
            <textarea
              name="Lesson"
              value={data.Lesson}
              onChange={handleChange}
              rows={3}
              className={fieldClass}
              placeholder="Moral or key educational takeaway (e.g. sharing, honesty, kindness)..."
            />
          </div>
        </form>
      </GlassPanel>

      {storyData && (
        <GlassPanel className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between pb-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-lg text-foreground">Generated Narrative Story</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsBrainstormModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Brainstorm this idea
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/60 hover:bg-secondary text-secondary-foreground text-xs font-semibold transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Script
                  </>
                )}
              </button>
            </div>
          </div>

          <textarea
            value={storyData}
            onChange={(e) => setStoryData(e.target.value)}
            rows={14}
            className={`${fieldClass} font-serif leading-relaxed text-base resize-y`}
            placeholder="Generated story will appear here..."
          />
        </GlassPanel>
      )}

      <BrainstormModal
        isOpen={isBrainstormModalOpen}
        onClose={() => setIsBrainstormModalOpen(false)}
        initialContent={storyData || ""}
        onApply={(updatedContent) => {
          const cleanText = updatedContent
            .replace(/<p>/g, '')
            .replace(/<\/p>/g, '\n\n')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .trim();
          setStoryData(cleanText || updatedContent);
        }}
      />
    </div>
  );
}

