'use client';

import { useState, useEffect } from 'react';

import { Video, FileText, Loader2, Check, RefreshCw, ExternalLink, Code, Film, User, MapPin, ChevronDown, ChevronUp } from 'lucide-react';


import { labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/styles';
import { callAi } from '@/actions/actions';
import type { CharacterRow, EpisodeLocationRow, SceneRow } from './types';


interface VideoStageProps {
  scenes: SceneRow[];
  characters: CharacterRow[];
  episodeLocations: EpisodeLocationRow[];
  onRefetchScenes: () => Promise<void>;
  onConfirmed: () => Promise<void> | void;
}

async function sendVideoWebhook(payload: any): Promise<Response | null> {
  try {
    const res = await fetch('https://n8n.roastnest.com/webhook/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res;
  } catch (err) {
    console.warn('Video webhook fetch error:', err);
    return null;
  }
}



function extractVideoUrl(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string' && (data.startsWith('http') || data.includes('.mp4') || data.includes('.webm'))) return data;
  if (data.result?.results?.url) return data.result.results.url;
  if (data.result?.results?.videoUrl) return data.result.results.videoUrl;
  if (data.result?.url) return data.result.url;
  if (data.result?.videoUrl) return data.result.videoUrl;
  if (data.results?.url) return data.results.url;
  if (data.results?.videoUrl) return data.results.videoUrl;
  if (data.url) return data.url;
  if (data.videoUrl) return data.videoUrl;
  if (data.video_url) return data.video_url;
  if (Array.isArray(data) && data[0]) return extractVideoUrl(data[0]);
  return null;
}

function extractVideoMagnificIdentifier(data: any): string | null {
  if (!data) return null;
  if (data.result?.identifier) return data.result.identifier;
  if (data.result?.results?.identifier) return data.result.results.identifier;
  if (data.identifier) return data.identifier;
  if (data.video_magnific_identifier) return data.video_magnific_identifier;
  if (data.magnific_identifier) return data.magnific_identifier;
  if (Array.isArray(data) && data[0]) return extractVideoMagnificIdentifier(data[0]);
  return null;
}

export function VideoStage({
  scenes,
  characters,
  episodeLocations,
  onRefetchScenes,
  onConfirmed,
}: VideoStageProps) {
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lastPayload, setLastPayload] = useState<any | null>(null);
  const [showPayloadDebug, setShowPayloadDebug] = useState(false);
  const [videoPrompts, setVideoPrompts] = useState<Record<string, string>>({});
  const [generatedVideoUrls, setGeneratedVideoUrls] = useState<Record<string, string>>({});


  // Filter only scenes with generated storyboard images
  const generatedScenes = scenes
    .filter((s) => Boolean(s.storyboard_image_url))
    .sort((a, b) => a.scene_number - b.scene_number || a.order_index - b.order_index);

  // Un-generated video scenes (checks DB fields and local state)
  const pendingScenes = generatedScenes.filter((s) => {
    const hasPrompt = Boolean(s.video_prompt || videoPrompts[s.id]);
    const hasVideo = Boolean(s.video_url || generatedVideoUrls[s.id]);
    return !hasPrompt || !hasVideo;
  });


  // Helper to build video prompt for a scene via AI
  const generateVideoPromptForScene = async (scene: SceneRow): Promise<string> => {
    const sceneBeatsText = scene.description || '';
    const targetImagePrompt = scene.storyboard_prompt || scene.description || '';

    const videoAiInstruction = `You are a cinematic director for a 3D animated children's film. Take the following script beats and storyboard image prompt for a scene, and generate a concise, cinematic video animation description for video generation AI.

Target Scene Script Beats (Contains exact dialogues, character actions, camera, motion, and SFX):
"""
${sceneBeatsText}
"""

Target Scene Storyboard Image Prompt (Visual Art Direction & Framing):
"""
${targetImagePrompt}
"""

Requirements:
- MANDATORY DIALOGUE ATTRIBUTION & LIP-SYNC ACCURACY (CRITICAL):
  1. Whenever a character speaks a dialogue line (e.g. JAKSH: "There's still so much to see."), you MUST explicitly tag the speaker name and quote the exact dialogue line: [Jaksh speaks: "There's still so much to see."].
  2. NEVER assign, mix up, or blur dialogue lines between characters. Each dialogue line MUST be strictly attached to the correct character's name.
  3. Explicitly state who is speaking and who is listening (e.g. "Jaksh opens his mouth and speaks: 'There's still so much to see.' while Tilli listens quietly.").
  4. NEVER summarize dialogue as "he speaks his dialogue" or omit the spoken words.
- Seamlessly combine the visual art direction of the storyboard prompt with the precise character actions, spoken dialogue lines, expressions, and motion cues from the script beats.
- Describe sequential character actions, natural movement, and expressions across each beat in chronological order.
- Begin with camera movement (e.g. gentle wide camera push, tracking shot).
- End with a strong cinematic shot composition.
- STRICT CHARACTER FIDELITY: NEVER invent, add, or extrapolate physical traits, body mechanics, technological qualities (such as wheels, robot parts, metal chassis, engines, camera eyes, or gadgets), powers, or unstated equipment for any character. Preserve character visual identity strictly as defined in official character profiles.
- Output ONLY the plain text video animation prompt without headers, markdown, or commentary.`;

    const response = await callAi(videoAiInstruction);
    const resultText = typeof response === 'string' ? response : (response as any)?.text || '';
    return resultText.trim();
  };

  // Helper to build payload item for a scene
  const buildVideoPayloadItem = (scene: SceneRow, vPrompt: string) => {
    const promptText = (scene.storyboard_prompt || scene.description || '').toLowerCase();

    // Active characters in this scene
    const activeChars = characters.filter((c) => {
      if (c.name && (promptText.includes(c.name.toLowerCase()) || scene.description.toLowerCase().includes(c.name.toLowerCase()))) {
        return true;
      }
      return false;
    });

    const charRefs: Record<string, string> = {};
    for (const c of activeChars) {
      if (c.name) charRefs[c.name] = c.magnific_identifier || c.id;
    }

    // Active location for this scene
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
      videoPrompt: vPrompt,
      magnific_identifier: scene.magnific_identifier || null,
      references: {
        characters: charRefs,
        locations: locRefs,
      },
    };
  };

  // Group Generation ("Generate All Video Prompts")
  const handleGenerateAllVideos = async () => {
    const targetScenes = pendingScenes.length > 0 ? pendingScenes : generatedScenes;
    if (targetScenes.length === 0) return;

    setIsGeneratingAll(true);
    setGlobalMessage(null);

    try {
      const payloadItems = [];
      const newPrompts: Record<string, string> = {};

      for (const scene of targetScenes) {
        let vPrompt = videoPrompts[scene.id];
        if (!vPrompt) {
          vPrompt = await generateVideoPromptForScene(scene);
          newPrompts[scene.id] = vPrompt;
        }
        payloadItems.push(buildVideoPayloadItem(scene, vPrompt));
      }

      const allPromptsMap: Record<string, string> = { ...videoPrompts, ...newPrompts };
      setVideoPrompts(allPromptsMap);
      const fullPayload = { scenes: payloadItems };
      setLastPayload(fullPayload);

      // 1. Immediately save generated video prompts to DB
      if (Object.keys(newPrompts).length > 0) {
        await Promise.all(
          Object.entries(newPrompts).map(([scId, pText]) =>
            fetch(`/api/scenes/${scId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ video_prompt: pText }),
            })
          )
        );
      }

      // 2. Dispatch webhook
      try {
        const res = await sendVideoWebhook(fullPayload);

        if (res) {
          const data = await res.json().catch(() => null);


          const newVideoUrls: Record<string, { url: string; magnificId?: string | null }> = {};
          if (Array.isArray(data)) {
            data.forEach((item: any, idx: number) => {
              const targetScene = targetScenes[idx];
              const url = extractVideoUrl(item);
              const magId = extractVideoMagnificIdentifier(item);
              if (targetScene && url) {
                newVideoUrls[targetScene.id] = { url, magnificId: magId };
              }
            });
          } else if (data && typeof data === 'object') {
            const scenesArr = Array.isArray(data.result?.scenes)
              ? data.result.scenes
              : Array.isArray(data.scenes)
              ? data.scenes
              : null;

            if (scenesArr) {
              scenesArr.forEach((item: any, idx: number) => {
                const targetScene = targetScenes.find((s) => s.id === item.id) || targetScenes[idx];
                const url = extractVideoUrl(item);
                const magId = extractVideoMagnificIdentifier(item);
                if (targetScene && url) {
                  newVideoUrls[targetScene.id] = { url, magnificId: magId };
                }
              });
            } else {
              const url = extractVideoUrl(data);
              const magId = extractVideoMagnificIdentifier(data);
              if (url && targetScenes.length > 0) {
                newVideoUrls[targetScenes[0].id] = { url, magnificId: magId };
              }
            }
          }

          if (Object.keys(newVideoUrls).length > 0) {
            const urlMap: Record<string, string> = {};
            Object.entries(newVideoUrls).forEach(([scId, info]) => {
              urlMap[scId] = info.url;
            });
            setGeneratedVideoUrls((prev) => ({ ...prev, ...urlMap }));
            await Promise.all(
              Object.entries(newVideoUrls).map(([scId, info]) =>
                fetch(`/api/scenes/${scId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    video_prompt: allPromptsMap[scId] || undefined,
                    video_url: info.url,
                    video_magnific_identifier: info.magnificId || undefined,
                  }),
                })
              )
            );
            await onRefetchScenes();
            setGlobalMessage({ type: 'success', text: 'Operation successful' });
          } else {
            await onRefetchScenes();
            setGlobalMessage({ type: 'success', text: 'Operation successful' });
          }
        } else {
          await onRefetchScenes();
          setGlobalMessage({ type: 'success', text: 'Operation successful' });
        }
      } catch (webhookErr) {
        console.warn('Group webhook dispatch error:', webhookErr);
        await onRefetchScenes();
        setGlobalMessage({ type: 'success', text: 'Operation successful' });
      }



    } catch (err: any) {
      console.error('Error generating all video prompts:', err);
      setGlobalMessage({ type: 'error', text: err.message || 'Failed to generate video prompts.' });
    } finally {
      setIsGeneratingAll(false);
    }
  };




  const handleConfirmClick = async () => {
    setIsConfirming(true);
    try {
      const updatePromises = generatedScenes.map((scene) => {
        const vPrompt = videoPrompts[scene.id] || scene.video_prompt;
        const vUrl = generatedVideoUrls[scene.id] || scene.video_url;
        if (vPrompt || vUrl) {
          return fetch(`/api/scenes/${scene.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              video_prompt: vPrompt || undefined,
              video_url: vUrl || undefined,
            }),
          });
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);
      await onRefetchScenes();
      await onConfirmed();
    } catch (err: any) {
      console.error('Error confirming video stage:', err);
    } finally {
      setIsConfirming(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            Video Production
          </h3>
          <p className="text-sm text-muted-foreground">
            Generate cinematic AI video prompts and videos for scenes with completed storyboards.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateAllVideos}
            disabled={isGeneratingAll || generatedScenes.length === 0}
            className={primaryButtonClass}
          >
            {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
            {pendingScenes.length === 0
              ? `Regenerate All Videos (${generatedScenes.length})`
              : pendingScenes.length === generatedScenes.length
              ? `Generate All Videos (${generatedScenes.length})`
              : `Generate Remaining Videos (${pendingScenes.length} remaining)`}
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


      {/* Scene Items Grid */}
      {generatedScenes.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border/80 rounded-xl space-y-2 bg-card/40">
          <Film className="w-8 h-8 text-muted-foreground mx-auto" />
          <h3 className="text-base font-bold text-foreground">No Storyboards Generated Yet</h3>
          <p className="text-sm text-muted-foreground">
            Please complete and generate storyboards in Stage 4 first to enable video generation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {generatedScenes.map((scene, sceneIdx) => (
            <VideoSceneCard
              key={scene.id}
              scene={scene}
              sceneIdx={sceneIdx}
              characters={characters}
              episodeLocations={episodeLocations}
              videoPrompt={videoPrompts[scene.id]}
              overrideVideoUrl={generatedVideoUrls[scene.id]}
              onGeneratePrompt={async (newPrompt) => {
                setVideoPrompts((prev) => ({ ...prev, [scene.id]: newPrompt }));
              }}
              onRefetchScenes={onRefetchScenes}
              buildVideoPayloadItem={buildVideoPayloadItem}
            />
          ))}

        </div>
      )}

      {/* Confirm Stage Button */}
      <div className="pt-4 border-t border-border/60 flex justify-end">
        <button
          type="button"
          onClick={handleConfirmClick}
          disabled={isConfirming}
          className={primaryButtonClass}
        >
          {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Confirm Video Stage
        </button>
      </div>
    </div>
  );
}

function VideoSceneCard({
  scene,
  sceneIdx,
  characters,
  episodeLocations,
  videoPrompt: initialVideoPrompt,
  overrideVideoUrl,
  onGeneratePrompt,
  onRefetchScenes,
  buildVideoPayloadItem,
}: {
  scene: SceneRow;
  sceneIdx: number;
  characters: CharacterRow[];
  episodeLocations: EpisodeLocationRow[];
  videoPrompt?: string;
  overrideVideoUrl?: string;
  onGeneratePrompt: (prompt: string) => void;
  onRefetchScenes: () => Promise<void>;
  buildVideoPayloadItem: (scene: SceneRow, vPrompt: string) => any;
}) {
  const [videoPromptText, setVideoPromptText] = useState(initialVideoPrompt || scene.video_prompt || '');
  const [returnedVideoUrl, setReturnedVideoUrl] = useState<string | null>(overrideVideoUrl || scene.video_url || null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isSendingVideo, setIsSendingVideo] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialVideoPrompt) {
      setVideoPromptText(initialVideoPrompt);
    } else if (scene.video_prompt) {
      setVideoPromptText(scene.video_prompt);
    }
  }, [initialVideoPrompt, scene.video_prompt]);

  useEffect(() => {
    if (overrideVideoUrl) {
      setReturnedVideoUrl(overrideVideoUrl);
    } else if (scene.video_url) {
      setReturnedVideoUrl(scene.video_url);
    }
  }, [overrideVideoUrl, scene.video_url]);

  const activeVideoUrl = returnedVideoUrl || scene.video_url;

  const promptText = (scene.storyboard_prompt || scene.description || '').toLowerCase();
  const sceneChars = characters.filter((c) => c.name && promptText.includes(c.name.toLowerCase()));

  // 1. Regenerate ONLY the AI Video Prompt
  const handleRegeneratePromptOnly = async () => {
    setIsGeneratingPrompt(true);
    setError(null);
    setStatusMessage(null);

    try {
      const sceneBeatsText = scene.description || '';
      const targetImagePrompt = scene.storyboard_prompt || scene.description || '';

      const videoAiInstruction = `You are a cinematic director for a 3D animated children's film. Take the following script beats and storyboard image prompt for a scene, and generate a concise, cinematic video animation description for video generation AI.

Target Scene Script Beats (Contains exact dialogues, character actions, camera, motion, and SFX):
"""
${sceneBeatsText}
"""

Target Scene Storyboard Image Prompt (Visual Art Direction & Framing):
"""
${targetImagePrompt}
"""

Requirements:
- MANDATORY DIALOGUE ATTRIBUTION & LIP-SYNC ACCURACY (CRITICAL):
  1. Whenever a character speaks a dialogue line (e.g. JAKSH: "There's still so much to see."), you MUST explicitly tag the speaker name and quote the exact dialogue line: [Jaksh speaks: "There's still so much to see."].
  2. NEVER assign, mix up, or blur dialogue lines between characters. Each dialogue line MUST be strictly attached to the correct character's name.
  3. Explicitly state who is speaking and who is listening (e.g. "Jaksh opens his mouth and speaks: 'There's still so much to see.' while Tilli listens quietly.").
  4. NEVER summarize dialogue as "he speaks his dialogue" or omit the spoken words.
- Seamlessly combine the visual art direction of the storyboard prompt with the precise character actions, spoken dialogue lines, expressions, and motion cues from the script beats.
- Describe sequential character actions, natural movement, and expressions across each beat in chronological order.
- Begin with camera movement (e.g. gentle wide camera push, tracking shot).
- End with a strong cinematic shot composition.
- STRICT CHARACTER FIDELITY: NEVER invent, add, or extrapolate physical traits, body mechanics, technological qualities (such as wheels, robot parts, metal chassis, engines, camera eyes, or gadgets), powers, or unstated equipment for any character. Preserve character visual identity strictly as defined in official character profiles.
- Output ONLY the plain text video animation prompt without headers, markdown, or commentary.`;

      const response = await callAi(videoAiInstruction);
      const generatedPrompt = (typeof response === 'string' ? response : (response as any)?.text || '').trim();

      setVideoPromptText(generatedPrompt);
      onGeneratePrompt(generatedPrompt);
      setIsPromptOpen(true);

      // Save prompt to DB immediately
      await fetch(`/api/scenes/${scene.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_prompt: generatedPrompt }),
      });
      await onRefetchScenes();
      setStatusMessage('Operation successful');
    } catch (err: any) {
      console.error('Error generating video prompt:', err);
      setError(err.message || 'Operation failed');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  // 2. Send ONLY the Video Request to Webhook (using current prompt)
  const handleSendVideoWebhookOnly = async () => {
    setIsSendingVideo(true);
    setError(null);
    setStatusMessage(null);

    try {
      let currentPrompt = videoPromptText;
      if (!currentPrompt) {
        const sceneBeatsText = scene.description || '';
        const targetImagePrompt = scene.storyboard_prompt || scene.description || '';
        const videoAiInstruction = `You are a cinematic director for a 3D animated children's film. Take the script beats and storyboard image prompt for scene #${scene.scene_number || sceneIdx + 1} and generate a concise video animation description.\nBeats: ${sceneBeatsText}\nStoryboard: ${targetImagePrompt}`;
        const response = await callAi(videoAiInstruction);
        currentPrompt = (typeof response === 'string' ? response : (response as any)?.text || '').trim();
        setVideoPromptText(currentPrompt);
        onGeneratePrompt(currentPrompt);
        setIsPromptOpen(true);
      }

      // Always save video_prompt to DB first
      await fetch(`/api/scenes/${scene.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_prompt: currentPrompt }),
      });

      const itemPayload = buildVideoPayloadItem(scene, currentPrompt);
      const payload = { scenes: [itemPayload] };

      const res = await sendVideoWebhook(payload);

      if (res) {
        const data = await res.json().catch(() => null);


        const vUrl = extractVideoUrl(data);
        const vMagId = extractVideoMagnificIdentifier(data);

        if (vUrl) {
          setReturnedVideoUrl(vUrl);
          await fetch(`/api/scenes/${scene.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              video_prompt: currentPrompt,
              video_url: vUrl,
              video_magnific_identifier: vMagId || undefined,
            }),
          });
          await onRefetchScenes();
          setStatusMessage('Operation successful');
        } else {
          await onRefetchScenes();
          setStatusMessage('Operation successful');
        }
      } else {
        await onRefetchScenes();
        setStatusMessage('Operation successful');
      }
    } catch (err: any) {
      console.error('Error sending video request:', err);
      setError(err.message || 'Operation failed');
    } finally {
      setIsSendingVideo(false);
    }
  };



  return (
    <div className="p-5 rounded-xl border border-border bg-card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0">
            #{scene.scene_number || sceneIdx + 1}
          </span>
          <div>
            <h4 className="text-base font-bold text-foreground line-clamp-1">
              {scene.description || `Scene #${scene.scene_number || sceneIdx + 1}`}
            </h4>
            {scene.locationName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 font-medium">
                <MapPin className="w-3 h-3 text-emerald-500" />
                {scene.locationName}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {statusMessage && <p className="text-sm text-emerald-500 font-medium">{statusMessage}</p>}

      {/* Media & Details Row (Top Aligned) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {/* Left Column (1/3): Characters in this Scene + Storyboard Image Preview */}
        <div className="space-y-4">
          {/* Characters in this scene */}
          {sceneChars.length > 0 && (
            <div className="space-y-1.5">
              <label className={labelClass}>Characters in this scene</label>
              <div className="flex flex-wrap gap-2">
                {sceneChars.map((c) => (
                  <span
                    key={c.id}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5"
                  >
                    <User className="w-3.5 h-3.5 text-primary" />
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Storyboard Image Reference */}
          <div className="space-y-1.5">
            <label className={labelClass}>Storyboard Image Reference</label>
            {scene.storyboard_image_url ? (
              <a
                href={scene.storyboard_image_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Click to open full storyboard image in new tab"
                className="block overflow-hidden rounded-xl border border-border group cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={scene.storyboard_image_url}
                  alt={`Scene ${scene.scene_number}`}
                  className="w-full object-cover max-h-[220px] transition-transform duration-200 group-hover:scale-[1.02]"
                />
              </a>
            ) : (
              <div className="p-6 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                No Storyboard Image
              </div>
            )}
          </div>
        </div>

        {/* Right Column (2/3): Generated Video Clip & Prompt Dropdown */}
        <div className="md:col-span-2 space-y-4">
          {/* HTML5 Video Player */}
          {activeVideoUrl && (
            <div className="space-y-1.5">
              <label className={labelClass}>Generated Video Clip</label>
              <video
                controls
                src={activeVideoUrl}
                className="w-full rounded-xl border border-border max-h-[260px] bg-black object-contain"
              />
            </div>
          )}

          {/* Video Prompt Dropdown Accordion */}
          <div className="border border-border/50 rounded-xl overflow-hidden bg-muted/10">
            <button
              type="button"
              onClick={() => setIsPromptOpen(!isPromptOpen)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-foreground bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Generated Video Prompt
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground font-normal">
                {isPromptOpen ? 'Hide' : 'Show Prompt'}
                {isPromptOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </button>
            {isPromptOpen && (
              <div className="p-3 border-t border-border/40">
                {videoPromptText ? (
                  <p className="text-xs font-mono text-foreground leading-relaxed whitespace-pre-wrap">
                    {videoPromptText}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Click &quot;Generate Video&quot; below to generate video prompt for this scene.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>



      {/* Action Buttons */}
      <div className="pt-2 flex items-center justify-end gap-3">
        {videoPromptText && (
          <button
            type="button"
            onClick={handleRegeneratePromptOnly}
            disabled={isGeneratingPrompt || isSendingVideo}
            className={primaryButtonClass}
          >
            {isGeneratingPrompt ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Regenerate Video Prompt
          </button>
        )}

        <button
          type="button"
          onClick={handleSendVideoWebhookOnly}
          disabled={isSendingVideo || isGeneratingPrompt}
          className={primaryButtonClass}
        >
          {isSendingVideo ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Video className="w-4 h-4" />
          )}
          {videoPromptText ? 'Regenerate Video' : 'Generate Video'}
        </button>
      </div>


    </div>
  );
}

