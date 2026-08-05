"use client";

import { callAi } from "@/actions/actions";
import { getStoryByIdAction, saveGeneratedStoryAction } from "@/actions/saveStoryAction";
import { PageHeader } from "@/components/PageHeader";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/lib/styles";
import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { 
  Sparkles, 
  Loader2, 
  X, 
  Copy, 
  Check, 
  Layers, 
  ArrowLeft,
  Save,
  MessageSquareText,
  CheckCircle2,
  Clock,
  Send,
  BookOpen
} from "lucide-react";

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  fullStory?: string;
}

export default function StoryEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [story, setStory] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const [storyHtml, setStoryHtml] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userQuery, setUserQuery] = useState<string>('');
  const [isAiChatLoading, setIsAiChatLoading] = useState<boolean>(false);

  const editorRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadStory() {
      setIsLoading(true);
      setError(null);
      const res = await getStoryByIdAction(id);
      if (res.success && res.story) {
        setStory(res.story);
        const rawContent = res.story.content || '';
        const formatted = formatTextToHtml(rawContent);
        setStoryHtml(formatted);
        
        setChatHistory([
          { 
            role: 'ai', 
            content: `Welcome to the Brainstorm Assistant! Use the editor on the left to revise your narrative story or ask me questions here to refine scenes, dialogue, and tone.` 
          }
        ]);

        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.commands.setContent(formatted);
          }
        }, 150);
      } else {
        setError(res.error || "Failed to load story details.");
      }
      setIsLoading(false);
    }

    loadStory();
  }, [id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAiChatLoading]);

  function cleanMarkdownTitle(str: string): string {
    return str
      .replace(/^#+\s*/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/<u>(.*?)<\/u>/gi, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .trim();
  }

  function formatTextToHtml(text: string): string {
    if (!text) return '';

    let cleaned = text.trim();
    if (cleaned.startsWith('```html')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    if (/^<(p|h1|h2|h3|div|ul|ol)\b/i.test(cleaned)) {
      return cleaned;
    }

    const lines = cleaned.split('\n');
    let html = '';
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        continue;
      }

      if (line.startsWith('# ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h1 class="text-xl font-bold mt-4 mb-2"><strong>${cleanMarkdownTitle(line)}</strong></h1>`;
      } else if (line.startsWith('## ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h2 class="text-lg font-bold mt-3 mb-2"><strong>${cleanMarkdownTitle(line)}</strong></h2>`;
      } else if (line.startsWith('### ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h3 class="text-base font-bold text-foreground mt-4 mb-2"><strong>${cleanMarkdownTitle(line)}</strong></h3>`;
      } else if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ')) {
        if (!inList) {
          html += '<ul class="list-disc ml-5 space-y-1 mb-3">';
          inList = true;
        }
        let listContent = line.replace(/^[•\-\*]\s*/, '').trim();
        listContent = listContent
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');
        html += `<li>${listContent}</li>`;
      } else if (line.toLowerCase().includes('episode recap') || line.toLowerCase().includes('recap')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h3 class="text-base font-bold text-foreground mt-4 mb-2"><strong>${cleanMarkdownTitle(line)}</strong></h3>`;
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        let paragraphContent = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');
        html += `<p class="mb-3 leading-relaxed">${paragraphContent}</p>`;
      }
    }

    if (inList) {
      html += '</ul>';
    }

    return html;
  }

  async function handleSaveChanges() {
    const currentHtml = editorRef.current?.getHTML() || storyHtml;
    const currentText = editorRef.current?.getText() || "";

    setIsSaving(true);
    setError(null);

    try {
      const res = await saveGeneratedStoryAction({
        id: id,
        topic: story?.topic || "Untitled Story",
        concept: story?.concept || "",
        overview: story?.storyOverview || story?.overview || "",
        lesson: story?.teachLesson || story?.lesson || "",
        generationType: story?.generation_type || "new",
        contentHtml: currentHtml,
        contentText: currentText
      });

      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        setError(res.error || "Failed to save story changes.");
      }
    } catch (err: any) {
      console.error("Error saving story:", err);
      setError(err?.message || "An error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCopy() {
    const text = editorRef.current?.getText() || "";
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleApplyToEditor(htmlContent: string) {
    if (!htmlContent) return;
    const formatted = formatTextToHtml(htmlContent);
    setStoryHtml(formatted);
    if (editorRef.current) {
      editorRef.current.commands.setContent(formatted);
    }
  }

  async function handleChatSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!userQuery.trim() || isAiChatLoading) return;

    const promptToSend = userQuery.trim();
    setUserQuery('');
    setChatHistory((prev) => [...prev, { role: 'user', content: promptToSend }]);
    setIsAiChatLoading(true);

    try {
      const currentEditorText = editorRef.current?.getText() || storyHtml;
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
        let summaryText = '';
        let fullStoryText = '';

        let parsed: any = null;
        try {
          if (typeof json.result === 'object' && json.result !== null) {
            parsed = json.result;
          } else if (typeof json.result === 'string') {
            const match = json.result.match(/\{[\s\S]*\}/);
            if (match) {
              parsed = JSON.parse(match[0]);
            }
          }
        } catch (e) {
          console.warn("Failed to extract JSON in chat submit:", e);
        }

        if (parsed && (parsed.fullStory || parsed.summary)) {
          summaryText = parsed.summary || '**Updates Made:**\n• Story updated according to your request.';
          fullStoryText = parsed.fullStory || parsed.summary;
        } else {
          summaryText = '**Updates Made:**\n• Revised story based on your request.';
          let raw = typeof json.result === 'string' ? json.result : JSON.stringify(json.result);
          // Strip any residual raw JSON wrapper keys if present
          raw = raw.replace(/^\{[\s\S]*?"fullStory"\s*:\s*"/i, '').replace(/"\s*\}\s*$/i, '');
          fullStoryText = raw;
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
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Loading story editor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <PageHeader
            icon={BookOpen}
            title={story?.topic || story?.concept?.slice(0, 40) || "Story Editor"}
            description={
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <Layers className="w-3 h-3 text-emerald-500" />
                  {story?.generation_type === 'continue' ? 'Continuation Episode' : 'New Story'}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-primary/10 text-primary border border-primary/20">
                  <Clock className="w-3 h-3 text-primary" />
                  Episode {story?.episode_number || '1'}
                </span>
              </div>
            }
          />
        </div>
      </div>

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
            <span className="text-sm font-semibold">Story saved to database successfully!</span>
          </div>
          <button onClick={() => setSaveSuccess(false)} className="text-primary/80 hover:text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Full Page Workspace (Clean & Direct) */}
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
              disabled={isSaving}
              className={primaryButtonClass}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>

        {/* Split layout: Tiptap Editor (Left) & Brainstorm Chat (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
          {/* Left Column: Tiptap Editor */}
          <div className="md:col-span-3 rounded-xl border border-border/60 bg-background/50 flex flex-col focus-within:ring-1 focus-within:ring-primary/40 transition-colors p-2">
            <TiptapEditor
              editorRef={editorRef}
              initialContent={storyHtml}
              className="w-full !bg-transparent !border-none !rounded-none min-h-[400px]"
            />
          </div>

          {/* Right Column: Brainstorm Chat Panel */}
          <div className="md:col-span-2 rounded-xl border border-border/60 bg-muted/20 flex flex-col overflow-hidden h-[500px] sticky top-20">
            <div className="p-2.5 bg-muted/40 border-b border-border/50 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
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
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                    Brainstorming...
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input Footer */}
            <form onSubmit={handleChatSubmit} className="p-2 bg-background border-t border-border/50 flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Ask or request an edit..."
                className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-muted/40 border border-border/60 focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground"
                disabled={isAiChatLoading}
              />
              <button
                type="submit"
                disabled={!userQuery.trim() || isAiChatLoading}
                className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
