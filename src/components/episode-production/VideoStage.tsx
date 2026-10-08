'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Check, ChevronDown, Film, ListVideo, Loader2, MapPin, RefreshCw, Square, User, Video } from 'lucide-react';

import { planSceneShotsAction } from '@/actions/planSceneShotsAction';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import {
  SHOT_CAP_SECONDS,
  SHOT_DURATIONS,
  parseShotPlan,
  sceneBeats,
  serializeShotPlan,
  type SceneShot,
  type SceneShotPlan,
  type ShotSceneContext,
} from '@/lib/sceneShots';
import { assertVideoWebhookResponse, videoWebhookAccepted, unconfirmedVideoResponse } from '@/lib/videoWebhook';
import type { EpisodeLocationRow, SceneRow } from './types';

interface VideoStageProps {
  scenes: SceneRow[];
  episodeLocations: EpisodeLocationRow[];
  onRefetchScenes: () => Promise<void>;
}

async function saveSceneUpdate(url: string, options: RequestInit): Promise<Response> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not save scene (HTTP ${response.status}): ${detail.slice(0, 500)}`);
  }
  return response;
}

async function sendVideoWebhook(payload: any): Promise<Response> {
  try {
    const res = await fetch('https://automation.tillitown.com/webhook/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res;
  } catch (err) {
    console.warn('Video webhook fetch error:', err);
    throw new Error(`Could not reach the video webhook. The browser reported a network/CORS failure: ${err instanceof Error ? err.message : String(err)}. Video submission could not be confirmed.`);
  }
}



function extractVideoUrl(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string' && (data.startsWith('http') || data.includes('.mp4') || data.includes('.webm'))) return data;

  const d = data.body || data.json || data;

  // 1. Direct url or results.url on item
  if (d.results?.url) return d.results.url;
  if (d.results?.videoUrl) return d.results.videoUrl;
  if (d.results?.video_url) return d.results.video_url;
  if (Array.isArray(d.results) && d.results[0]?.url) return d.results[0].url;
  if (Array.isArray(d.results) && d.results[0]?.videoUrl) return d.results[0].videoUrl;
  if (d.url) return d.url;
  if (d.videoUrl) return d.videoUrl;
  if (d.video_url) return d.video_url;

  // 2. Check scenes array inside result or root
  const scenes = Array.isArray(d.result?.scenes)
    ? d.result.scenes
    : Array.isArray(d.scenes)
    ? d.scenes
    : null;
  if (scenes && scenes[0]) {
    const scUrl = extractVideoUrl(scenes[0]);
    if (scUrl) return scUrl;
  }

  // 3. Check result.results or result.url
  if (d.result?.results?.url) return d.result.results.url;
  if (d.result?.results?.videoUrl) return d.result.results.videoUrl;
  if (d.result?.results?.video_url) return d.result.results.video_url;
  if (Array.isArray(d.result?.results) && d.result.results[0]?.url) return d.result.results[0].url;
  if (d.result?.url) return d.result.url;
  if (d.result?.videoUrl) return d.result.videoUrl;
  if (d.result?.video_url) return d.result.video_url;

  // 4. Array format fallback
  if (Array.isArray(data) && data[0]) {
    return extractVideoUrl(data[0]);
  }

  return null;
}

function extractVideoMagnificIdentifier(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string') return null;

  const d = data.body || data.json || data;

  // 1. Direct identifier on item
  if (d.identifier) return d.identifier;
  if (d.video_magnific_identifier) return d.video_magnific_identifier;
  if (d.magnific_identifier) return d.magnific_identifier;
  if (d.magnific_id) return d.magnific_id;
  if (d.results?.identifier) return d.results.identifier;
  if (d.results?.magnific_identifier) return d.results.magnific_identifier;

  // 2. Check scenes array inside result or root
  const scenes = Array.isArray(d.result?.scenes)
    ? d.result.scenes
    : Array.isArray(d.scenes)
    ? d.scenes
    : null;
  if (scenes && scenes[0]) {
    const magId = extractVideoMagnificIdentifier(scenes[0]);
    if (magId) return magId;
  }

  // 3. Check result object
  if (d.result?.identifier) return d.result.identifier;
  if (d.result?.video_magnific_identifier) return d.result.video_magnific_identifier;
  if (d.result?.magnific_identifier) return d.result.magnific_identifier;
  if (d.result?.results?.identifier) return d.result.results.identifier;

  // 4. Array format fallback
  if (Array.isArray(data) && data[0]) {
    return extractVideoMagnificIdentifier(data[0]);
  }

  return null;
}

function sceneCharacters(scene: SceneRow) {
  return (scene.SceneCharacter || []).flatMap((link) => (link.Character ? [link.Character] : []));
}

function shotContext(scene: SceneRow): ShotSceneContext {
  return {
    locationName: scene.locationName || '',
    characterNames: sceneCharacters(scene).map((character) => character.name),
    scriptBeats: scene.script_beats || '',
    beatNumbers: Array.isArray(scene.beat_numbers) ? scene.beat_numbers : undefined,
    description: scene.description || '',
  };
}

// One request per shot. `shot` and `duration` are additions to the scene payload the webhook already accepts.
function buildShotPayload(scene: SceneRow, shot: SceneShot, episodeLocations: EpisodeLocationRow[]) {
  if (!scene.magnific_identifier) {
    throw new Error(`Scene ${scene.scene_number}'s storyboard image was saved without its generator reference. Regenerate that image in the Storyboard step, then try again.`);
  }

  // SceneCharacter is the authoritative character list for this scene.
  const charRefs: Record<string, string> = {};
  const missingCharacters: string[] = [];
  for (const character of sceneCharacters(scene)) {
    if (character.magnific_identifier) charRefs[character.name] = character.magnific_identifier;
    else missingCharacters.push(character.name);
  }
  if (missingCharacters.length > 0) {
    throw new Error(`Scene ${scene.scene_number}: ${missingCharacters.join(', ')} ${missingCharacters.length === 1 ? 'has' : 'have'} no reference sheet yet. Generate ${missingCharacters.length === 1 ? 'it' : 'them'} in Characters, then try again.`);
  }

  const matchedEpLoc = episodeLocations.find(
    (el) => el.id === scene.episode_location_id || el.Location.name.toLowerCase() === scene.locationName.toLowerCase()
  );
  if (!matchedEpLoc) {
    throw new Error(`Scene ${scene.scene_number}: the location "${scene.locationName || 'unknown'}" is not linked to this episode.`);
  }
  if (!matchedEpLoc.Location.magnific_identifier) {
    throw new Error(`Scene ${scene.scene_number}: the location "${matchedEpLoc.Location.name}" has no reference sheet yet. Generate it in Locations, then try again.`);
  }

  return {
    scenes: [{
      id: scene.id,
      shot: shot.shot,
      duration: shot.seconds,
      videoPrompt: shot.prompt,
      magnific_identifier: scene.magnific_identifier,
      references: {
        characters: charRefs,
        locations: { [matchedEpLoc.Location.name]: matchedEpLoc.Location.magnific_identifier },
      },
    }],
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Operation failed.';
}

