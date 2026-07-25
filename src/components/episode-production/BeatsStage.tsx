'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Check, Save } from 'lucide-react';
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/lib/styles';
import type { BeatRow, SceneRow } from './types';

interface BeatsStageProps {
  scenes: SceneRow[];
  onRefetchScenes: () => Promise<void>;
  onComplete: () => void;
}

export function BeatsStage({ scenes, onRefetchScenes, onComplete }: BeatsStageProps) {
  const sorted = [...scenes].sort(
    (a, b) => a.locationName.localeCompare(b.locationName) || a.order_index - b.order_index
  );
  const allApproved = scenes.length > 0 && scenes.every((s) => s.beats_status === 'approved');

  return (
    <div className="space-y-6">
      {sorted.map((scene) => (
        <BeatItem key={scene.id} scene={scene} onRefetch={onRefetchScenes} />
      ))}

      <button type="button" onClick={onComplete} disabled={!allApproved} className={primaryButtonClass}>
        <Check className="w-4 h-4" />
        Complete Production
      </button>
    </div>
  );
}

function BeatItem({ scene, onRefetch }: { scene: SceneRow; onRefetch: () => Promise<void> }) {
  const [beats, setBeats] = useState<BeatRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBeats = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/beats?sceneId=${scene.id}`);
      if (res.ok) {
        const data = await res.json();
        setBeats(data.beats || []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBeats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'beat-script',
          content: { sceneDescription: scene.description, storyboardPrompt: scene.storyboard_prompt },
        }),
      });
      if (!res.ok) throw new Error('Failed to generate beats.');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const items = data.result || [];
      if (items.length > 0) {
        await fetch('/api/beats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneId: scene.id, items }),
        });
      }
      await fetchBeats();
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateBeatField = (id: string, field: 'action' | 'camera' | 'motion' | 'dialogue' | 'sfx', value: string) => {
    setBeats((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };

  const saveBeat = async (beat: BeatRow) => {
    setSavingId(beat.id);
    try {
      await fetch(`/api/beats/${beat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: beat.action,
          camera: beat.camera,
          motion: beat.motion,
          dialogue: beat.dialogue,
          sfx: beat.sfx,
        }),
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    setError(null);
    try {
      await fetch(`/api/scenes/${scene.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beats_status: 'approved' }),
      });
      await onRefetch();
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-foreground">
          {scene.locationName} — Scene {scene.scene_number}
        </h4>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
            scene.beats_status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-secondary text-secondary-foreground'
          }`}
        >
          {scene.beats_status}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!isLoading && beats.length === 0 && (
        <button type="button" onClick={handleGenerate} disabled={isGenerating} className={primaryButtonClass}>
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate Beats
        </button>
      )}

      {beats.length > 0 && (
        <div className="space-y-4">
          {beats.map((beat) => (
            <div key={beat.id} className="p-4 rounded-lg bg-background/50 border border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">Beat {beat.beat_number}</span>
                <button
                  type="button"
                  onClick={() => saveBeat(beat)}
                  disabled={savingId === beat.id}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                >
                  {savingId === beat.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(['action', 'camera', 'motion', 'sfx'] as const).map((field) => (
                  <div key={field} className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{field}</label>
                    <textarea
                      value={beat[field]}
                      onChange={(e) => updateBeatField(beat.id, field, e.target.value)}
                      className={`${fieldClass} text-sm`}
                      rows={2}
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dialogue</label>
                <textarea
                  value={beat.dialogue}
                  onChange={(e) => updateBeatField(beat.id, 'dialogue', e.target.value)}
                  className={`${fieldClass} text-sm`}
                  rows={2}
                />
              </div>
            </div>
          ))}

          {scene.beats_status !== 'approved' && (
            <button type="button" onClick={handleApprove} disabled={isApproving} className={secondaryButtonClass}>
              {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Approve Beats
            </button>
          )}
        </div>
      )}
    </div>
  );
}
