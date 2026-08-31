'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Check, ChevronDown, Film, BookOpen } from 'lucide-react';
import { primaryButtonClass } from '@/lib/styles';
import type { EpisodeLocationRow, SceneRow } from './types';

interface ScenesStageProps {
  episodeLocations: EpisodeLocationRow[];
  scenes: SceneRow[];
  onRefetchScenes: () => Promise<void>;
  onAllDetected: () => void;
}

export function ScenesStage({ episodeLocations, scenes, onRefetchScenes, onAllDetected }: ScenesStageProps) {
  const [detectingId, setDetectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSceneIds, setOpenSceneIds] = useState<Record<string, boolean>>({});

  const toggleScene = (id: string) => {
    setOpenSceneIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDetect = async (el: EpisodeLocationRow) => {
    setDetectingId(el.id);
    setError(null);
    try {
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'scene-detect',
          content: { locationName: el.Location.name, storyExcerpt: el.stylesheet_prompt || el.Location.description },
        }),
      });
      if (!res.ok) throw new Error('Failed to detect scenes.');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const items = data.result || [];
      if (items.length > 0) {
        await fetch('/api/scenes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeLocationId: el.id, items }),
        });
      }
      await onRefetchScenes();
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setDetectingId(null);
    }
  };

  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirmScenes = async () => {
    setIsConfirming(true);
    try {
      await onAllDetected();
    } finally {
      setIsConfirming(false);
    }
  };

  const canContinue = scenes.length > 0;


  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {episodeLocations.length > 0 ? (
        episodeLocations.map((el) => {
          const locationScenes = scenes
            .filter((s) => s.episode_location_id === el.id)
            .sort((a, b) => a.order_index - b.order_index);

          const displayScenes = locationScenes.length > 0 ? locationScenes : scenes;

          return (
            <div key={el.id} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <Film className="w-5 h-5 text-primary" />
                  <h4 className="text-lg font-bold text-foreground">{el.Location.name}</h4>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                    {displayScenes.length} Scene{displayScenes.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {locationScenes.length === 0 && (
                  <button
                    type="button"
                    onClick={() => handleDetect(el)}
                    disabled={detectingId === el.id}
                    className={primaryButtonClass}
                  >
                    {detectingId === el.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Detect Scenes
                  </button>
                )}
              </div>

              {displayScenes.length > 0 && (
                <div className="space-y-3">
                  {displayScenes.map((scene, idx) => {
                    const sceneKey = scene.id || `scene-${idx}`;
                    const isOpen = openSceneIds[sceneKey] ?? (idx === 0);
                    return (
                      <div
                        key={sceneKey}
                        className="rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/40"
                      >
                        {/* Dropdown Header Bar */}
                        <div
                          onClick={() => toggleScene(sceneKey)}
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors select-none"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0">
                              #{scene.scene_number || idx + 1}
                            </span>
                            <h5 className="font-bold text-sm text-foreground line-clamp-1">
                              {scene.description ? (scene.description.length > 80 ? scene.description.slice(0, 80) + '...' : scene.description) : `Scene #${scene.scene_number}`}
                            </h5>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-medium text-muted-foreground">
                              {isOpen ? 'Hide Details' : 'View Scene Details'}
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                                isOpen ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                        </div>

                        {/* Collapsible Dropdown Content Body */}
                        {isOpen && (
                          <div className="p-4 pt-3 border-t border-border/60 bg-muted/20 space-y-3 animate-in fade-in duration-200">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                                <BookOpen className="w-3.5 h-3.5 text-primary" />
                                Scene Script & Description
                              </label>
                              <p className="text-sm text-foreground leading-relaxed">
                                {scene.description || 'No detailed scene description provided.'}
                              </p>
                            </div>

                            {scene.storyboard_prompt && (
                              <div className="space-y-1 pt-1">
                                <label className="text-xs font-semibold text-muted-foreground">
                                  Storyboard Prompt Context
                                </label>
                                <p className="text-xs text-muted-foreground leading-relaxed font-mono">
                                  {scene.storyboard_prompt}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      ) : (
        /* Fallback if no locations exist */
        <div className="space-y-4">
          <div className="pb-2 border-b border-border/60">
            <h4 className="text-lg font-bold text-foreground">Episode Scenes ({scenes.length})</h4>
          </div>
          <div className="space-y-3">
            {scenes.map((scene, idx) => {
              const sceneKey = scene.id || `scene-${idx}`;
              const isOpen = openSceneIds[sceneKey] ?? (idx === 0);
              return (
                <div key={sceneKey} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div
                    onClick={() => toggleScene(sceneKey)}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 select-none"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm text-foreground shrink-0">
                        Scene #{scene.scene_number || idx + 1}
                      </span>
                      <p className="text-sm text-muted-foreground line-clamp-1">{scene.description}</p>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                  {isOpen && (
                    <div className="p-4 pt-3 border-t border-border/60 bg-muted/20">
                      <p className="text-sm text-foreground leading-relaxed">{scene.description}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}


      <div className="pt-4 border-t border-border/60 flex justify-end">
        <button
          type="button"
          onClick={handleConfirmScenes}
          disabled={!canContinue || isConfirming}
          className={primaryButtonClass}
        >
          {isConfirming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Confirm Scenes
        </button>
      </div>

    </div>
  );
}

