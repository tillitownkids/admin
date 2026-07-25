'use client';

import { useState } from 'react';
import { Image as ImageIcon, Sparkles, Loader2, Check, RefreshCw } from 'lucide-react';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/styles';
import type { EpisodeLocationRow } from './types';

interface StylesheetsStageProps {
  episodeLocations: EpisodeLocationRow[];
  onRefetch: () => Promise<void>;
  onAllApproved: () => void;
}

export function StylesheetsStage({ episodeLocations, onRefetch, onAllApproved }: StylesheetsStageProps) {
  const allApproved = episodeLocations.length > 0 && episodeLocations.every((el) => el.status === 'approved');

  return (
    <div className="space-y-6">
      {episodeLocations.map((el) => (
        <StylesheetItem key={el.id} episodeLocation={el} onRefetch={onRefetch} />
      ))}

      <button type="button" onClick={onAllApproved} disabled={!allApproved} className={primaryButtonClass}>
        <Check className="w-4 h-4" />
        Continue to Scenes
      </button>
    </div>
  );
}

function StylesheetItem({
  episodeLocation,
  onRefetch,
}: {
  episodeLocation: EpisodeLocationRow;
  onRefetch: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(episodeLocation.stylesheet_prompt);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGeneratePrompt = async () => {
    setIsGeneratingPrompt(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'stylesheet-prompt',
          content: {
            locationName: episodeLocation.Location.name,
            locationDescription: episodeLocation.Location.description,
            storyExcerpt: episodeLocation.Location.description,
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to generate prompt.');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPrompt(data.result);
      await fetch(`/api/episode-locations/${episodeLocation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stylesheet_prompt: data.result }),
      });
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!prompt.trim()) return;
    setIsGeneratingImage(true);
    setError(null);
    try {
      await fetch(`/api/episode-locations/${episodeLocation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stylesheet_prompt: prompt }),
      });
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptText: prompt,
          ownerType: 'episode_location_stylesheet',
          ownerId: episodeLocation.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate image.');
      }
      await onRefetch();
    } catch (err: any) {
      setError(err.message || 'Image generation failed.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    setError(null);
    try {
      await fetch(`/api/episode-locations/${episodeLocation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
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
        <h4 className="text-lg font-bold text-foreground">{episodeLocation.Location.name}</h4>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
            episodeLocation.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-secondary text-secondary-foreground'
          }`}
        >
          {episodeLocation.status}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <label className={labelClass}>Stylesheet Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className={fieldClass}
          rows={3}
          placeholder="Generate or write an image prompt for this location..."
        />
        <button type="button" onClick={handleGeneratePrompt} disabled={isGeneratingPrompt} className={secondaryButtonClass}>
          {isGeneratingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {prompt ? 'Regenerate Prompt' : 'Generate Prompt'}
        </button>
      </div>

      {episodeLocation.stylesheet_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={episodeLocation.stylesheet_image_url}
          alt={episodeLocation.Location.name}
          className="w-full max-w-md rounded-lg border border-border"
        />
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleGenerateImage}
          disabled={isGeneratingImage || !prompt.trim()}
          className={primaryButtonClass}
        >
          {isGeneratingImage ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : episodeLocation.stylesheet_image_url ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <ImageIcon className="w-4 h-4" />
          )}
          {episodeLocation.stylesheet_image_url ? 'Regenerate Image' : 'Generate Image'}
        </button>
        {episodeLocation.stylesheet_image_url && episodeLocation.status !== 'approved' && (
          <button type="button" onClick={handleApprove} disabled={isApproving} className={secondaryButtonClass}>
            {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Approve
          </button>
        )}
      </div>
    </div>
  );
}
