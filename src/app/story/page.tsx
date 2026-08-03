"use client";

import { callAi } from "@/actions/actions";
import { PageHeader } from "@/components/PageHeader";
import { GlassPanel } from "@/components/GlassPanel";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass, selectFieldClass } from "@/lib/styles";
import { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  BookOpen, 
  FileText, 
  GraduationCap, 
  Loader2, 
  X, 
  Copy, 
  Check, 
  Wand2, 
  RefreshCw, 
  Layers, 
  History, 
  BookMarked,
  ArrowLeft,
  Save,
  MessageSquareText,
  ArrowUp,
  CheckCircle2,
  Clock,
  Plus
} from "lucide-react";

interface ScriptInput {
  Concept: string;
  Overview: string;
  Lesson: string;
}

interface StoryOption {
  id: string;
  topic?: string;
  concept?: string;
  content?: string;
  generated_at?: string;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  fullStory?: string;
}

export default function StoryPage() {
  const [viewMode, setViewMode] = useState<'form' | 'editor'>('form');
  const [generationType, setGenerationType] = useState<'new' | 'continue'>('new');
  const [previousEpisodeId, setPreviousEpisodeId] = useState<string>('');
  const [previousContext, setPreviousContext] = useState<string>('');
  const [duration, setDuration] = useState<string>('2-3 minutes');
  const [previousStories, setPreviousStories] = useState<StoryOption[]>([]);

  const [data, setData] = useState<ScriptInput>({
    Concept: "",
    Overview: "",
    Lesson: "",
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [storyHtml, setStoryHtml] = useState<string>('');

  // Editor and Brainstorm Chat states
  const editorRef = useRef<any>(null);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiChatLoading, setIsAiChatLoading] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/stories');
      if (res.ok) {
        const json = await res.json();
        if (json.stories) {
          setPreviousStories(json.stories);
        }
      }
    } catch (e) {
      console.error("Failed to fetch stories history", e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAiChatLoading]);

  function handlePreviousEpisodeChange(id: string) {
    setPreviousEpisodeId(id);
    if (!id) return;
    const found = previousStories.find((s) => s.id === id);
    if (found && found.content) {
      const cleanSnippet = found.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
      setPreviousContext(cleanSnippet);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const value = e.target.value;
    const name = e.target.name;
    setData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  /**
   * Converts markdown and raw text into clean, well-formatted HTML for Tiptap
   */
  function formatTextToHtml(text: string): string {
    if (!text) return "";
    let formatted = text.trim();

    // Convert Markdown Headings
    formatted = formatted.replace(/^### (.*$)/gim, '<h3><strong>$1</strong></h3>');
    formatted = formatted.replace(/^## (.*$)/gim, '<h2><strong>$1</strong></h2>');
    formatted = formatted.replace(/^# (.*$)/gim, '<h1><strong>$1</strong></h1>');

    // Explicitly convert any variation of Episode Recap into a bold heading
    formatted = formatted.replace(/(?:^|\n)(?:###|##|\*\*|)\s*Episode Recap[:\s]*(?:\*\*|)/gim, '\n<h3><strong>Episode Recap</strong></h3>\n');

    // Convert Markdown Bold (**text**) and Italic (*text*)
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // If already fully wrapped in HTML block tags, return formatted
    if (/^<(p|div|h[1-6]|ul|ol)[^>]*>[\s\S]*<\/\1>$/i.test(formatted.trim())) {
      return formatted;
    }

    // Split paragraphs by double line breaks
    const paragraphs = formatted.split(/\n\s*\n/);
    return paragraphs
      .map((p) => {
        const trimmed = p.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol') || trimmed.startsWith('<p')) {
          return trimmed;
        }
        return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
      })
      .filter(Boolean)
      .join('');
  }

  /**
   * Replaces all content in Tiptap editor with AI response
   */
  function handleApplyToEditor(content: string) {
    if (!editorRef.current || !content) return;
    const formatted = formatTextToHtml(content);
    editorRef.current.commands.setContent(formatted);
    setStoryHtml(formatted);
  }

  /**
   * Inserts AI response content at current cursor position in Tiptap editor
   */
  function handleInsertAtCursor(content: string) {
    if (!editorRef.current || !content) return;
    const formatted = formatTextToHtml(content);
    editorRef.current.chain().focus().insertContent(formatted).run();
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

    const selectedPreviousStory = previousStories.find((s) => s.id === previousEpisodeId);
    const contextToUse = previousContext.trim() || (selectedPreviousStory?.content ? selectedPreviousStory.content.replace(/<[^>]+>/g, ' ').slice(0, 600) : "");

    const continuationHeader = generationType === 'continue'
      ? `\n- Generation Mode: Continuation Episode (Sequential episode in an ongoing story arc)
${contextToUse ? `- Previous Episode Summary / Context: ${contextToUse}` : ''}`
      : `\n- Generation Mode: New Story (Standalone story episode)`;

    const prompt = `
You are a creative director and storyteller for the children's animated show "Tilli & Jaksh."

Generation Mode Details: ${continuationHeader}
Target Story Duration: ${duration || '2-3 minutes'}

Given Inputs:
- Story Concept: ${data.Concept}
- Story Overview: ${data.Overview}
- Lesson to be Taught: ${data.Lesson}
- Time Duration Target: ${duration || '2-3 minutes'}

Write the complete story for this episode as a warm, flowing bedtime-style narrative suitable for 5-year-olds.

Requirements:
- Build the story around the provided concept and overview while naturally conveying the given lesson.
- Keep the narrative length and pacing aligned with the target duration (${duration || '2-3 minutes'}).
${generationType === 'continue' ? '- Maintain plot and character continuity from the previous episode events.' : '- Create a clear, engaging standalone story.'}
- Stay fully consistent with the attached story bible, including all locked character designs, personalities, locations, and world rules.
- Reuse existing characters and locations whenever possible. If something new is required, introduce it clearly and naturally so it fits the world.
- Include natural dialogue for every character involved, matching each character's established personality and speaking style.
- Give the story a clear beginning, middle, and satisfying ending.
- Let the lesson emerge naturally through the characters' actions and experiences rather than stating it directly.
- Do NOT include camera directions, production notes, scene headings, or screenplay formatting. Write only the narrative story.

MANDATORY FINAL RECAP: At the very end of the generated output, you MUST include a dedicated recap section structured exactly as:

### Episode Recap
[A clear 1-paragraph summary recap of this episode summarizing the key events and outcome so it can be used to prepare the next episode.]`;

    try {
      const response = await callAi(prompt);
      if (response?.text) {
        const formatted = formatTextToHtml(response.text);
        setStoryHtml(formatted);
        
        // Switch view mode to editor
        setViewMode('editor');
        setChatHistory([
          { role: 'ai', content: `Story generated! Target duration: ${duration || '2-3 minutes'}. Use the Tiptap editor on the left or chat with me here to refine dialogue, scenes, or tone.` }
        ]);

        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.commands.setContent(formatted);
          }
        }, 100);
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

  const handleChatSubmit = async (customPrompt?: string) => {
    const promptToSend = customPrompt || chatInput;
    if (!promptToSend.trim()) return;

    if (!customPrompt) setChatInput('');
    setChatHistory((prev) => [...prev, { role: 'user', content: promptToSend }]);
    setIsAiChatLoading(true);

    try {
      const currentEditorText = editorRef.current?.getText() || '';
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'ask',
          content: {
            selectedText: currentEditorText,
            userQuestion: promptToSend,
            isStoryEdit: true
          }
        }),
      });

      if (!res.ok) throw new Error('Failed to process AI chat');
      const json = await res.json();
      if (json.result) {
        let summaryText = json.result;
        let fullStoryText = json.result;

        try {
          const parsed = typeof json.result === 'string' && json.result.trim().startsWith('{')
            ? JSON.parse(json.result)
            : (typeof json.result === 'object' ? json.result : null);

          if (parsed && parsed.summary && parsed.fullStory) {
            summaryText = parsed.summary;
            fullStoryText = parsed.fullStory;
          }
        } catch (e) {
          // Plain text fallback
        }

        const formattedSummary = formatTextToHtml(summaryText);
        const formattedFullStory = formatTextToHtml(fullStoryText);

        setChatHistory((prev) => [
          ...prev,
          {
            role: 'ai',
            content: formattedSummary,
            fullStory: formattedFullStory
          }
        ]);
      }
    } catch (err: any) {
      console.error("Brainstorm Chat error:", err);
      setChatHistory((prev) => [...prev, { role: 'ai', content: 'An error occurred while brainstorming with AI.' }]);
    } finally {
      setIsAiChatLoading(false);
    }
  };

  function handleSaveChanges() {
    const currentHtml = editorRef.current?.getHTML() || storyHtml;
    const currentText = editorRef.current?.getText() || "";

    const storyPayload = {
      concept: data.Concept,
      overview: data.Overview,
      lesson: data.Lesson,
      duration: duration,
      generationType: generationType,
      previousEpisodeId: previousEpisodeId || null,
      previousContext: previousContext || null,
      contentHtml: currentHtml,
      contentText: currentText,
      savedAt: new Date().toISOString()
    };

    console.log("================ LOGGING STORY DATA TO BROWSER ================");
    console.log("Story Payload Data:", storyPayload);
    console.log("==============================================================");

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
  }

  function handleCopy() {
    const text = editorRef.current?.getText() || "";
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClear() {
    setData({ Concept: "", Overview: "", Lesson: "" });
    setGenerationType('new');
    setPreviousEpisodeId('');
    setPreviousContext('');
    setDuration('2-3 minutes');
    setStoryHtml('');
    setError(null);
  }

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={viewMode === 'editor' ? BookOpen : Wand2}
        title={
          viewMode === 'editor'
            ? (data.Concept.trim()
                ? (data.Concept.length > 45 ? data.Concept.slice(0, 45) + "..." : data.Concept)
                : "Generated Story")
            : "Story"
        }
        highlight={viewMode === 'editor' ? "" : "Generator"}
        description={
          viewMode === 'editor' ? (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-500/10 text-primary border border-emerald-500/20">
                <Layers className="w-3 h-3 text-primary" />
                {generationType === 'continue' ? 'Continuation Episode' : 'New Story'}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-primary/10 text-primary border border-primary/20">
                <Clock className="w-3 h-3 text-primary" />
                {duration}
              </span>
            </div>
          ) : (
            "Craft warm bedtime stories for Tilli & Jaksh driven by custom concepts, overviews, and lessons."
          )
        }
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

      {saveSuccess && (
        <div className="p-4 bg-emerald-500/10 text-primary border border-emerald-500/20 rounded-lg flex items-center justify-between animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-semibold">Story details logged to browser console!</span>
          </div>
          <button onClick={() => setSaveSuccess(false)} className="text-primary/80 hover:text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {viewMode === 'form' ? (
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-border/40">
              <div className="space-y-1.5">
                <label className={labelClass}>
                  <Wand2 className="w-4 h-4 text-primary" />
                  Generation Type
                </label>
                <div className="flex bg-muted/50 p-1 rounded-xl w-fit border border-border/30">
                  <button
                    type="button"
                    onClick={() => setGenerationType('new')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      generationType === 'new'
                        ? 'bg-background text-foreground border border-border/50'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-primary" />
                    Write New Story
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenerationType('continue')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      generationType === 'continue'
                        ? 'bg-background text-foreground border border-border/50'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Layers className="w-4 h-4 text-primary" />
                    Continuation Episode
                  </button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg border border-border/20 max-w-xs">
                {generationType === 'new'
                  ? 'Create a brand-new standalone story episode.'
                  : 'Continue an ongoing story arc with plot and character continuity.'}
              </div>
            </div>

            {/* Continuation Episode Options */}
            {generationType === 'continue' && (
              <div className="p-4 rounded-xl border space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className={labelClass}>
                      <History className="w-4 h-4 text-primary" />
                      Previous Episode (Optional)
                    </label>
                    <div className="relative">
                      <select
                        value={previousEpisodeId}
                        onChange={(e) => handlePreviousEpisodeChange(e.target.value)}
                        className={selectFieldClass}
                      >
                        <option value="">-- Select from History --</option>
                        {previousStories.map((story) => (
                          <option key={story.id} value={story.id}>
                            {story.topic || story.concept?.slice(0, 40) || 'Untitled Story'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className={labelClass}>
                      <BookMarked className="w-4 h-4 text-primary" />
                      Previous Episode Recap / Context
                    </label>
                    <textarea
                      value={previousContext}
                      onChange={(e) => setPreviousContext(e.target.value)}
                      rows={2}
                      className={fieldClass}
                      placeholder="Enter what happened in the previous episode or context to continue from..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Time Duration Input */}
            <div className="space-y-2">
              <label className={labelClass}>
                <Clock className="w-4 h-4 text-primary" />
                Time Duration
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    name="Duration"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className={fieldClass}
                    placeholder="e.g. 2-3 minutes, 5 minutes, 30 seconds..."
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['1 min', '2-3 min', '5 min', '10 min'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDuration(preset)}
                      className={`px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                        duration === preset
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background/80 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

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
      ) : (
        /* Full Page Workspace (Clean & Direct) */
        <div className="space-y-4">
          {/* Action Bar Header */}
          <div className="flex w-full items-center justify-end gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCopy}
                className={secondaryButtonClass}
              >
                {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy Text'}
              </button>
              <button
                type="button"
                onClick={handleSaveChanges}
                className={primaryButtonClass}
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>

          {/* Split layout: Tiptap Editor (Left, Full Length) & Brainstorm Chat (Right, Sticky) */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
            {/* Left Column: Original Tiptap Editor (Full length, expands naturally) */}
            <div className="md:col-span-3 rounded-xl border border-border/60 bg-background/50 flex flex-col focus-within:ring-1 focus-within:ring-primary/40 transition-colors p-2">
              <TiptapEditor
                editorRef={editorRef}
                initialContent={storyHtml}
                className="w-full !bg-transparent !border-none !rounded-none min-h-[400px]"
              />
            </div>

            {/* Right Column: Brainstorm Chat Panel (Sticky scrollable assistant below navbar) */}
            <div className="md:col-span-2 rounded-xl border border-border/60 bg-muted/20 flex flex-col overflow-hidden h-[500px] sticky top-20">
              <div className="p-2.5 bg-muted/40 border-b border-border/50 flex items-center justify-between shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Brainstorm Assistant
                </span>
                <span className="text-[11px] text-muted-foreground">Interactive AI</span>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4 text-muted-foreground gap-1.5">
                    <MessageSquareText className="w-6 h-6 text-primary/40" />
                    <p className="text-[11px]">Ask questions or request edits to brainstorm this story with AI.</p>
                  </div>
                ) : (
                  chatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`px-3 py-2 rounded-xl text-xs max-w-[90%] ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-none'
                          : 'bg-background text-foreground border border-border/50 rounded-bl-none prose prose-xs dark:prose-invert'
                      }`}>
                        {msg.role === 'ai' ? (
                          <div className="space-y-2">
                            <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                            
                            {/* Single Merge Changes Button on AI Messages */}
                            {idx > 0 && (
                              <div className="pt-2 border-t border-border/40 flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleApplyToEditor(msg.fullStory || msg.content)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold transition-all shadow-sm active:scale-95"
                                  title="Merge these AI changes into the story editor"
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
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
                    <div className="px-3 py-2 rounded-xl text-xs bg-background text-foreground border border-border/50 rounded-bl-none flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      Brainstorming...
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              <div className="px-2.5 py-1 bg-background/50 border-t border-border/30 flex gap-1 overflow-x-auto text-[10px] shrink-0">
                <button
                  onClick={() => handleChatSubmit("Add more dialogue between characters")}
                  disabled={isAiChatLoading}
                  className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground shrink-0 border border-border/40"
                >
                  + Dialogue
                </button>
                <button
                  onClick={() => handleChatSubmit("Make tone warmer for bedtime")}
                  disabled={isAiChatLoading}
                  className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground shrink-0 border border-border/40"
                >
                  + Bedtime tone
                </button>
                <button
                  onClick={() => handleChatSubmit("Expand recap & ending")}
                  disabled={isAiChatLoading}
                  className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground shrink-0 border border-border/40"
                >
                  + Better ending
                </button>
              </div>

              <div className="p-2.5 bg-background border-t border-border/50 shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleChatSubmit(); }}
                    placeholder="Ask AI for changes..."
                    className="flex-1 bg-muted/40 border border-input rounded-lg px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <button
                    onClick={() => handleChatSubmit()}
                    disabled={isAiChatLoading || !chatInput.trim()}
                    className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
