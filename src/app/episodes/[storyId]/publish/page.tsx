import { AlertTriangle, ArrowRight, ExternalLink } from "lucide-react";

import { ButtonLink } from "@/components/ButtonLink";
import { StepStart } from "@/components/episode/StepStart";
import { YouTubePublishControls } from "@/components/youtube/YouTubePublishControls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { loadEpisode } from "@/lib/episodeLoader";
import { lockedStepReason } from "@/lib/episodeSteps";
import { supabase } from "@/lib/supabase";

// Uploading to YouTube streams the whole video and can take minutes.
export const maxDuration = 300;

type PrivacyStatus = "private" | "unlisted" | "public";

interface UploadRow {
  id: string;
  channel_id: string;
  status: string;
  progress: number;
  youtube_video_id: string | null;
  youtube_url: string | null;
  error_message: string | null;
}

interface VideoRow {
  id: string;
  title: string;
  video_url: string;
  created_at: string | null;
  YouTubeUpload: UploadRow[];
}

const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

function defaultPrivacyStatus(): PrivacyStatus {
  const value = process.env.YOUTUBE_DEFAULT_PRIVACY_STATUS;
  return value === "public" || value === "unlisted" ? value : "private";
}

export default async function EpisodePublishPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const result = await loadEpisode(storyId);
  if (!result.success) return null;

  if (result.episode.progress.stitchedVideos === 0) {
    return (
      <StepStart
        title="Nothing to publish yet"
        description={`Publishing uploads the stitched episode video to YouTube. ${lockedStepReason("publish")}`}
        action={
          <ButtonLink href={`/episodes/${storyId}/video`}>
            Go to Video
            <ArrowRight />
          </ButtonLink>
        }
      />
    );
  }

  const [videosResult, connectionResult] = await Promise.all([
    supabase.from("Video").select("id,title,video_url,created_at,YouTubeUpload(*)").eq("story_id", storyId).order("created_at", { ascending: false }),
    supabase.from("YouTubeConnection").select("channel_id,channel_title").eq("id", "primary").maybeSingle(),
  ]);

  if (videosResult.error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>The stitched videos could not be loaded</AlertTitle>
        <AlertDescription>{videosResult.error.message}</AlertDescription>
      </Alert>
    );
  }

  const videos = (videosResult.data || []) as unknown as VideoRow[];
  const connection = connectionResult.data;
  const defaults = {
    privacyStatus: defaultPrivacyStatus(),
    categoryId: process.env.YOUTUBE_DEFAULT_CATEGORY_ID || "1",
    madeForKids: process.env.YOUTUBE_DEFAULT_MADE_FOR_KIDS !== "false",
    containsSyntheticMedia: process.env.YOUTUBE_DEFAULT_CONTAINS_SYNTHETIC_MEDIA === "true",
  };

  return (
    <div className="space-y-6">
      {!connection && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>No YouTube channel is connected</AlertTitle>
          <AlertDescription>
            Connect the channel in Settings before uploading.
          </AlertDescription>
          <div className="col-start-2 mt-2">
            <ButtonLink href="/settings" variant="outline" size="sm">
              Open Settings
              <ArrowRight />
            </ButtonLink>
          </div>
        </Alert>
      )}

      <ul className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {videos.map((video, index) => {
          const upload = video.YouTubeUpload.find((item) => item.channel_id === connection?.channel_id);
          return (
            <li key={video.id} className="space-y-3">
              <video src={video.video_url} controls preload="metadata" className="aspect-video w-full rounded-lg border border-border bg-black object-contain">
                Your browser does not support video playback.
              </video>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-medium text-foreground" title={video.title}>{video.title}</h2>
                    {index === 0 && videos.length > 1 && <Badge variant="secondary">Latest</Badge>}
                  </div>
                  {video.created_at && (
                    <p className="text-xs text-muted-foreground">Stitched {dateTimeFormat.format(new Date(video.created_at))}</p>
                  )}
                </div>
                <a
                  href={video.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Open file
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <YouTubePublishControls
                key={`${video.id}:${connection?.channel_id || "disconnected"}`}
                videoId={video.id}
                channelId={connection?.channel_id ?? null}
                videoTitle={video.title}
                connected={Boolean(connection)}
                upload={upload ? {
                  id: upload.id,
                  status: upload.status,
                  progress: upload.progress,
                  youtubeVideoId: upload.youtube_video_id,
                  youtubeUrl: upload.youtube_url,
                  errorMessage: upload.error_message,
                } : null}
                defaults={defaults}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
