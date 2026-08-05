"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { GlassPanel } from "@/components/GlassPanel";
import { labelClass, primaryButtonClass, secondaryButtonClass, selectFieldClass } from "@/lib/styles";
import { MapPin, BookOpen, Sparkles, Loader2, Check, Wand2, Quote, Save, Building, ArrowRight } from "lucide-react";
import Link from "next/link";

interface StoryRecord {
  id: string;
  topic?: string;
  concept?: string;
  content?: string;
  generation_type?: string;
  episode_number?: string;
  generated_at?: string;
}

interface DetectedLocation {
  name: string;
  description: string;
  story_excerpt: string;
  order_index: number;
}

export default function LocationNewPage() {
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [isLoadingStories, setIsLoadingStories] = useState<boolean>(true);
  const [selectedStoryId, setSelectedStoryId] = useState<string>('');
  const [selectedStory, setSelectedStory] = useState<StoryRecord | null>(null);

  const [detectedLocations, setDetectedLocations] = useState<DetectedLocation[]>([]);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track which locations have been saved to database
  const [savedIndexes, setSavedIndexes] = useState<Record<number, boolean>>({});
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  useEffect(() => {
    async function loadStories() {
      setIsLoadingStories(true);
      try {
        const apiRes = await fetch("/api/stories");
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data.stories && Array.isArray(data.stories)) {
            setStories(data.stories);
          }
        }
      } catch (e) {
        console.error("Error loading stories:", e);
      } finally {
        setIsLoadingStories(false);
      }
    }
    loadStories();
  }, []);

  const handleStorySelect = (storyId: string) => {
    setSelectedStoryId(storyId);
    setError(null);
    setDetectedLocations([]);
    setSavedIndexes({});

    const found = stories.find((s) => s.id === storyId);
    if (found) {
      setSelectedStory(found);
    } else {
      setSelectedStory(null);
    }
  };

  const handleDetectLocations = async () => {
    if (!selectedStory) return;
    setIsDetecting(true);
    setError(null);

    try {
      const storyContent = selectedStory.content || selectedStory.concept || selectedStory.topic || "";
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'location-detect',
          content: { storyContent }
        }),
      });

      if (!res.ok) throw new Error('Failed to extract locations from story.');
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);

      if (data.result && Array.isArray(data.result) && data.result.length > 0) {
        setDetectedLocations(data.result);
      } else {
        setError('No distinct locations were automatically detected for this story.');
      }
    } catch (err: any) {
      console.error("AI Location detection error:", err);
      setError(err?.message || "Failed to generate locations.");
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSaveLocationToDatabase = async (loc: DetectedLocation, index: number) => {
    setSavingIndex(index);
    setError(null);

    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: loc.name,
          description: loc.description
        }),
      });

      if (!res.ok) throw new Error(`Failed to save location "${loc.name}".`);

      setSavedIndexes((prev) => ({ ...prev, [index]: true }));
    } catch (err: any) {
      console.error("Error saving location:", err);
      setError(err?.message || "Failed to save location.");
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <div className="max-w-[1100px] w-full text-left space-y-6 page-enter pb-12">
      <PageHeader
        icon={MapPin}
        title="Location"
        highlight="Generator"
        description="Select a bedtime story to detect, preview, and generate its 3D location settings."
      />

      {/* Main GlassPanel Container */}
      <GlassPanel>
        <div className="space-y-6 text-left">
          {/* Dropdown Section */}
          <div className="space-y-2 text-left">
            <label className={labelClass}>
              <BookOpen className="w-4 h-4 text-primary" />
              Select Story from Database
            </label>
            
            {isLoadingStories ? (
              <div className="flex items-center justify-start gap-2 py-3 px-4 rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground text-left">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Fetching stories from database...</span>
              </div>
            ) : stories.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-border text-sm text-muted-foreground text-left">
                No stories found in database.
              </div>
            ) : (
              <select
                value={selectedStoryId}
                onChange={(e) => handleStorySelect(e.target.value)}
                className={selectFieldClass}
              >
                <option value="">-- Choose a fetched story from database --</option>
                {stories.map((story) => (
                  <option key={story.id} value={story.id}>
                    {story.topic || story.concept?.slice(0, 40) || "Untitled Story"}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Selected Story Context Box */}
          {selectedStory && (
            <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4 text-left animate-in fade-in duration-300">
              <div className="flex items-center justify-between gap-3 flex-wrap text-left">
                <h3 className="font-bold text-foreground text-base flex items-center gap-2 text-left">
                  <Sparkles className="w-4.5 h-4.5 text-primary" />
                  {selectedStory.topic || "Selected Story Narrative"}
                </h3>
                
              </div>

              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed text-left">
                {selectedStory.content
                  ? selectedStory.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                  : selectedStory.concept || "No content summary available."}
              </p>

              <div className="pt-2 flex items-center justify-start gap-3">
                <button
                  type="button"
                  onClick={handleDetectLocations}
                  disabled={isDetecting}
                  className={primaryButtonClass}
                >
                  {isDetecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing & Generating Locations...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Generate Locations with AI
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl text-sm font-medium text-left">
              {error}
            </div>
          )}
        </div>
      </GlassPanel>

      
      {detectedLocations.length > 0 && (
        <div className="space-y-4 text-left animate-in fade-in slide-in-from-bottom-4 duration-400 pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2 text-left">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2 text-left">
              
              Generated Locations ({detectedLocations.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
            {detectedLocations.map((loc, index) => {
              const isSaved = !!savedIndexes[index];
              const isSavingThis = savingIndex === index;

              return (
                <GlassPanel key={index} className="flex flex-col justify-between h-full space-y-4 text-left border-border/70 hover:border-primary/40 transition-colors">
                  <div className="space-y-3 text-left">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 text-left">
                      <div className="flex items-center gap-2.5 text-left">

                        <h3 className="font-bold text-foreground text-lg text-left">
                          {loc.name}
                        </h3>
                      </div>
                      
                      {isSaved && (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                          <Check className="w-3.5 h-3.5" /> Saved
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed text-left">
                      {loc.description}
                    </p>

                    {/* Story Excerpt snippet */}
                    {loc.story_excerpt && (
                      <div className="p-3 rounded-xl bg-muted/40 border border-border/50 space-y-1 text-left">
                        <span className="text-[11px] font-bold text-primary flex items-center gap-1.5 uppercase tracking-wider text-left">
                          <Quote className="w-3 h-3 text-primary" /> Story Excerpt
                        </span>
                        <p className="text-xs text-muted-foreground italic line-clamp-3 leading-relaxed text-left">
                          "{loc.story_excerpt}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-border/50 flex items-center justify-end gap-2 text-left">
                    <button
                      type="button"
                      onClick={() => handleSaveLocationToDatabase(loc, index)}
                      disabled={isSaved || isSavingThis}
                      className={isSaved ? secondaryButtonClass + " text-xs opacity-80 cursor-default" : primaryButtonClass + " text-xs"}
                    >
                      {isSavingThis ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : isSaved ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          Saved to Library
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          Save to Library
                        </>
                      )}
                    </button>
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}