export function VideoStage({
  scenes,
  episodeLocations,
  onRefetchScenes,
}: VideoStageProps) {
  // Plans saved in this session. The ref is what long-running generation reads; the state is what renders.
  const plansRef = useRef<Record<string, SceneShotPlan>>({});
  const [savedPlans, setSavedPlans] = useState<Record<string, SceneShotPlan>>({});
  const [activity, setActivity] = useState<Record<string, string>>({});
  const [sceneErrors, setSceneErrors] = useState<Record<string, string>>({});
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const stopRequested = useRef(false);

  const storyboardScenes = scenes
    .filter((scene) => Boolean(scene.storyboard_image_url))
    .sort((a, b) => a.scene_number - b.scene_number || a.order_index - b.order_index);

  const rememberPlan = (sceneId: string, plan: SceneShotPlan) => {
    plansRef.current = { ...plansRef.current, [sceneId]: plan };
    setSavedPlans(plansRef.current);
  };
  const currentPlan = (scene: SceneRow) => plansRef.current[scene.id] ?? parseShotPlan(scene.video_prompt);
  const setSceneActivity = (sceneId: string, text: string | null) =>
    setActivity((prev) => {
      const next = { ...prev };
      if (text) next[sceneId] = text;
      else delete next[sceneId];
      return next;
    });
  const setSceneError = (sceneId: string, text: string | null) =>
    setSceneErrors((prev) => {
      const next = { ...prev };
      if (text) next[sceneId] = text;
      else delete next[sceneId];
      return next;
    });

  const savePlan = async (scene: SceneRow, plan: SceneShotPlan) => {
    await saveSceneUpdate(`/api/scenes/${scene.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_prompt: serializeShotPlan(plan) }),
    });
    rememberPlan(scene.id, plan);
  };

  // Writes the shot list for each scene. Returns the plans that were saved.
  const planScenes = async (targets: SceneRow[]): Promise<Record<string, SceneShotPlan>> => {
    const planned: Record<string, SceneShotPlan> = {};
    targets.forEach((scene) => {
      setSceneError(scene.id, null);
      setSceneActivity(scene.id, 'Planning shots…');
    });
    try {
      const results = await planSceneShotsAction(
        targets.map((scene) => ({ ...shotContext(scene), previousPlan: currentPlan(scene) }))
      );
      for (const [index, result] of results.entries()) {
        const scene = targets[index];
        try {
          if (!result.ok) throw new Error(result.error);
          await savePlan(scene, result.plan);
          planned[scene.id] = result.plan;
        } catch (error) {
          setSceneError(scene.id, `Shot planning failed: ${errorText(error)}`);
        }
      }
    } catch (error) {
      targets.forEach((scene) => setSceneError(scene.id, `Shot planning failed: ${errorText(error)}`));
    } finally {
      targets.forEach((scene) => setSceneActivity(scene.id, null));
    }
    return planned;
  };

  const generateShot = async (scene: SceneRow, shotNumber: number) => {
    const shot = currentPlan(scene)?.shots.find((item) => item.shot === shotNumber);
    if (!shot) throw new Error(`Scene ${scene.scene_number} has no planned shot ${shotNumber}. Plan its shots first.`);

    const res = await sendVideoWebhook(buildShotPayload(scene, shot, episodeLocations));
    const responseBody = await res.text();
    const data = assertVideoWebhookResponse(res.status, responseBody);
    const clipUrl = extractVideoUrl(data);
    if (!clipUrl) {
      if (!videoWebhookAccepted(res.status, data)) throw unconfirmedVideoResponse(res.status, responseBody);
      throw new Error(`Shot ${shotNumber}: the webhook accepted the request but returned no clip, so nothing was saved for this shot.`);
    }

    const saved = await saveSceneUpdate(`/api/scenes/${scene.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shot_clip: {
          shot: shotNumber,
          video_url: clipUrl,
          video_magnific_identifier: extractVideoMagnificIdentifier(data) || undefined,
        },
      }),
    });
    const result = await saved.json();
    const updatedPlan = parseShotPlan(result?.scene?.video_prompt);
    if (updatedPlan) rememberPlan(scene.id, updatedPlan);
    if (result?.warning) throw new Error(`Shot ${shotNumber}: ${result.warning}`);
  };

  // Runs one piece of work for a scene, showing its progress and reporting its error on the scene.
  const runForScene = async (scene: SceneRow, work: () => Promise<void>): Promise<boolean> => {
    setSceneError(scene.id, null);
    try {
      await work();
      return true;
    } catch (error) {
      console.error(`Video stage error in scene #${scene.scene_number}:`, error);
      setSceneError(scene.id, errorText(error));
      return false;
    } finally {
      setSceneActivity(scene.id, null);
    }
  };

  // Plans the scene if needed, then generates every shot that has no clip yet. Returns clips generated.
  const generateRemaining = async (scene: SceneRow): Promise<number> => {
    const plan = currentPlan(scene) ?? (await planScenes([scene]))[scene.id];
    if (!plan) return 0;

    let generated = 0;
    const total = plan.shots.length;
    await runForScene(scene, async () => {
      for (const { shot } of plan.shots) {
        if (stopRequested.current) return;
        if (currentPlan(scene)?.shots.find((item) => item.shot === shot)?.videoUrl) continue;
        setSceneActivity(scene.id, `Generating shot ${shot} of ${total}…`);
        await generateShot(scene, shot);
        generated += 1;
      }
    });
    return generated;
  };

  const handlePlan = async (scene: SceneRow) => {
    await planScenes([scene]);
    await onRefetchScenes();
  };

  const handleGenerateShot = async (scene: SceneRow, shotNumber: number) => {
    await runForScene(scene, async () => {
      setSceneActivity(scene.id, `Generating shot ${shotNumber}…`);
      await generateShot(scene, shotNumber);
    });
    await onRefetchScenes();
  };

  const handleGenerateRemaining = async (scene: SceneRow) => {
    stopRequested.current = false;
    await generateRemaining(scene);
    await onRefetchScenes();
  };

  const handleSavePrompt = async (scene: SceneRow, shotNumber: number, prompt: string) => {
    await runForScene(scene, async () => {
      const plan = currentPlan(scene);
      if (!plan) return;
      await savePlan(scene, {
        ...plan,
        shots: plan.shots.map((shot) => (shot.shot === shotNumber ? { ...shot, prompt } : shot)),
      });
    });
  };

  const handleGenerateAll = async () => {
    stopRequested.current = false;
    setIsRunningAll(true);
    setNotice(null);
    let generated = 0;
    try {
      for (const scene of storyboardScenes) {
        if (stopRequested.current) break;
        generated += await generateRemaining(scene);
      }
      await onRefetchScenes();
      setNotice({
        type: 'success',
        text: stopRequested.current
          ? `Stopped. ${generated} clip${generated === 1 ? '' : 's'} generated and saved.`
          : `${generated} clip${generated === 1 ? '' : 's'} generated and saved. Scenes with problems show their own message.`,
      });
    } catch (error) {
      setNotice({ type: 'error', text: errorText(error) });
    } finally {
      setIsRunningAll(false);
    }
  };

  const sceneViews = storyboardScenes.map((scene) => {
    const plan = savedPlans[scene.id] ?? parseShotPlan(scene.video_prompt);
    const beats = sceneBeats(shotContext(scene));
    const remaining = plan ? plan.shots.filter((shot) => !shot.videoUrl).length : beats.length;
    return { scene, plan, beats, remaining };
  });
  const remainingClips = sceneViews.reduce((total, view) => total + view.remaining, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Shot clips</h2>
          <p className="text-sm text-muted-foreground">
            Each beat is one shot and one short clip. Plan a scene&apos;s shots, then generate or redo clips one at a time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRunningAll && (
            <Button variant="outline" onClick={() => { stopRequested.current = true; }}>
              <Square />
              Stop after current clip
            </Button>
          )}
          <ConfirmButton
            disabled={isRunningAll || remainingClips === 0}
            title={`Generate ${remainingClips} clip${remainingClips === 1 ? '' : 's'}?`}
            description="One clip for every shot that has none yet, generated one after another across all scenes. Each clip spends video credits and takes a few minutes. You can stop after the current clip."
            confirmLabel={`Generate ${remainingClips} clip${remainingClips === 1 ? '' : 's'}`}
            onConfirm={handleGenerateAll}
          >
            {isRunningAll ? <Loader2 className="animate-spin" /> : <Video />}
            Generate remaining clips ({remainingClips})
          </ConfirmButton>
        </div>
      </div>

      {notice && (
        <Alert variant={notice.type === 'error' ? 'destructive' : 'default'}>
          {notice.type === 'error' ? <AlertTriangle /> : <Check />}
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}

      {sceneViews.length === 0 ? (
        <Alert>
          <Film />
          <AlertTitle>No storyboard images yet</AlertTitle>
          <AlertDescription>A scene needs its storyboard image before its clips can be generated. Generate images in the Storyboard step.</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          {sceneViews.map(({ scene, plan, beats }, sceneIdx) => (
            <SceneShotsCard
              key={scene.id}
              scene={scene}
              sceneIdx={sceneIdx}
              plan={plan}
              parsedBeatNumbers={beats.map((beat) => beat.number)}
              activity={activity[scene.id]}
              error={sceneErrors[scene.id]}
              disabled={isRunningAll || Boolean(activity[scene.id])}
              onPlan={() => handlePlan(scene)}
              onGenerateRemaining={() => handleGenerateRemaining(scene)}
              onGenerateShot={(shotNumber) => handleGenerateShot(scene, shotNumber)}
              onSavePrompt={(shotNumber, prompt) => handleSavePrompt(scene, shotNumber, prompt)}
            />
          ))}
        </div>
      )}

    </div>
  );
}

