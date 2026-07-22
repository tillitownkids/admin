'use client';

import { Sparkles, Save, Type, Users, Wand2, FileText, Bot, Loader2, X, LayoutTemplate, Layers, Plus, History, ArrowLeft, Clock } from "lucide-react";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { MultiEpisodeCards, Episode } from "@/components/MultiEpisodeCards";
import { BrainstormModal } from "@/components/story/BrainstormModal";
import { useState, useRef, useEffect } from "react";

export interface StoryHistory {
  id: string;
  topic: string;
  type: 'single' | 'multi';
  content?: string;
  episodes?: Episode[];
  date: string;
}

export default function StoryGeneratePage() {
  const [viewMode, setViewMode] = useState<'history' | 'create' | 'edit'>('history');
  const [history, setHistory] = useState<StoryHistory[]>([]);
  const [topic, setTopic] = useState('');
  const [generationType, setGenerationType] = useState('new');
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [episodeCount, setEpisodeCount] = useState(5);
  const [generatedEpisodes, setGeneratedEpisodes] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<number | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBrainstormModalOpen, setIsBrainstormModalOpen] = useState(false);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    const savedHistory = localStorage.getItem('story_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const saveToHistory = (newRecord: Omit<StoryHistory, 'id' | 'date'>) => {
    const record: StoryHistory = {
      ...newRecord,
      id: Math.random().toString(36).substring(2, 9),
      date: new Date().toISOString()
    };
    const updatedHistory = [record, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('story_history', JSON.stringify(updatedHistory));
  };

  const loadHistoryRecord = (record: StoryHistory) => {
    setTopic(record.topic);
    setMode(record.type);
    if (record.type === 'multi' && record.episodes) {
      setGeneratedEpisodes(record.episodes);
      setSelectedEpisode(record.episodes[0]?.episodeNumber);
      if (editorRef.current) {
        setTimeout(() => editorRef.current.commands.setContent(record.episodes![0]?.script || ""), 100);
      }
    } else {
      setGeneratedEpisodes([]);
      setSelectedEpisode(undefined);
      if (editorRef.current) {
        setTimeout(() => editorRef.current.commands.setContent(record.content || ""), 100);
      }
    }
    setViewMode('edit');
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic or concept before generating.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Get additional instructions from the editor
    let instructions = "";
    if (editorRef.current) {
      const editorText = editorRef.current.getText() || "";
      // If the editor has only the default starting text, ignore it
      if (
        !editorText.includes("Start writing your script here...") &&
        !editorText.includes("Select this text or place cursor")
      ) {
        instructions = editorText;
      }
    }

    try {
      const taskType = mode === 'multi' ? 'multi-episode' : 'story-generate';
      
      const response = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType,
          content: {
            topic,
            audience: localStorage.getItem('targetAudience') || 'kids',
            tone: localStorage.getItem('tone') || 'educational',
            instructions,
            generationType,
            episodeCount: mode === 'multi' ? episodeCount : undefined
          }
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate story. Please check your credentials or network.");
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      if (mode === 'multi' && data.result) {
        const episodes: Episode[] = JSON.parse(data.result);
        setGeneratedEpisodes(episodes);
        if (episodes.length > 0) {
          setSelectedEpisode(episodes[0].episodeNumber);
          if (editorRef.current) {
            editorRef.current.commands.setContent(episodes[0].script);
          }
        }
        saveToHistory({ topic, type: 'multi', episodes });
        setViewMode('edit');
      } else if (editorRef.current && data.result) {
        // Load the generated HTML story into the editor
        let finalContent = data.result;
        if (generationType === 'continue') {
            const currentContent = editorRef.current.getHTML();
            finalContent = currentContent + "<br/><br/>" + data.result;
        }
        editorRef.current.commands.setContent(finalContent);
        saveToHistory({ topic, type: 'single', content: finalContent });
        setViewMode('edit');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during generation");
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDraft = () => {
    // In a real app, you might save the current draft state here
    setViewMode('history');
  };

  const handleSelectEpisode = (ep: Episode) => {
    setSelectedEpisode(ep.episodeNumber);
    if (editorRef.current) {
      editorRef.current.commands.setContent(ep.script);
    }
  };

  return (
    <div className="w-full mx-auto space-y-8 page-enter pb-10">
      <header className="space-y-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary border border-primary/20">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-heading">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                Story
              </span>{" "}
              Generation
            </h1>
            <p className="text-muted-foreground mt-1">
              Craft engaging stories tailored for the TilliTown universe.
            </p>
          </div>
        </div>
        
        {viewMode !== 'history' && (
          <button 
            onClick={() => setViewMode('history')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 hover:bg-secondary text-secondary-foreground transition-colors font-medium text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to History
          </button>
        )}
      </header>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-2xl flex items-center justify-between animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <X className="w-4 h-4 cursor-pointer" onClick={() => setError(null)} />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-destructive/80 hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {viewMode === 'history' ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div 
              onClick={() => {
                setTopic('');
                setGeneratedEpisodes([]);

                setViewMode('create');
              }}
              className="cursor-pointer group flex flex-col items-center justify-center p-8 rounded-3xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all duration-300 min-h-[200px]"
            >
              <div className="w-14 h-14 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Plus className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-primary">Create New Story</h3>
              <p className="text-sm text-muted-foreground mt-1 text-center">Start generating a new single or multi-episode arc</p>
            </div>

            {history.map((record) => (
              <div 
                key={record.id}
                onClick={() => loadHistoryRecord(record)}
                className="cursor-pointer group flex flex-col p-6 rounded-3xl border border-border bg-card hover:border-primary/40 transition-all duration-300 min-h-[200px]"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${record.type === 'multi' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    {record.type === 'multi' ? <Layers className="w-3 h-3" /> : <LayoutTemplate className="w-3 h-3" />}
                    {record.type}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(record.date).toLocaleDateString()}
                  </span>
                </div>
                
                <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors line-clamp-3">
                  {record.topic || "Untitled Story"}
                </h3>
                
                <div className="mt-auto pt-4 border-t border-border/50 flex items-center text-sm font-medium text-primary opacity-80 group-hover:opacity-100 transition-opacity">
                  Open in Editor &rarr;
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-card/40 backdrop-blur-2xl border border-border/50 rounded-3xl overflow-hidden transition-all duration-500 hover:border-primary/20 group/panel">
          <div className="p-8 sm:p-10 space-y-8 relative">
          
          {/* Subtle background decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none group-hover/panel:bg-primary/10 transition-colors duration-500"></div>

          <div className="flex justify-between items-center mb-6">
            {viewMode !== 'edit' ? (
              <div className="flex bg-muted/50 p-1 rounded-xl w-fit mb-4">
               <button
                onClick={() => setMode('single')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'single' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutTemplate className="w-4 h-4" />
                Single Episode
               </button>
               <button
                onClick={() => setMode('multi')}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  mode === 'multi' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Layers className="w-4 h-4" />
                Multi-Episode Arc
               </button>
              </div>
            ) : <div />}
            <div className="relative">
              <button
                onClick={() => setIsBrainstormModalOpen(true)}
                disabled={!topic.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary/10"
              >
                <Sparkles className="w-4 h-4" />
                Brainstorm Idea
              </button>
              <BrainstormModal 
                isOpen={isBrainstormModalOpen}
                onClose={() => setIsBrainstormModalOpen(false)}
                initialContent={editorRef.current?.getHTML()}
                onApply={(html) => {
                  if (editorRef.current) {
                    editorRef.current.commands.setContent(html);
                  }
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-1 gap-8">
            {viewMode !== 'edit' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
              <div className="space-y-3">
                <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-primary" />
                  Generation Type
                </label>
                <div className="relative">
                  <select 
                    value={generationType}
                    onChange={(e) => setGenerationType(e.target.value)}
                    className="w-full appearance-none bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer hover:bg-background text-foreground"
                  >
                    <option value="continue">Continue Ongoing Story</option>
                    <option value="new">Write New Story</option>
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4"></path></svg>
                  </div>
                </div>
              </div>

              {mode === 'multi' && (
                <div className="space-y-3">
                  <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Episode Count
                  </label>
                  <div className="relative">
                    <input 
                      type="number"
                      min="2"
                      max="10"
                      value={episodeCount}
                      onChange={(e) => setEpisodeCount(parseInt(e.target.value) || 5)}
                      className="w-full bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground/60 hover:bg-background"
                    />
                  </div>
                </div>
              )}
            </div>
            )}

          {generatedEpisodes.length > 0 && (
            <div className="pt-6 border-t border-border/40">
              <MultiEpisodeCards 
                episodes={generatedEpisodes}
                onSelectEpisode={handleSelectEpisode}
                selectedEpisodeNumber={selectedEpisode}
              />
            </div>
          )}
          
            <div className="space-y-3">
              <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Type story details for next episode
              </label>
              <textarea 
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground/60 hover:bg-background"
                placeholder="e.g., A magical adventure in the candy forest where friends learn to share..." 
              />
            </div>
          </div>

          

          <div className="space-y-3">
            <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-primary" />
              {mode === 'multi' && selectedEpisode ? `Editing Episode ${selectedEpisode} Story` : 'Additional Instructions / Story Sandbox'}
            </label>
            <div className="w-full relative mt-2">
              <TiptapEditor editorRef={editorRef} />
            </div>
          </div>
        </div>
        
        <div className="bg-muted/30 p-6 sm:px-10 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-6 backdrop-blur-md">
          <p className="text-sm text-muted-foreground">
            Estimated generation time: <span className="font-semibold text-foreground">~30 seconds</span>
          </p>
          <div className="flex w-full sm:w-auto items-center gap-3">
            <button 
              onClick={handleSaveDraft}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-border/80 bg-background/80 hover:bg-muted text-foreground font-semibold transition-all duration-300 active:scale-[0.98]"
            >
              <Save className="w-4 h-4" /> 
              Save Draft
            </button>
            <button 
              onClick={handleGenerate}
              disabled={isLoading || !topic.trim()}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all duration-300 active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" /> 
                  Generate Story
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      )}
      
    </div>
  );
}
