"use client";

import { getScriptByIdAction, saveGeneratedScriptAction } from "@/actions/saveScriptAction";
import { PageHeader } from "@/components/PageHeader";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/styles";
import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { 
  Loader2, 
  X, 
  Copy, 
  Check, 
  Layers, 
  ArrowLeft,
  Save,
  CheckCircle2,
  Clock,
  Bot
} from "lucide-react";

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
      html += `<h1 class="text-xl font-bold mt-4 mb-2 text-foreground"><strong>${cleanMarkdownTitle(line)}</strong></h1>`;
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2 class="text-lg font-bold mt-3 mb-2 text-foreground"><strong>${cleanMarkdownTitle(line)}</strong></h2>`;
    } else if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3 class="text-base font-bold text-foreground mt-4 mb-2"><strong>${cleanMarkdownTitle(line)}</strong></h3>`;
    } else if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        html += '<ul class="list-disc ml-5 space-y-1 mb-3 text-foreground/90">';
        inList = true;
      }
      let listContent = line.replace(/^[•\-\*]\s*/, '').trim();
      listContent = listContent
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      html += `<li>${listContent}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      let paragraphContent = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      html += `<p class="mb-3 leading-relaxed text-foreground/90">${paragraphContent}</p>`;
    }
  }

  if (inList) {
    html += '</ul>';
  }

  return html;
}

export default function ScriptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [script, setScript] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [scriptHtml, setScriptHtml] = useState<string>('');

  const editorRef = useRef<any>(null);

  useEffect(() => {
    async function loadScript() {
      setIsLoading(true);
      setError(null);
      const res = await getScriptByIdAction(id);
      if (res.success && res.script) {
        setScript(res.script);
        const rawContent = res.script.content || '';
        const formatted = formatTextToHtml(rawContent);
        setScriptHtml(formatted);

        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.commands.setContent(formatted);
          }
        }, 150);
      } else {
        setError(res.error || "Failed to load script details.");
      }
      setIsLoading(false);
    }

    loadScript();
  }, [id]);

  async function handleSaveChanges() {
    const currentHtml = editorRef.current?.getHTML() || scriptHtml;
    const currentText = editorRef.current?.getText() || "";

    setIsSaving(true);
    setError(null);

    try {
      const res = await saveGeneratedScriptAction({
        id: id,
        story_id: script?.story_id,
        topic: script?.topic || "Untitled Script",
        generationType: script?.generation_type || "new",
        contentHtml: currentHtml,
        contentText: currentText
      });

      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        setError(res.error || "Failed to save script changes.");
      }
    } catch (err: any) {
      console.error("Error saving script:", err);
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

  if (isLoading) {
    return (
      <div className="max-w-[1200px] w-full mx-auto py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Loading script details...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-12">

      <div className="space-y-4">

        <div>
          <PageHeader
            icon={Bot}
            title={script?.topic || "Beat Script Editor"}
            description={
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <Layers className="w-3 h-3 text-emerald-500" />
                  Beat Script
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-primary/10 text-primary border border-primary/20">
                  <Clock className="w-3 h-3 text-primary" />
                  Episode {script?.episode_number || '1'}
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
            <span className="text-sm font-semibold">Script saved to database successfully!</span>
          </div>
          <button onClick={() => setSaveSuccess(false)} className="text-primary/80 hover:text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Full Page Workspace */}
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

        {/* Full-width Tiptap Editor */}
        <div className="w-full rounded-xl border border-border/60 bg-background/50 flex flex-col focus-within:ring-1 focus-within:ring-primary/40 transition-colors p-3 shadow-sm">
          <TiptapEditor
            editorRef={editorRef}
            initialContent={scriptHtml}
            className="w-full !bg-transparent !border-none !rounded-none min-h-[500px]"
          />
        </div>
      </div>
    </div>
  );
}