function SceneShotsCard({
  scene,
  sceneIdx,
  plan,
  parsedBeatNumbers,
  activity,
  error,
  disabled,
  onPlan,
  onGenerateRemaining,
  onGenerateShot,
  onSavePrompt,
}: {
  scene: SceneRow;
  sceneIdx: number;
  plan: SceneShotPlan | null;
  parsedBeatNumbers: (number | null)[];
  activity?: string;
  error?: string;
  disabled: boolean;
  onPlan: () => void;
  onGenerateRemaining: () => void;
  onGenerateShot: (shotNumber: number) => void;
  onSavePrompt: (shotNumber: number, prompt: string) => void;
}) {
  const sceneNumber = scene.scene_number || sceneIdx + 1;
  const characters = sceneCharacters(scene);
  const expectedBeats = Array.isArray(scene.beat_numbers) ? scene.beat_numbers.length : 0;
  const scriptIncomplete = expectedBeats > parsedBeatNumbers.length;
  const planOutdated = Boolean(plan) && (
    plan!.shots.length !== parsedBeatNumbers.length ||
    plan!.shots.some((shot, index) => shot.beat !== parsedBeatNumbers[index])
  );
  const clipCount = plan ? plan.shots.filter((shot) => shot.videoUrl).length : 0;
  const shotCount = plan ? plan.shots.length : parsedBeatNumbers.length;
  const isGrid = shotCount > 1;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="line-clamp-1">
          Scene {sceneNumber}: {scene.description || 'Untitled'}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {scene.locationName && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {scene.locationName}
            </span>
          )}
          {scene.beat_numbers && (
            <span>Beats {Array.isArray(scene.beat_numbers) ? scene.beat_numbers.join(', ') : scene.beat_numbers}</span>
          )}
          <span>{clipCount} of {shotCount} clip{shotCount === 1 ? '' : 's'}</span>
        </CardDescription>
        <CardAction className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onPlan} disabled={disabled}>
            <ListVideo />
            {plan ? 'Re-plan shots' : 'Plan shots'}
          </Button>
          <ConfirmButton
            size="sm"
            variant="outline"
            disabled={disabled || (Boolean(plan) && clipCount === shotCount)}
            title={`Generate ${shotCount - clipCount} clip${shotCount - clipCount === 1 ? '' : 's'} for scene ${sceneNumber}?`}
            description={plan
              ? 'One clip for each shot that has none yet. Each clip spends video credits and takes a few minutes.'
              : 'The shots are planned first, then one clip is generated for each. Each clip spends video credits and takes a few minutes.'}
            confirmLabel="Generate clips"
            onConfirm={onGenerateRemaining}
          >
            <Video />
            Generate remaining clips
          </ConfirmButton>
        </CardAction>
      </CardHeader>

      <CardContent className="gap-4">
        {activity && (
          <Alert>
            <Loader2 className="animate-spin" />
            <AlertDescription>{activity}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {scriptIncomplete && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Saved script text is incomplete</AlertTitle>
            <AlertDescription>
              Only {parsedBeatNumbers.length} of this scene&apos;s {expectedBeats} beats are in its saved script, so the other beats get no shot. Regenerate this episode&apos;s storyboard to restore them.
            </AlertDescription>
          </Alert>
        )}
        {planOutdated && (
          <Alert>
            <AlertTriangle />
            <AlertDescription>The shot plan no longer matches this scene&apos;s beats. Re-plan the shots before generating.</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
          <div className="space-y-3">
            {scene.storyboard_image_url && (
              <a
                href={scene.storyboard_image_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open the full storyboard image in a new tab"
                className="block overflow-hidden rounded-lg border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={scene.storyboard_image_url} alt={`Storyboard for scene ${sceneNumber}`} className="max-h-[220px] w-full object-cover" />
              </a>
            )}
            {characters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {characters.map((character) => (
                  <Badge key={character.id} variant="outline">
                    <User />
                    {character.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 md:col-span-2">
            {!plan && (
              <p className="text-sm text-muted-foreground">
                No shots planned yet. Planning writes one short prompt per beat ({shotCount} shot{shotCount === 1 ? '' : 's'}); no video is generated until you ask for it.
              </p>
            )}
            {plan?.shots.map((shot) => (
              <ShotRow
                key={shot.shot}
                shot={shot}
                isGrid={isGrid}
                disabled={disabled}
                onGenerate={() => onGenerateShot(shot.shot)}
                onSavePrompt={(prompt) => onSavePrompt(shot.shot, prompt)}
              />
            ))}
            {clipCount === 0 && scene.video_url && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Earlier full-scene clip. It is replaced once this scene has shot clips.</p>
                <video controls preload="metadata" src={scene.video_url} className="aspect-video w-full max-w-md rounded-lg border bg-black object-contain" />
              </div>
            )}
          </div>
        </div>

        {scene.script_beats && (
          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button variant="ghost" size="sm" className="group/trigger">
                  <BookOpen />
                  Script beats and dialogue
                  <ChevronDown className="transition-transform group-data-[panel-open]/trigger:rotate-180" />
                </Button>
              }
            />
            <CollapsibleContent>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                {scene.script_beats}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

function ShotRow({
  shot,
  isGrid,
  disabled,
  onGenerate,
  onSavePrompt,
}: {
  shot: SceneShot;
  isGrid: boolean;
  disabled: boolean;
  onGenerate: () => void;
  onSavePrompt: (prompt: string) => void;
}) {
  // The draft resets whenever the saved prompt changes (after a save or a re-plan).
  const [draft, setDraft] = useState({ source: shot.prompt, text: shot.prompt });
  if (draft.source !== shot.prompt) setDraft({ source: shot.prompt, text: shot.prompt });

  const longestClip = SHOT_DURATIONS[SHOT_DURATIONS.length - 1];
  const overCap = shot.seconds > SHOT_CAP_SECONDS;

  return (
    <div className="space-y-2.5 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              Shot {shot.shot}{shot.title ? `: ${shot.title}` : ''}
            </span>
            {overCap && <Badge variant="destructive">Over {SHOT_CAP_SECONDS} s cap</Badge>}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {[
              isGrid ? `Panel ${shot.shot}` : null,
              shot.beat !== null ? `Beat ${shot.beat}` : null,
              `${shot.seconds} s clip`,
              shot.dialogueWords > 0 ? `${shot.dialogueWords} spoken words` : 'no dialogue',
            ].filter(Boolean).join(' · ')}
          </p>
        </div>
        {shot.videoUrl ? (
          <ConfirmButton
            size="sm"
            variant="outline"
            disabled={disabled}
            title={`Regenerate the clip for shot ${shot.shot}?`}
            description="The saved clip is replaced by a new one. This spends video credits."
            confirmLabel="Regenerate clip"
            onConfirm={onGenerate}
          >
            <RefreshCw />
            Regenerate clip
          </ConfirmButton>
        ) : (
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={disabled}>
            <Video />
            Generate clip
          </Button>
        )}
      </div>

      {overCap && (
        <p className="text-xs text-destructive">
          {shot.neededSeconds > longestClip
            ? `This dialogue needs about ${shot.neededSeconds} s at an unhurried pace, more than the longest ${longestClip} s clip, so it will be rushed or cut off. Split this beat into shorter beats in the script.`
            : `This dialogue needs about ${shot.neededSeconds} s at an unhurried pace. To stay within ${SHOT_CAP_SECONDS} s, split it across two beats in the script.`}
        </p>
      )}

      {shot.videoUrl && (
        <video controls preload="metadata" src={shot.videoUrl} className="aspect-video w-full max-w-md rounded-lg border bg-black object-contain" />
      )}

      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button variant="ghost" size="sm" className="group/trigger -ml-2 text-muted-foreground">
              Shot prompt
              <ChevronDown className="transition-transform group-data-[panel-open]/trigger:rotate-180" />
            </Button>
          }
        />
        <CollapsibleContent>
          <div className="mt-2 space-y-2">
            <Textarea
              value={draft.text}
              onChange={(event) => setDraft({ source: shot.prompt, text: event.target.value })}
              disabled={disabled}
              aria-label={`Prompt for shot ${shot.shot}`}
              className="font-mono text-xs md:text-xs"
            />
            {draft.text !== shot.prompt && (
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDraft({ source: shot.prompt, text: shot.prompt })}>
                  Discard
                </Button>
                <Button size="sm" onClick={() => onSavePrompt(draft.text)} disabled={disabled || !draft.text.trim()}>
                  <Check />
                  Save prompt
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
