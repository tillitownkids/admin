"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowRight, Box, Check, Loader2, MapPin, Users } from "lucide-react";

import { ButtonLink } from "@/components/ButtonLink";
import { StoryboardImages } from "@/components/episode/StoryboardImages";
import { useEpisodeScenes } from "@/components/episode/useEpisodeScenes";
import { VideoStage } from "@/components/episode-production/VideoStage";
import { ClipUploadButton } from "@/components/sequence/ClipUploadButton";
import { SequenceAttachments } from "@/components/sequence/SequenceAttachments";
import { SequenceBeats } from "@/components/sequence/SequenceBeats";
import { SequenceHistory } from "@/components/sequence/SequenceHistory";
import { SequenceNotes } from "@/components/sequence/SequenceNotes";
import { beatNumbersOf, beatRange, castOf, objectsOf, sequenceCode } from "@/components/sequence/sequenceFormat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseShotPlan, sceneClips } from "@/lib/sceneShots";
import { sceneRuntime } from "@/lib/sceneTiming";
import { queryKeys } from "@/lib/queryKeys";

/** Everything about one sequence: its beats, storyboard, clip, issues and the history of its prompts. */
export function SequenceWorkspace({ storyId, number }: { storyId: string; number: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { scenes, episodeLocations, isLoading, error, refetch } = useEpisodeScenes(storyId);
  const [clipMessage, setClipMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const listHref = `/episodes/${storyId}/sequences`;
  const sorted = [...scenes].sort((a, b) => a.scene_number - b.scene_number);
  const index = sorted.findIndex((item) => item.scene_number === number);
  const scene = index >= 0 ? sorted[index] : null;
  const previous = index > 0 ? sorted[index - 1] : null;
  const next = index >= 0 && index < sorted.length - 1 ? sorted[index + 1] : null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading the sequence…
      </div>
    );
  }
  if (error || !scene) {
    return (
      <div className="space-y-4">
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-2"><ArrowLeft />All sequences</ButtonLink>
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{error ? "The sequence could not be loaded" : `There is no sequence ${number}`}</AlertTitle>
          <AlertDescription>{error || "It may have been replaced when the sequences were planned again."}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // After any change: the sequence, its history, the episode's progress.
  const reload = async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: queryKeys.promptVersions(scene.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.sequenceAttachments(scene.id) }),
    ]);
    router.refresh();
  };

  const cast = castOf(scene);
  const objects = objectsOf(scene);
  const clipUrl = sceneClips(scene).clips[0]?.url ?? null;
  const planned = Boolean(parseShotPlan(scene.video_prompt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ButtonLink href={listHref} variant="ghost" size="sm" className="-ml-2"><ArrowLeft />All sequences</ButtonLink>
        <div className="flex gap-1">
          {previous && (
            <ButtonLink href={`${listHref}/${previous.scene_number}`} variant="outline" size="sm">
              <ArrowLeft />{sequenceCode(previous.scene_number)}
            </ButtonLink>
          )}
          {next && (
            <ButtonLink href={`${listHref}/${next.scene_number}`} variant="outline" size="sm">
              {sequenceCode(next.scene_number)}<ArrowRight />
            </ButtonLink>
          )}
        </div>
      </div>

      <header className="space-y-2">
        {/* Named as in the episode doc: "SEQ 16 — Beats 32–33 (10 s)". */}
        <h2 className="text-xl font-semibold text-foreground">
          {sequenceCode(scene.scene_number)} — {beatRange(beatNumbersOf(scene))} ({sceneRuntime(scene)} s)
        </h2>
        <p className="text-sm text-foreground">{scene.description || "Untitled sequence"}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {scene.locationName && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{scene.locationName}</span>}
          <span className="flex items-center gap-1"><Users className="size-3.5" />{cast.length ? cast.join(", ") : "No characters"}</span>
          {objects.length > 0 && <span className="flex items-center gap-1"><Box className="size-3.5" />{objects.join(", ")}</span>}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-10">
          {/* The order of the episode doc: storyboard, then video, then the script of these beats. */}
          <section className="space-y-3" aria-labelledby="sequence-storyboard">
            <h3 id="sequence-storyboard" className="text-base font-semibold text-foreground">Storyboard</h3>
            <SequenceAttachments sceneId={scene.id} target="storyboard" onChanged={reload} />
            <StoryboardImages storyId={storyId} scenes={[scene]} episodeLocations={episodeLocations} onChanged={reload} single />
          </section>

          <section className="space-y-3" aria-labelledby="sequence-video">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="sequence-video" className="text-base font-semibold text-foreground">Video</h3>
              <ClipUploadButton
                sceneId={scene.id}
                planned={planned}
                onUploaded={async (message) => {
                  setClipMessage(message);
                  if (message.type === "success") await reload();
                }}
              />
            </div>
            <SequenceAttachments sceneId={scene.id} target="clip" onChanged={reload} />
            {clipMessage && (
              <Alert variant={clipMessage.type === "error" ? "destructive" : "default"}>
                {clipMessage.type === "error" ? <AlertTriangle /> : <Check />}
                <AlertDescription>{clipMessage.text}</AlertDescription>
              </Alert>
            )}
            <VideoStage scenes={[scene]} episodeLocations={episodeLocations} onRefetchScenes={reload} single />
          </section>

          <SequenceBeats key={scene.script_beats || ""} scene={scene} onSaved={reload} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <SequenceNotes storyId={storyId} sceneId={scene.id} storyboardUrl={scene.storyboard_image_url} clipUrl={clipUrl} />
          <SequenceHistory sceneId={scene.id} onRestored={reload} />
        </aside>
      </div>
    </div>
  );
}
