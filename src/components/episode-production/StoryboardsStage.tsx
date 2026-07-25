'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, Sparkles, Loader2, Check, RefreshCw } from 'lucide-react';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/styles';
import type { CharacterRow, SceneRow } from './types';

interface StoryboardsStageProps {
  scenes: SceneRow[];
  characters: CharacterRow[];
  onRefetchScenes: () => Promise<void>;
  onAllApproved: () => void;
}

export function StoryboardsStage({ scenes, characters, onRefetchScenes, onAllApproved }: StoryboardsStageProps) {
  const sorted = [...scenes].sort(
    (a, b) => a.locationName.localeCompare(b.locationName) || a.order_index - b.order_index
  );
  const allApproved = scenes.length > 0 && scenes.every((s) => s.storyboard_status === 'approved');

  return (
    <div className="space-y-6">
      {sorted.map((scene) => (
        <StoryboardItem key={scene.id} scene={scene} characters={characters} onRefetch={onRefetchScenes} />
      ))}

      <button type="button" onClick={onAllApproved} disabled={!allApproved} className={primaryButtonClass}>
        <Check className="w-4 h-4" />
        Continue to Beats
      </button>
    </div>
  );
}

function StoryboardItem({
  scene,
  characters,
  onRefetch,
}: {
  scene: SceneRow;
  characters: CharacterRow[];
  onRefetch: () => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(scene.storyboard_prompt);
  const [isLoadingTags, setIsLoadingTags] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/scenes/${scene.id}/characters`);
        if (res.ok) {
          const data = await res.json();
          setSelectedIds((data.sceneCharacters || []).map((sc: { character_id: string }) => sc.character_id));
        }
      } finally {
        setIsLoadingTags(false);
      }
    })();
  }, [scene.id]);

  const toggleCharacter = async (characterId: string) => {
    setTogglingId(characterId);
    try {
      if (selectedIds.includes(characterId)) {
        await fetch(`/api/scenes/${scene.id}/characters?characterId=${characterId}`, { method: 'DELETE' });
        setSelectedIds((prev) => prev.filter((id) => id !== characterId));
      } else {
        await fetch(`/api/scenes/${scene.id}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId }),
        });
        setSelectedIds((prev) => [...prev, characterId]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleGeneratePrompt = async () => {
    setIsGeneratingPrompt(true);
    setError(null);
    try {
      const selectedCharacters = characters.filter((c) => selectedIds.includes(c.id));
      const res = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: 'storyboard-prompt',
          content: {
            sceneDescription: scene.description,
            locationContext: scene.locationName,
            characterNames: selectedCharacters.map((c) => c.name),
            characterDescriptions: selectedCharacters.map((c) => c.description),
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to generate prompt.');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPrompt(data.result);
      await fetch(`/api/scenes/${scene.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboard_prompt: data.result }),
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
      await fetch(`/api/scenes/${scene.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboard_prompt: prompt }),
      });
      const referenceImageUrls = characters
        .filter((c) => selectedIds.includes(c.id) && c.reference_image_url)
        .map((c) => c.reference_image_url as string);

      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptText: prompt,
          referenceImageUrls,
          ownerType: 'scene_storyboard',
          ownerId: scene.id,
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
      await fetch(`/api/scenes/${scene.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyboard_status: 'approved' }),
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
            scene.storyboard_status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-secondary text-secondary-foreground'
          }`}
        >
          {scene.storyboard_status}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{scene.description}</p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <label className={labelClass}>Characters in this scene</label>
        <div className="flex flex-wrap gap-2">
          {characters.length === 0 && <p className="text-sm text-muted-foreground">No characters in your library yet.</p>}
          {characters.map((c) => {
            const selected = selectedIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                disabled={isLoadingTags || togglingId === c.id}
                onClick={() => toggleCharacter(c.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors disabled:opacity-50 ${
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

      <div className="space-y-2">
        <label className={labelClass}>Storyboard Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className={fieldClass}
          rows={3}
          placeholder="Generate or write an image prompt for this shot..."
        />
        <button type="button" onClick={handleGeneratePrompt} disabled={isGeneratingPrompt} className={secondaryButtonClass}>
          {isGeneratingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {prompt ? 'Regenerate Prompt' : 'Generate Prompt'}
        </button>
      </div>

      {scene.storyboard_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={scene.storyboard_image_url}
          alt={`Scene ${scene.scene_number}`}
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
          ) : scene.storyboard_image_url ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <ImageIcon className="w-4 h-4" />
          )}
          {scene.storyboard_image_url ? 'Regenerate Image' : 'Generate Image'}
        </button>
        {scene.storyboard_image_url && scene.storyboard_status !== 'approved' && (
          <button type="button" onClick={handleApprove} disabled={isApproving} className={secondaryButtonClass}>
            {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Approve
          </button>
        )}
      </div>
    </div>
  );
}
