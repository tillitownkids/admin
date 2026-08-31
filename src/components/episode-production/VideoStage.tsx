'use client';

import { useState } from 'react';
import { Video, Sparkles, Loader2, Check, RefreshCw, ExternalLink, Code, Film, User, MapPin } from 'lucide-react';
import { labelClass, primaryButtonClass, secondaryButtonClass } from '@/lib/styles';
import { callAi } from '@/actions/actions';
import { logPayloadAction } from '@/actions/logPayloadAction';
import type { CharacterRow, EpisodeLocationRow, SceneRow } from './types';

interface VideoStageProps {
  scenes: SceneRow[];
  characters: CharacterRow[];
  episodeLocations: EpisodeLocationRow[];
  onRefetchScenes: () => Promise<void>;
  onConfirmed: () => Promise<void> | void;
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

  // Filter only scenes with generated storyboard images
  const generatedScenes = scenes
    .filter((s) => Boolean(s.storyboard_image_url))
    .sort((a, b) => a.scene_number - b.scene_number || a.order_index - b.order_index);

  // Un-generated video scenes
  const pendingScenes = generatedScenes.filter((s) => !videoPrompts[s.id]);

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

      setVideoPrompts((prev) => ({ ...prev, ...newPrompts }));
      const fullPayload = { scenes: payloadItems };
      setLastPayload(fullPayload);

      console.log('=== GENERATE ALL VIDEOS PAYLOAD ===', JSON.stringify(fullPayload, null, 2));
      await logPayloadAction(`GENERATE ALL VIDEOS (${payloadItems.length} scenes)`, fullPayload);

      setGlobalMessage({
        type: 'success',
        text: `Generated video payload for ${payloadItems.length} scene(s) and logged to terminal!`,
      });
    } catch (err: any) {
      console.error('Error generating all videos :', err);
      setGlobalMessage({ type: 'error', text: err.message || 'Failed to generate video .' });
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleConfirmClick = async () => {
    setIsConfirming(true);
    try {
      await onConfirmed();
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            Video Production & Prompting
          </h3>
          <p className="text-sm text-muted-foreground">
            Generate cinematic video AI prompts and payloads for scenes with completed storyboards.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastPayload && (
            <button
              type="button"
              onClick={() => setShowPayloadDebug(!showPayloadDebug)}
              className={secondaryButtonClass}
            >
              <Code className="w-4 h-4" />
              {showPayloadDebug ? 'Hide Debug' : 'View Payload'}
            </button>
          )}
          <button
            type="button"
            onClick={handleGenerateAllVideos}
            disabled={isGeneratingAll || generatedScenes.length === 0}
            className={primaryButtonClass}
          >
            {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {pendingScenes.length > 0
              ? `Generate All Videos (${pendingScenes.length} remaining)`
              : `Regenerate All Videos (${generatedScenes.length})`}
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

      {/* Debug Payload view */}
      {showPayloadDebug && lastPayload && (
        <div className="p-4 rounded-xl border border-border bg-black/90 text-emerald-400 space-y-2 font-mono text-xs overflow-x-auto">
          <div className="flex items-center justify-between text-muted-foreground font-sans">
            <span>Last Video Webhook Payload:</span>
          </div>
          <pre>{JSON.stringify(lastPayload, null, 2)}</pre>
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
              onGeneratePrompt={async (newPrompt) => {
                setVideoPrompts((prev) => ({ ...prev, [scene.id]: newPrompt }));
              }}
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
  onGeneratePrompt,
  buildVideoPayloadItem,
}: {
  scene: SceneRow;
  sceneIdx: number;
  characters: CharacterRow[];
  episodeLocations: EpisodeLocationRow[];
  videoPrompt?: string;
  onGeneratePrompt: (prompt: string) => void;
  buildVideoPayloadItem: (scene: SceneRow, vPrompt: string) => any;
}) {
  const [videoPromptText, setVideoPromptText] = useState(initialVideoPrompt || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const promptText = (scene.storyboard_prompt || scene.description || '').toLowerCase();
  const sceneChars = characters.filter((c) => c.name && promptText.includes(c.name.toLowerCase()));

  const handleGenerateSingleVideo = async () => {
    setIsGenerating(true);
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

      const itemPayload = buildVideoPayloadItem(scene, generatedPrompt);
      const payload = { scenes: [itemPayload] };

      console.log(`=== GENERATE SINGLE VIDEO PAYLOAD (Scene #${scene.scene_number}) ===`, JSON.stringify(payload, null, 2));
      await logPayloadAction(`GENERATE VIDEO PAYLOAD (Scene #${scene.scene_number || sceneIdx + 1})`, payload);

      setStatusMessage('Video payload logged to console and terminal successfully!');
    } catch (err: any) {
      console.error('Error generating video :', err);
      setError(err.message || 'Failed to generate video .');
    } finally {
      setIsGenerating(false);
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
              <div className="space-y-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={scene.storyboard_image_url}
                  alt={`Scene ${scene.scene_number}`}
                  className="w-full rounded-xl border border-border object-cover max-h-[220px]"
                />
                <a
                  href={scene.storyboard_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-primary hover:underline truncate flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span className="truncate">{scene.storyboard_image_url}</span>
                </a>
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                No Storyboard Image
              </div>
            )}
          </div>
        </div>

        {/* Right Column (2/3): Generated Video */}
        <div className="md:col-span-2 space-y-1.5">
          <label className={labelClass}>Generated Video</label>
          {videoPromptText ? (
            <p className="text-xs font-mono text-foreground bg-muted/30 p-3 rounded-lg border border-border/50 leading-relaxed whitespace-pre-wrap">
              {videoPromptText}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic bg-muted/10 p-3 rounded-lg border border-dashed border-border/50">
              Click &quot;Generate Video&quot; below to generate video for this scene.
            </p>
          )}
        </div>
      </div>




      {/* Action Button */}
      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={handleGenerateSingleVideo}
          disabled={isGenerating}
          className={primaryButtonClass}
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : videoPromptText ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {videoPromptText ? 'Regenerate Video' : 'Generate Video'}
        </button>
      </div>

    </div>
  );
}
