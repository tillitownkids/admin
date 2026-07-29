'use client';

import { Sparkles, Save, Type, Users, Wand2, FileText, Bot, Loader2, X, LayoutTemplate, Layers, Plus, History, ArrowLeft, Clock, BookOpen, Clapperboard } from "lucide-react";
import Link from "next/link";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { MultiEpisodeCards, Episode } from "@/components/MultiEpisodeCards";
import { BrainstormModal } from "@/components/story/BrainstormModal";
import { PageHeader } from "@/components/PageHeader";
import { GlassPanel } from "@/components/GlassPanel";
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass, selectFieldClass } from "@/lib/styles";
import { useState, useRef, useEffect } from "react";

export interface StoryHistory {
  id: string;
  topic: string;
  mode: 'single' | 'multi'; // API uses 'mode' instead of 'type'
  content?: string;
  generated_at: string; // API uses 'generated_at'
  episodes?: Episode[];
  status?: string;
  production_stage?: string;
}

interface CharacterOption {
  id: string;
  name: string;
  description: string;
}

export default function StoryGeneratePage() {
  const [viewMode, setViewMode] = useState<'history' | 'create' | 'edit'>('history');
  const [history, setHistory] = useState<StoryHistory[]>([]);
  const [topic, setTopic] = useState('');
  const [concept, setConcept] = useState('');
  const [storyOverview, setStoryOverview] = useState('');
  const [teachLesson, setTeachLesson] = useState('');
  const [generationType, setGenerationType] = useState('new');
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [episodeCount, setEpisodeCount] = useState(5);
  const [generatedEpisodes, setGeneratedEpisodes] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<number | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBrainstormModalOpen, setIsBrainstormModalOpen] = useState(false);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [previousEpisodeId, setPreviousEpisodeId] = useState('');
  const editorRef = useRef<any>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/stories');
      if (res.ok) {
        const data = await res.json();
        // map DB stories to state format
        const loadedHistory = data.stories.map((story: any) => {
          let episodes = undefined;
          let content = story.content;
          if (story.mode === 'multi') {
            try { episodes = JSON.parse(story.content); } catch (e) {}
          }
          return {
            id: story.id,
            topic: story.topic,
            mode: story.mode,
            content: content,
            episodes: episodes,
            generated_at: story.generated_at,
            status: story.status,
            production_stage: story.production_stage
          };
        });
        setHistory(loadedHistory);
      }
    } catch (e) {
      console.error("Failed to load history from DB", e);
    }
  };

  const fetchCharacters = async () => {
    try {
      const res = await fetch('/api/characters');
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.characters || []);
      }
    } catch (e) {
      console.error("Failed to load characters", e);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchCharacters();
  }, []);

  const toggleCharacter = (id: string) => {
    setSelectedCharacterIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const saveToHistory = async (newRecord: Omit<StoryHistory, 'id' | 'generated_at' | 'episodes'>) => {
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: newRecord.topic,
          concept: concept,
          storyOverview: storyOverview,
          teachLesson: teachLesson,
          mode: newRecord.mode,
          content: newRecord.content,
          generation_type: generationType
        })
      });
      if (res.ok) {
        const data = await res.json();
        const storyId = data.story?.id;
        if (storyId && (selectedCharacterIds.length > 0 || previousEpisodeId)) {
          await fetch(`/api/stories/${storyId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              featuredCharacterIds: selectedCharacterIds,
              previous_story_id: previousEpisodeId || null,
            }),
          });
        }
        fetchHistory(); // refresh history from DB
      }
    } catch (e) {
      console.error("Failed to save story to DB", e);
    }
  };

  const loadHistoryRecord = (record: StoryHistory) => {
    setTopic(record.topic);
    setMode(record.mode);
    if (record.mode === 'multi' && record.episodes) {
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
    if (!concept.trim() && !storyOverview.trim() && !topic.trim()) {
      setError("Please fill in the concept or story overview before generating.");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Get additional instructions from the editor
    let instructions = "";
    if (editorRef.current) {
      const editorText = editorRef.current.getText() || "";
      if (
        !editorText.includes("Start writing your script here...") &&
        !editorText.includes("Select this text or place cursor")
      ) {
        instructions = editorText;
      }
    }

    try {
      const taskType = mode === 'multi' ? 'multi-episode' : 'story-generate';

      const featuredCharacters = characters
        .filter((c) => selectedCharacterIds.includes(c.id))
        .map((c) => ({ name: c.name, description: c.description }));

      const previousEpisode = history.find((h) => h.id === previousEpisodeId);
      const previousEpisodeSummary = previousEpisode?.content
        ? previousEpisode.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800)
        : undefined;

      const response = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType,
          content: {
            topic: topic || "Untitled Story",
            concept: concept || topic,
            storyOverview,
            teachLesson,
            audience: localStorage.getItem('targetAudience') || 'kids',
            tone: localStorage.getItem('tone') || 'educational',
            instructions,
            generationType,
            episodeCount: mode === 'multi' ? episodeCount : undefined,
            featuredCharacters,
            previousEpisodeSummary
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
        saveToHistory({ topic, mode: 'multi', content: data.result });
        setViewMode('edit');
      } else if (editorRef.current && data.result) {
        // Load the generated HTML story into the editor
        let finalContent = data.result;
        if (generationType === 'continue') {
            const currentContent = editorRef.current.getHTML();
            finalContent = currentContent + "<br/><br/>" + data.result;
        }
        editorRef.current.commands.setContent(finalContent);
        saveToHistory({ topic, mode: 'single', content: finalContent });
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

  const handleSaveDraft = async () => {
    const currentContent = editorRef.current?.getHTML() || "";
    if (topic.trim() || currentContent.trim()) {
      await saveToHistory({ 
        topic: topic || "Untitled Story", 
        mode: mode, 
        content: mode === 'multi' ? JSON.stringify(generatedEpisodes) : currentContent 
      });
    }
    setViewMode('history');
  };

  const handleSelectEpisode = (ep: Episode) => {
    setSelectedEpisode(ep.episodeNumber);
    if (editorRef.current) {
      editorRef.current.commands.setContent(ep.script);
    }
  };

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={Bot}
        title="Story"
        highlight="Generation"
        description="Craft engaging stories tailored for the TilliTown universe."
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

      {viewMode === 'history' ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              onClick={() => {
                setTopic('');
                setGeneratedEpisodes([]);

                setViewMode('create');
              }}
              className="cursor-pointer group flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors duration-300 min-h-[200px]"
            >
              <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Plus className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-primary">Create New Story</h3>
              <p className="text-sm text-muted-foreground mt-1 text-center">Start generating a new single or multi-episode arc</p>
            </div>

            {history.map((record) => (
              <div
                key={record.id}
                onClick={() => loadHistoryRecord(record)}
                className="cursor-pointer group flex flex-col p-5 rounded-2xl border border-border bg-card min-h-[200px]"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${record.mode === 'multi' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    {record.mode === 'multi' ? <Layers className="w-3 h-3" /> : <LayoutTemplate className="w-3 h-3" />}
                    {record.mode}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(record.generated_at).toLocaleDateString()}
                  </span>
                </div>
                
                <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors line-clamp-3">
                  {record.topic || "Untitled Story"}
                </h3>

                <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between gap-3">
                  <span className="flex items-center text-sm font-medium text-primary opacity-80 group-hover:opacity-100 transition-opacity">
                    Open in Editor &rarr;
                  </span>
                  {record.mode === 'single' && record.status === 'success' && (
                    <Link
                      href={`/episode-production/${record.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Clapperboard className="w-3 h-3" />
                      {record.production_stage && record.production_stage !== 'story' ? 'Resume Production' : 'Start Production'}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <GlassPanel
          footer={
            <>
              <p className="text-sm text-muted-foreground">
                Estimated generation time: <span className="font-semibold text-foreground">~30 seconds</span>
              </p>
              <div className="flex w-full sm:w-auto items-center gap-3">
                <button
                  onClick={handleSaveDraft}
                  className={`flex-1 sm:flex-none ${secondaryButtonClass}`}
                >
                  <Save className="w-4 h-4" />
                  Save Draft
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isLoading || !topic.trim()}
                  className={`flex-1 sm:flex-none ${primaryButtonClass} group`}
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
            </>
          }
        >
          <div className="flex justify-between items-center">
            {viewMode !== 'edit' ? (
              <div className="flex bg-muted/50 p-1 rounded-lg w-fit">
               <button
                onClick={() => setMode('single')}
                className={`flex items-center gap-2 px-5 py-2 rounded-md text-sm font-semibold transition-all ${
                  mode === 'single' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutTemplate className="w-4 h-4" />
                Single Episode
               </button>
               <button
                onClick={() => setMode('multi')}
                className={`flex items-center gap-2 px-5 py-2 rounded-md text-sm font-semibold transition-all ${
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

          <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
            {viewMode !== 'edit' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className={labelClass}>
                  <Wand2 className="w-4 h-4 text-primary" />
                  Generation Type
                </label>
                <div className="relative">
                  <select
                    value={generationType}
                    onChange={(e) => setGenerationType(e.target.value)}
                    className={selectFieldClass}
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
                  <label className={labelClass}>
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
                      className={fieldClass}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label className={labelClass}>
                  <Users className="w-4 h-4 text-primary" />
                  Featured Characters
                </label>
                <div className="flex flex-wrap gap-2">
                  {characters.length === 0 && (
                    <p className="text-sm text-muted-foreground">No characters in your library yet.</p>
                  )}
                  {characters.map((c) => {
                    const selected = selectedCharacterIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCharacter(c.id)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <label className={labelClass}>
                  <BookOpen className="w-4 h-4 text-primary" />
                  Previous Episode (for continuity)
                </label>
                <div className="relative">
                  <select
                    value={previousEpisodeId}
                    onChange={(e) => setPreviousEpisodeId(e.target.value)}
                    className={selectFieldClass}
                  >
                    <option value="">None</option>
                    {history.filter((h) => h.mode === 'single').map((h) => (
                      <option key={h.id} value={h.id}>{h.topic || 'Untitled Story'}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4"></path></svg>
                  </div>
                </div>
              </div>
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

            <div className="space-y-4">
              <div className="space-y-2">
                <label className={labelClass}>
                  <Type className="w-4 h-4 text-primary" />
                  Topic / Episode Title
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className={fieldClass}
                  placeholder="e.g., The Great Candy Forest Adventure"
                />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>
                  <Sparkles className="w-4 h-4 text-primary" />
                  Concept
                </label>
                <textarea
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  className={fieldClass}
                  rows={2}
                  placeholder="Core idea or premise (e.g., Tilli finds a mysterious map in the library)..."
                />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>
                  <FileText className="w-4 h-4 text-primary" />
                  Story Overview
                </label>
                <textarea
                  value={storyOverview}
                  onChange={(e) => setStoryOverview(e.target.value)}
                  className={fieldClass}
                  rows={4}
                  placeholder="Detailed plot outline and summary of the episode..."
                />
              </div>

              <div className="space-y-2">
                <label className={labelClass}>
                  <BookOpen className="w-4 h-4 text-primary" />
                  Teach Lesson
                </label>
                <textarea
                  value={teachLesson}
                  onChange={(e) => setTeachLesson(e.target.value)}
                  className={fieldClass}
                  rows={2}
                  placeholder="Educational moral or key takeaway for kids (e.g., Always share and work together)..."
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className={labelClass}>
              <Wand2 className="w-4 h-4 text-primary" />
              {mode === 'multi' && selectedEpisode ? `Editing Episode ${selectedEpisode} Story` : 'Additional Instructions / Story Sandbox'}
            </label>
            <div className="w-full relative mt-2">
              <TiptapEditor editorRef={editorRef} />
            </div>
          </div>
        </GlassPanel>
      )}

    </div>
  );
}
