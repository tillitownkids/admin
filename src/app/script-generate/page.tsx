'use client';

import { Sparkles, Save, Wand2, FileText, Bot, Loader2, X, LayoutTemplate, Layers, Plus, Clock, ArrowLeft, BookOpen } from "lucide-react";
import { ScriptEditor } from "@/components/script/ScriptEditor";
import { ScriptContent } from "@/types/script";
import { PageHeader } from "@/components/PageHeader";
import { GlassPanel } from "@/components/GlassPanel";
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass, selectFieldClass } from "@/lib/styles";
import { useState, useEffect } from "react";

export interface ScriptHistory {
  id: string;
  topic: string;
  mode: 'single' | 'multi';
  content?: any;
  generated_at: string;
}

function parseScriptContent(content: any, defaultTopic: string = ''): ScriptContent {
  if (typeof content === 'object' && content !== null && Array.isArray(content.scenes)) {
    return content as ScriptContent;
  }
  if (typeof content === 'string' && content.trim()) {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object' && parsed !== null && Array.isArray(parsed.scenes)) {
        return parsed as ScriptContent;
      }
    } catch (e) {}
    return {
      recap: defaultTopic || "Episode Recap",
      scenes: [
        {
          sceneNumber: 1,
          setting: "INT. TILLITOWN - DAY",
          narration: content.replace(/<[^>]+>/g, ' ').trim(),
          dialogues: []
        }
      ]
    };
  }
  return {
    recap: defaultTopic || "",
    scenes: [
      {
        sceneNumber: 1,
        setting: "INT. TILLITOWN - DAY",
        narration: "",
        dialogues: []
      }
    ]
  };
}

export default function ScriptGeneratePage() {
  const [viewMode, setViewMode] = useState<'history' | 'create' | 'edit'>('history');
  const [history, setHistory] = useState<ScriptHistory[]>([]);
  const [topic, setTopic] = useState('');
  const [concept, setConcept] = useState('');
  const [storyOverview, setStoryOverview] = useState('');
  const [teachLesson, setTeachLesson] = useState('');
  const [generationType, setGenerationType] = useState('new');
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [scriptContent, setScriptContent] = useState<ScriptContent>({ recap: '', scenes: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/scripts');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.scripts || []);
      }
    } catch (e) {
      console.error("Failed to load history from DB", e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const saveToHistory = async (newRecord: { topic: string; mode: string; content: string }) => {
    try {
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: newRecord.topic,
          mode: newRecord.mode,
          content: newRecord.content,
          generation_type: generationType
        })
      });
      if (res.ok) fetchHistory();
    } catch (e) {
      console.error("Failed to save script to DB", e);
    }
  };

  const loadHistoryRecord = (record: ScriptHistory) => {
    setTopic(record.topic);
    setMode(record.mode);
    setScriptContent(parseScriptContent(record.content, record.topic));
    setViewMode('edit');
  };

  const handleGenerate = async () => {
    if (!topic.trim() && !concept.trim() && !storyOverview.trim()) {
      setError("Please fill in the topic, concept, or story overview before generating.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'story-generate',
          content: {
            topic: topic || "Untitled Script",
            concept: concept || topic,
            storyOverview,
            teachLesson,
            generationType
          }
        }),
      });

      if (!response.ok) throw new Error("Failed to generate script.");
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const parsed = parseScriptContent(data.result, topic);
      setScriptContent(parsed);
      await saveToHistory({ topic: topic || "Untitled Script", mode, content: JSON.stringify(parsed) });
      setViewMode('edit');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during generation");
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    await saveToHistory({
      topic: topic || "Untitled Script",
      mode,
      content: JSON.stringify(scriptContent)
    });
    setViewMode('history');
  };

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={Bot}
        title="Script"
        highlight="Generation"
        description="Craft engaging structured scripts for the TilliTown universe."
        action={
          viewMode !== 'history' && (
            <button
              onClick={() => setViewMode('history')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 hover:bg-secondary text-secondary-foreground transition-colors font-medium text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to History
            </button>
          )
        }
      />

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {viewMode === 'history' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            onClick={() => {
              setTopic('');
              setConcept('');
              setStoryOverview('');
              setTeachLesson('');
              setScriptContent({ recap: '', scenes: [] });
              setViewMode('create');
            }}
            className="cursor-pointer flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors min-h-[200px]"
          >
            <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-primary">Create New Script</h3>
            <p className="text-sm text-muted-foreground mt-1 text-center">Generate a new structured script</p>
          </div>

          {history.map((record) => (
            <div
              key={record.id}
              onClick={() => loadHistoryRecord(record)}
              className="cursor-pointer flex flex-col p-5 rounded-2xl border border-border bg-card min-h-[200px]"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-500/10 text-emerald-500">
                  {record.mode}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(record.generated_at).toLocaleDateString()}
                </span>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3 line-clamp-3">
                {record.topic || "Untitled Script"}
              </h3>
              <div className="mt-auto pt-4 border-t border-border/50 text-sm font-medium text-primary">
                Open in Editor &rarr;
              </div>
            </div>
          ))}
        </div>
      ) : (
        <GlassPanel
          footer={
            <div className="flex w-full sm:w-auto items-center justify-end gap-3">
              <button onClick={handleSaveDraft} className={secondaryButtonClass}>
                <Save className="w-4 h-4" /> Save Draft
              </button>
              {viewMode === 'create' && (
                <button onClick={handleGenerate} disabled={isLoading} className={primaryButtonClass}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate Script
                </button>
              )}
            </div>
          }
        >
          {viewMode === 'create' && (
            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <label className={labelClass}>Topic / Title</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. The Great Candy Forest Adventure"
                  className={fieldClass}
                />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Concept</label>
                <textarea
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Core idea or premise..."
                  rows={2}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Story Overview</label>
                <textarea
                  value={storyOverview}
                  onChange={(e) => setStoryOverview(e.target.value)}
                  placeholder="Detailed plot outline and summary..."
                  rows={4}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Teach Lesson</label>
                <textarea
                  value={teachLesson}
                  onChange={(e) => setTeachLesson(e.target.value)}
                  placeholder="Educational takeaway or moral lesson..."
                  rows={2}
                  className={fieldClass}
                />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <label className={labelClass}>Script Scene & Dialogue Editor</label>
            <ScriptEditor value={scriptContent} onChange={setScriptContent} />
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
