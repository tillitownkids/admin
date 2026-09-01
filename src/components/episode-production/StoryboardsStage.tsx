'use client';

import { useEffect, useState } from 'react';
import { Image as ImageIcon, Sparkles, Loader2, Check, RefreshCw, ExternalLink, Film, Code, MapPin, User, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';


import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/styles';
import type { CharacterRow, EpisodeLocationRow, SceneRow } from './types';



interface StoryboardsStageProps {
  scenes: SceneRow[];
  characters: CharacterRow[];
  episodeLocations: EpisodeLocationRow[];
  onRefetchScenes: () => Promise<void>;
  onConfirmed: () => Promise<void> | void;
}

function extractImageUrl(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string' && data.startsWith('http')) return data;

  const d = data.json || data;

  // 1. Direct url or results.url on item
  if (d.results?.url) return d.results.url;
  if (d.results?.thumbnailUrl) return d.results.thumbnailUrl;
  if (Array.isArray(d.results) && d.results[0]?.url) return d.results[0].url;
  if (d.url) return d.url;
  if (d.imageUrl) return d.imageUrl;
  if (d.thumbnailUrl) return d.thumbnailUrl;

  // 2. Check scenes array inside result or root
  const scenes = Array.isArray(d.result?.scenes) ? d.result.scenes : Array.isArray(d.scenes) ? d.scenes : null;
  if (scenes && scenes[0]) {
    const scUrl = extractImageUrl(scenes[0]);
    if (scUrl) return scUrl;
  }

  // 3. Check result.results or result.url
  if (d.result?.results?.url) return d.result.results.url;
  if (d.result?.results?.thumbnailUrl) return d.result.results.thumbnailUrl;
  if (Array.isArray(d.result?.results) && d.result.results[0]?.url) return d.result.results[0].url;
  if (d.result?.url) return d.result.url;

  // 4. Array format
  if (Array.isArray(data) && data[0]) {
    return extractImageUrl(data[0]);
  }

  return null;
}

function extractMagnificIdentifier(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string') return null;

  const d = data.json || data;

  if (d.identifier) return d.identifier;
  if (d.magnific_identifier) return d.magnific_identifier;
  if (d.magnific_id) return d.magnific_id;
  if (d.results?.identifier) return d.results.identifier;

  const scenes = Array.isArray(d.result?.scenes) ? d.result.scenes : Array.isArray(d.scenes) ? d.scenes : null;
  if (scenes && scenes[0]) {
    const magId = extractMagnificIdentifier(scenes[0]);
    if (magId) return magId;
  }

  if (d.result?.identifier) return d.result.identifier;
  if (d.result?.results?.identifier) return d.result.results.identifier;
  if (Array.isArray(data) && data[0]) return extractMagnificIdentifier(data[0]);
  return null;
}





export function StoryboardsStage({
  scenes,
  characters,
  episodeLocations,
  onRefetchScenes,
  onConfirmed,
}: StoryboardsStageProps) {
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [generatedUrls, setGeneratedUrls] = useState<Record<string, string>>({});
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, { url: string; magnificId?: string | null }>>({});
  const [lastPayload, setLastPayload] = useState<any | null>(null);
  const [showPayloadDebug, setShowPayloadDebug] = useState(false);

  const sortedScenes = [...scenes].sort((a, b) => a.scene_number - b.scene_number || a.order_index - b.order_index);

  // Pending / Un-generated scenes
  const pendingScenes = sortedScenes.filter(
    (scene) => !scene.storyboard_image_url && !generatedUrls[scene.id]
  );

  // Helper to build individual scene payload item matching n8n format
  const buildPayloadItem = (scene: SceneRow, sceneIdx: number) => {
    const imagePrompt = scene.storyboard_prompt || scene.description || '';

    // Match characters appearing in prompt/description
    const activeChars = characters.filter((c) => {
      if (c.name && (imagePrompt.toLowerCase().includes(c.name.toLowerCase()) || scene.description.toLowerCase().includes(c.name.toLowerCase()))) {
        return true;
      }
      return false;
    });

    const charRefs: Record<string, string> = {};
    for (const c of activeChars) {
      charRefs[c.name] = c.magnific_identifier || c.id;
    }

    // Match locations: episodeLocation matching scene
    const locRefs: Record<string, string> = {};
    const matchedEpLoc = episodeLocations.find(
      (el) => el.id === scene.episode_location_id || el.Location.name.toLowerCase() === scene.locationName.toLowerCase()
    );

    if (matchedEpLoc) {
      locRefs[matchedEpLoc.Location.name] = matchedEpLoc.Location.magnific_identifier || matchedEpLoc.Location.id;
    } else if (scene.locationName) {
      locRefs[scene.locationName] = `loc_${scene.locationName.toLowerCase().replace(/\s+/g, '_')}`;
    }

    return {
      id: scene.id,
      imagePrompt,
      references: {
        characters: charRefs,
        locations: locRefs,
      },
    };
  };

  // Group Generation ("Generate All Storyboards")
  const handleGenerateAll = async () => {
    const scenesToGenerate = pendingScenes.length > 0 ? pendingScenes : sortedScenes;
    if (scenesToGenerate.length === 0) return;

    setIsGeneratingAll(true);
    setGlobalMessage(null);

    try {
      const payloadScenes = scenesToGenerate.map((scene, idx) =>
        buildPayloadItem(scene, idx)
      );

      const fullPayload = { scenes: payloadScenes };

      const res = await fetch('https://n8n.roastnest.com/webhook/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullPayload),
      });

      if (!res.ok) {
        throw new Error(`Webhook returned HTTP status ${res.status}`);
      }

      const data = await res.json().catch(() => null);


      const newUrls: Record<string, { url: string; magnificId?: string | null }> = {};
      if (Array.isArray(data)) {
        data.forEach((item: any, idx: number) => {
          const itemId = item.id || item.sceneId || item.scene_id || item.result?.id || item.result?.sceneId;
          const targetScene = sortedScenes.find((s) => s.id === itemId) || scenesToGenerate[idx] || sortedScenes[idx];
          const url = extractImageUrl(item);
          const magId = extractMagnificIdentifier(item);
          if (targetScene && url) {
            newUrls[targetScene.id] = { url, magnificId: magId };
          }
        });
      } else if (data && typeof data === 'object') {
        const scenesArr = Array.isArray(data.scenes)
          ? data.scenes
          : Array.isArray(data.result?.scenes)
          ? data.result.scenes
          : null;

        if (scenesArr) {
          scenesArr.forEach((item: any, idx: number) => {
            const itemId = item.id || item.sceneId || item.scene_id || item.result?.id || item.result?.sceneId;
            const targetScene = sortedScenes.find((s) => s.id === itemId) || scenesToGenerate[idx] || sortedScenes[idx];
            const url = extractImageUrl(item);
            const magId = extractMagnificIdentifier(item);
            if (targetScene && url) {
              newUrls[targetScene.id] = { url, magnificId: magId };
            }
          });
        } else {
          const url = extractImageUrl(data);
          const magId = extractMagnificIdentifier(data);
          if (url && sortedScenes.length > 0) {
            const targetScene = scenesToGenerate[0] || sortedScenes[0];
            newUrls[targetScene.id] = { url, magnificId: magId };
          }
        }
      }


      if (Object.keys(newUrls).length > 0) {
        const urlMap: Record<string, string> = {};
        Object.entries(newUrls).forEach(([scId, info]) => {
          urlMap[scId] = info.url;
        });
        setGeneratedUrls((prev) => ({ ...prev, ...urlMap }));
        setPendingUpdates((prev) => ({ ...prev, ...newUrls }));
        setGlobalMessage({ type: 'success', text: 'Operation successful' });
      } else {
        setGlobalMessage({ type: 'success', text: 'Operation successful' });
      }

    } catch (err: any) {
      console.error('Error generating storyboards:', err);
      setGlobalMessage({ type: 'error', text: err.message || 'Operation failed' });
    } finally {
      setIsGeneratingAll(false);
    }
  };


  const handleSingleGenerated = (sceneId: string, url: string, magnificId?: string | null) => {
    setGeneratedUrls((prev) => ({ ...prev, [sceneId]: url }));
    setPendingUpdates((prev) => ({ ...prev, [sceneId]: { url, magnificId } }));
  };

  const handleConfirmClick = async () => {
    setIsConfirming(true);
    try {
      if (Object.keys(pendingUpdates).length > 0) {
        await Promise.all(
          Object.entries(pendingUpdates).map(([scId, info]) =>
            fetch(`/api/scenes/${scId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                storyboard_image_url: info.url,
                storyboard_status: 'generated',
                magnific_identifier: info.magnificId || undefined,
              }),
            })
          )
        );
        await onRefetchScenes();
      }
      await onConfirmed();
    } catch (err: any) {
      console.error('Error confirming storyboards:', err);
      setGlobalMessage({ type: 'error', text: err.message || 'Failed to save confirmed storyboards.' });
    } finally {
      setIsConfirming(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Top Bar with Group Action */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            Storyboard Generation
          </h3>
          <p className="text-sm text-muted-foreground">
            Generate AI storyboards individually per scene or as a complete episode group.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateAll}
            disabled={isGeneratingAll || sortedScenes.length === 0}
            className={primaryButtonClass}
          >
            {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {pendingScenes.length > 0
              ? `Generate All Storyboards (${pendingScenes.length} remaining)`
              : `Regenerate All Storyboards (${sortedScenes.length})`}
          </button>
        </div>
      </div>

      {globalMessage && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center gap-2 ${
            globalMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-destructive/10 text-destructive border-destructive/20'
          }`}
        >
          <span>{globalMessage.text}</span>
        </div>
      )}


      {/* Scene Items */}
      <div className="space-y-4">
        {sortedScenes.map((scene, idx) => (
          <StoryboardItem
            key={scene.id || idx}
            scene={scene}
            sceneIdx={idx}
            characters={characters}
            episodeLocations={episodeLocations}
            overrideImageUrl={generatedUrls[scene.id]}
            buildPayloadItem={buildPayloadItem}
            onSingleGenerated={handleSingleGenerated}
          />

        ))}
      </div>

      {/* Bottom Stage Action */}
      <div className="pt-4 border-t border-border/60 flex justify-end">
        <button
          type="button"
          onClick={handleConfirmClick}
          disabled={isConfirming}
          className={primaryButtonClass}
        >
          {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Confirm Storyboards
        </button>
      </div>
    </div>
  );
}

function StoryboardItem({
  scene,
  sceneIdx,
  characters,
  episodeLocations,
  overrideImageUrl,
  buildPayloadItem,
  onSingleGenerated,
}: {
  scene: SceneRow;
  sceneIdx: number;
  characters: CharacterRow[];
  episodeLocations: EpisodeLocationRow[];
  overrideImageUrl?: string;
  buildPayloadItem: (scene: SceneRow, sceneIdx: number) => any;
  onSingleGenerated: (sceneId: string, url: string, magnificId?: string | null) => void;
}) {
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);
  const [returnedUrl, setReturnedUrl] = useState<string | null>(overrideImageUrl || scene.storyboard_image_url);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [isScriptBeatsOpen, setIsScriptBeatsOpen] = useState(false);

  useEffect(() => {
    if (overrideImageUrl) {
      setReturnedUrl(overrideImageUrl);
    } else if (scene.storyboard_image_url) {
      setReturnedUrl(scene.storyboard_image_url);
    }
  }, [overrideImageUrl, scene.storyboard_image_url]);

  const promptText = (scene.storyboard_prompt || scene.description || '').toLowerCase();
  const sceneChars = characters.filter((c) => c.name && promptText.includes(c.name.toLowerCase()));

  const handleGenerateSingle = async () => {
    setIsGeneratingSingle(true);
    setError(null);
    setStatusMessage(null);

    try {
      // 1. Build payload matching required format
      const sceneItem = buildPayloadItem(
        scene,
        sceneIdx
      );
      const payload = { scenes: [sceneItem] };

      // 2. Send HTTP POST request to webhook
      const res = await fetch('https://n8n.roastnest.com/webhook/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Webhook returned HTTP status ${res.status}`);
      }

      const data = await res.json().catch(() => null);


      const imgUrl = extractImageUrl(data);
      const magId = extractMagnificIdentifier(data);

      if (imgUrl) {
        setReturnedUrl(imgUrl);
        onSingleGenerated(scene.id, imgUrl, magId);
        setStatusMessage('Operation successful');
      } else {
        setStatusMessage('Operation successful');
      }

    } catch (err: any) {
      console.error('Error generating single storyboard:', err);
      setError(err.message || 'Operation failed');
    } finally {
      setIsGeneratingSingle(false);
    }
  };





  const displayUrl = overrideImageUrl || returnedUrl || scene.storyboard_image_url;


  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-4">
      {/* Scene Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0">
            #{scene.scene_number || sceneIdx + 1}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-foreground line-clamp-1">
                {scene.description || `Scene #${scene.scene_number || sceneIdx + 1}`}
              </h4>
              {scene.beat_numbers && (
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-xs font-bold border border-emerald-500/20">
                  Beats {Array.isArray(scene.beat_numbers) ? scene.beat_numbers.join(', ') : scene.beat_numbers}
                </span>
              )}
            </div>
            {scene.locationName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 font-medium">
                <MapPin className="w-3 h-3 text-emerald-500" />
                {scene.locationName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Script Beats & Dialogues Accordion */}
      {scene.script_beats && (
        <div className="border border-border/50 rounded-xl overflow-hidden bg-muted/10">
          <button
            type="button"
            onClick={() => setIsScriptBeatsOpen(!isScriptBeatsOpen)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-foreground bg-muted/20 hover:bg-muted/40 transition-colors"
          >
            <span className="flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
              Script Beats & Spoken Dialogues
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground font-normal">
              {isScriptBeatsOpen ? 'Hide Beats' : 'Show Beats'}
              {isScriptBeatsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </button>
          {isScriptBeatsOpen && (
            <div className="p-3 border-t border-border/40 bg-background/50">
              <p className="text-xs font-mono text-foreground leading-relaxed whitespace-pre-wrap">
                {scene.script_beats}
              </p>
            </div>
          )}
        </div>
      )}



      {error && <p className="text-sm text-destructive">{error}</p>}

      {statusMessage && <p className="text-sm text-emerald-500 font-medium">{statusMessage}</p>}

      {/* Characters in this scene (Read-only Display) */}
      {sceneChars.length > 0 && (
        <div className="space-y-1.5">
          <label className={labelClass}>Characters in this scene</label>
          <div className="flex flex-wrap gap-2">
            {sceneChars.map((c) => (
              <span
                key={c.id}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5 text-primary" />
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}


      {/* Storyboard Prompt (Read-only / Confirmed) */}
      <div className="space-y-1.5">
        <label className={labelClass}>Confirmed Storyboard Image Prompt</label>
        <p className="text-sm font-mono text-muted-foreground bg-muted/20 p-3 rounded-lg border border-border/50 leading-relaxed">
          {scene.storyboard_prompt || scene.description || 'No prompt set.'}
        </p>
      </div>


      {/* Returned Image Display */}
      {displayUrl && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <label className={labelClass}>Generated Storyboard Image</label>
          <a
            href={displayUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Click to open image in new tab"
            className="block max-w-md cursor-pointer group overflow-hidden rounded-xl border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl}
              alt={`Scene ${scene.scene_number}`}
              className="w-full object-cover max-h-[300px] transition-transform duration-200 group-hover:scale-[1.02]"
            />
          </a>
        </div>
      )}


      {/* Actions */}
      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={handleGenerateSingle}
          disabled={isGeneratingSingle}
          className={primaryButtonClass}
        >

          {isGeneratingSingle ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : displayUrl ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {displayUrl ? 'Regenerate Storyboard' : 'Generate Storyboard'}
        </button>


      </div>
    </div>
  );
}
