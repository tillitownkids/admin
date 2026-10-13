"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, ChevronDown, Download, Film, Loader2, Trash2 } from "lucide-react";

import { deleteEpisodeVideoAction, getEpisodeVideosAction, stitchEpisodeVideosAction } from "@/actions/stitchVideosAction";
import { ButtonLink } from "@/components/ButtonLink";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sceneClips } from "@/lib/sceneShots";
import { storyboardQuery } from "@/lib/episodeQueries";
import { queryKeys } from "@/lib/queryKeys";

// One clip to stitch. A scene generated shot by shot contributes one entry per shot.
interface Clip {
  sceneId: string;
  sceneNumber: number;
  /** Null for an older scene with a single full-scene clip. */
  shot: number | null;
  url: string;
}

interface StoryboardScene {
  id: string;
  scene_number: number;
  video_prompt?: string | null;
  video_url?: string | null;
}

interface StitchedVideo {
  id: string;
  title: string;
  video_url: string;
  created_at?: string | Date | null;
}

const NO_VIDEOS: StitchedVideo[] = [];

const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** Joins the episode's clips into one video, and lists the versions already made. */
export function EpisodeStitcher({
  storyId,
  episodeTitle,
  reloadKey = 0,
}: {
  storyId: string;
  episodeTitle: string;
  /** Changes whenever the clips above change, so this list reloads. */
  reloadKey?: number;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Cached: the clips (from the shared storyboard data) and the stitched versions show at once on return.
  const storyboard = useQuery(storyboardQuery(storyId));
  const videosQuery = useQuery({
    queryKey: queryKeys.episodeVideos(storyId),
    queryFn: async (): Promise<StitchedVideo[]> => {
      const saved = await getEpisodeVideosAction(storyId);
      return saved.success && saved.videos ? (saved.videos as StitchedVideo[]) : [];
    },
  });
  const videos = videosQuery.data ?? NO_VIDEOS;
  const setVideos = (update: (previous: StitchedVideo[]) => StitchedVideo[]) =>
    queryClient.setQueryData<StitchedVideo[]>(queryKeys.episodeVideos(storyId), (previous) => update(previous ?? []));

  // The clips in playback order, and the scenes still missing some.
  const { clips, incompleteScenes } = useMemo(() => {
    if (storyboard.error) return { clips: [] as Clip[], incompleteScenes: [] as string[] };
    if (!storyboard.data) return { clips: null, incompleteScenes: [] as string[] };
    const ordered = [...((storyboard.data.scenes || []) as StoryboardScene[])].sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
    const incomplete: string[] = [];
    const list = ordered.flatMap((scene) => {
      const { clips: sceneClipList, missingShots } = sceneClips(scene);
      if (missingShots > 0) incomplete.push(`scene ${scene.scene_number} (${missingShots} missing)`);
      return sceneClipList.map((clip) => ({ sceneId: scene.id, sceneNumber: scene.scene_number, shot: clip.shot, url: clip.url }));
    });
    return { clips: list as Clip[] | null, incompleteScenes: incomplete };
  }, [storyboard.data, storyboard.error]);
  const [title, setTitle] = useState(`${episodeTitle} - Full Episode`);
  const [isStitching, setIsStitching] = useState(false);
  const [busyVideoId, setBusyVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // New clips above: reload the clip list and the stitched versions.
  const lastReloadKey = useRef(reloadKey);
  useEffect(() => {
    if (lastReloadKey.current === reloadKey) return;
    lastReloadKey.current = reloadKey;
    void queryClient.invalidateQueries({ queryKey: queryKeys.episodeStoryboard(storyId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.episodeVideos(storyId) });
  }, [queryClient, reloadKey, storyId]);
  const loadError = storyboard.error ? storyboard.error.message : null;

  async function handleStitch() {
    if (!clips?.length) return;
    setIsStitching(true);
    setError(null);
    setNotice(null);
    try {
      const result = await stitchEpisodeVideosAction({
        storyId,
        title: title.trim() || `${episodeTitle} - Full Episode`,
        videoUrls: clips.map((clip) => clip.url),
        sceneIds: Array.from(new Set(clips.map((clip) => clip.sceneId))),
        clipLabels: clips.map((clip) => `scene ${clip.sceneNumber}${clip.shot !== null ? ` shot ${clip.shot}` : ""}`),
      });
      if (!result.success || !result.video) throw new Error(result.error || "The episode was not stitched.");
      setVideos((previous) => [result.video as unknown as StitchedVideo, ...previous]);
      setNotice("The episode video is ready. It is listed below and can now be published.");
      router.refresh();
    } catch (err) {
      // The action returns its own errors; an exception here means the request itself was cut off.
      setError(err instanceof Error ? err.message : "The stitching request was cut off before the server answered. No video was saved. Try again.");
    } finally {
      setIsStitching(false);
    }
  }

  async function handleDownload(video: StitchedVideo) {
    setBusyVideoId(video.id);
    try {
      const blob = await (await fetch(video.video_url)).blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${video.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(video.video_url, "_blank");
    } finally {
      setBusyVideoId(null);
    }
  }

  async function handleDelete(video: StitchedVideo) {
    setBusyVideoId(video.id);
    setError(null);
    try {
      const result = await deleteEpisodeVideoAction(video.id);
      if (!result.success) throw new Error(result.error || "The video was not deleted.");
      setVideos((previous) => previous.filter((item) => item.id !== video.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The video was not deleted.");
    } finally {
      setBusyVideoId(null);
    }
  }

  const clipCount = clips?.length ?? 0;

  return (
    <section className="space-y-4" aria-labelledby="stitch-heading">
      <div className="space-y-1">
        <h2 id="stitch-heading" className="text-lg font-semibold text-foreground">Episode video</h2>
        <p className="text-sm text-muted-foreground">
          {clips === null
            ? "Loading clips…"
            : clipCount === 0
            ? "Generate clips above first. Stitching joins them, in scene and shot order, into one video."
            : `Joins ${clipCount} clip${clipCount === 1 ? "" : "s"}, in scene and shot order, into one video. This can take a few minutes.`}
        </p>
      </div>

      {(error || loadError) && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>That did not work</AlertTitle>
          <AlertDescription>{error || loadError}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <Check />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {incompleteScenes.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Some shots have no clip yet</AlertTitle>
          <AlertDescription>
            Stitching now leaves them out of the episode: {incompleteScenes.join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      {clipCount > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1 space-y-1.5 sm:max-w-md">
              <Label htmlFor="stitch-title">Video title</Label>
              <Input id="stitch-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={isStitching} />
            </div>
            <Button onClick={handleStitch} disabled={isStitching}>
              {isStitching ? <Loader2 className="animate-spin" /> : <Film />}
              {isStitching ? "Stitching…" : `Stitch episode (${clipCount} clips)`}
            </Button>
          </div>

          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button variant="ghost" size="sm" className="group/trigger -ml-2">
                  Preview the clips in order
                  <ChevronDown className="transition-transform group-data-[panel-open]/trigger:rotate-180" />
                </Button>
              }
            />
            <CollapsibleContent>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {clips!.map((clip) => (
                  <figure key={`${clip.sceneId}-${clip.shot ?? "scene"}`} className="space-y-1.5">
                    <video src={clip.url} controls preload="metadata" className="aspect-video w-full rounded-lg border border-border bg-black object-contain" />
                    <figcaption className="text-xs text-muted-foreground">
                      Scene {clip.sceneNumber}{clip.shot !== null ? `, shot ${clip.shot}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {videos.length > 0 && (
        <div className="space-y-3 border-t border-border pt-5">
          <h3 className="text-sm font-medium text-foreground">Stitched versions</h3>
          <ul className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {videos.map((video, index) => (
              <li key={video.id} className="space-y-2">
                <video src={video.video_url} controls preload="metadata" className="aspect-video w-full rounded-lg border border-border bg-black object-contain" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground" title={video.title}>{video.title}</span>
                      {index === 0 && <Badge variant="secondary">Latest</Badge>}
                    </div>
                    {video.created_at && (
                      <span className="text-xs text-muted-foreground">{dateTimeFormat.format(new Date(video.created_at))}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleDownload(video)} disabled={busyVideoId === video.id}>
                      {busyVideoId === video.id ? <Loader2 className="animate-spin" /> : <Download />}
                      Download
                    </Button>
                    <ConfirmButton
                      variant="ghost"
                      size="sm"
                      disabled={busyVideoId === video.id}
                      title="Delete this stitched video?"
                      description={`"${video.title}" is removed from storage, along with any YouTube upload record for it. The clips it was made from are kept.`}
                      confirmLabel="Delete video"
                      destructive
                      onConfirm={() => handleDelete(video)}
                    >
                      <Trash2 />
                      Delete
                    </ConfirmButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <ButtonLink href={`/episodes/${storyId}/publish`} variant="outline" size="sm">
            Continue to Publish
            <ArrowRight />
          </ButtonLink>
        </div>
      )}
    </section>
  );
}
