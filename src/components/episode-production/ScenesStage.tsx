'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';
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

  const allHaveScenes =
    episodeLocations.length > 0 &&
    episodeLocations.every((el) => scenes.some((s) => s.episode_location_id === el.id));

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {episodeLocations.map((el) => {
        const locationScenes = scenes
          .filter((s) => s.episode_location_id === el.id)
          .sort((a, b) => a.order_index - b.order_index);
        return (
          <div key={el.id} className="p-5 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-foreground">{el.Location.name}</h4>
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
            {locationScenes.length > 0 && (
              <ul className="space-y-2">
                {locationScenes.map((scene) => (
                  <li key={scene.id} className="text-sm text-muted-foreground p-3 rounded-lg bg-background/50 border border-border/50">
                    <span className="font-semibold text-foreground">Scene {scene.scene_number}: </span>
                    {scene.description}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <button type="button" onClick={onAllDetected} disabled={!allHaveScenes} className={primaryButtonClass}>
        <Check className="w-4 h-4" />
        Continue to Storyboards
      </button>
    </div>
  );
}
