'use client';

import { useState } from 'react';
import { MapPin, Sparkles, Loader2, Check } from 'lucide-react';
import { fieldClass, labelClass, primaryButtonClass, selectFieldClass } from '@/lib/styles';
import type { EpisodeLocationRow, LocationLibraryRow } from './types';

interface DetectedLocationDraft {
  name: string;
  description: string;
  story_excerpt: string;
  order_index: number;
  linkedLocationId: string; // '' = create new
}

interface LocationsStageProps {
  storyId: string;
  storyContent: string;
  episodeLocations: EpisodeLocationRow[];
  locationLibrary: LocationLibraryRow[];
  onConfirmed: () => void;
}

export function LocationsStage({ storyId, storyContent, episodeLocations, locationLibrary, onConfirmed }: LocationsStageProps) {
  const [detected, setDetected] = useState<DetectedLocationDraft[] | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDetect = async () => {
    setIsDetecting(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType: 'location-detect', content: { storyContent } }),
      });
      if (!res.ok) throw new Error('Failed to detect locations.');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const items = (data.result || []).map((item: Omit<DetectedLocationDraft, 'linkedLocationId'>) => ({
        ...item,
        linkedLocationId: '',
      }));
      setDetected(items);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsDetecting(false);
    }
  };

  const updateDetected = (index: number, patch: Partial<DetectedLocationDraft>) => {
    setDetected((prev) => (prev ? prev.map((d, i) => (i === index ? { ...d, ...patch } : d)) : prev));
  };

  const handleConfirm = async () => {
    if (!detected?.length) return;
    setIsSaving(true);
    setError(null);
    try {
      const items = [];
      for (const d of detected) {
        let locationId = d.linkedLocationId;
        if (!locationId) {
          const res = await fetch('/api/locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: d.name, description: d.description }),
          });
          if (!res.ok) throw new Error(`Failed to create location "${d.name}".`);
          const data = await res.json();
          locationId = data.location.id;
        }
        items.push({ locationId, order_index: d.order_index, stylesheet_prompt: '' });
      }

      const res = await fetch('/api/episode-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId, items }),
      });
      if (!res.ok) throw new Error('Failed to save episode locations.');

      onConfirmed();
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  };

  if (episodeLocations.length > 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {episodeLocations.length} location{episodeLocations.length !== 1 ? 's' : ''} confirmed for this episode.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {episodeLocations.map((el) => (
            <div key={el.id} className="p-4 rounded-xl border border-border bg-card">
              <h4 className="font-bold text-foreground">{el.Location.name}</h4>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{el.Location.description}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!detected && (
        <button type="button" onClick={handleDetect} disabled={isDetecting} className={primaryButtonClass}>
          {isDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Detect Locations from Story
        </button>
      )}

      {detected && (
        <div className="space-y-4">
          {detected.map((d, i) => (
            <div key={i} className="p-4 rounded-xl border border-border bg-card space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className={labelClass}>
                    <MapPin className="w-4 h-4 text-primary" />
                    Name
                  </label>
                  <input
                    type="text"
                    value={d.name}
                    onChange={(e) => updateDetected(i, { name: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Link to existing location</label>
                  <select
                    value={d.linkedLocationId}
                    onChange={(e) => updateDetected(i, { linkedLocationId: e.target.value })}
                    className={selectFieldClass}
                  >
                    <option value="">Create new &quot;{d.name}&quot;</option>
                    {locationLibrary.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Description</label>
                <textarea
                  value={d.description}
                  onChange={(e) => updateDetected(i, { description: e.target.value })}
                  className={fieldClass}
                  rows={2}
                />
              </div>
            </div>
          ))}

          <button type="button" onClick={handleConfirm} disabled={isSaving} className={primaryButtonClass}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Confirm {detected.length} Location{detected.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
