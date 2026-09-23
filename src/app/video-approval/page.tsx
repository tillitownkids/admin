import { AlertCircle, BadgeCheck, Clock, ExternalLink, Film } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getAllEpisodeVideosAction } from "@/actions/stitchVideosAction";
import { prisma } from "@/lib/prisma";
import { YouTubeConnectionPanel } from "@/components/youtube/YouTubeConnectionPanel";
import { YouTubePublishControls } from "@/components/youtube/YouTubePublishControls";

type PrivacyStatus = "private" | "unlisted" | "public";

export const maxDuration = 300;

function defaultPrivacyStatus(): PrivacyStatus {
  const value = process.env.YOUTUBE_DEFAULT_PRIVACY_STATUS;
  return value === "public" || value === "unlisted" ? value : "private";
}

export default async function VideoPublishingPage({
  searchParams,
}: {
  searchParams: Promise<{ youtube?: string }>;
}) {
  const [result, connection, query] = await Promise.all([
    getAllEpisodeVideosAction(),
    prisma.youTubeConnection.findUnique({ where: { id: "primary" } }),
    searchParams,
  ]);
  const videos = result.videos ?? [];
  const defaults = {
    privacyStatus: defaultPrivacyStatus(),
    categoryId: process.env.YOUTUBE_DEFAULT_CATEGORY_ID || "1",
    madeForKids: process.env.YOUTUBE_DEFAULT_MADE_FOR_KIDS !== "false",
    containsSyntheticMedia: process.env.YOUTUBE_DEFAULT_CONTAINS_SYNTHETIC_MEDIA === "true",
  };

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={BadgeCheck}
        title="Video"
        highlight="Publishing"
        description="Review stitched episode videos that are ready for publishing."
        action={
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg border border-primary/20 backdrop-blur-sm">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="font-semibold">
              {videos.length} {videos.length === 1 ? "Video" : "Videos"}
            </span>
          </div>
        }
      />

      <YouTubeConnectionPanel
        connection={connection ? {
          channelId: connection.channel_id,
          channelTitle: connection.channel_title,
        } : null}
        callbackStatus={query.youtube}
      />

      {!result.success ? (
        <div className="flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-5 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Could not load stitched videos</p>
            <p className="mt-1 text-sm opacity-80">{result.error}</p>
          </div>
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Film className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h2 className="mt-4 text-lg font-bold text-foreground">No stitched videos yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Videos will appear here after a full episode is created on the Video Stitching page.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {videos.map((video) => {
            const channelUpload = video.YouTubeUpload.find((upload) => upload.channel_id === connection?.channel_id);
            const episodeLabel = video.Story
              ? `Episode ${video.Story.episode_number}${video.Story.topic ? ` · ${video.Story.topic}` : ""}`
              : "Episode details unavailable";

            return (
              <article
                key={video.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <div className="aspect-video bg-black">
                  <video
                    src={video.video_url}
                    controls
                    preload="metadata"
                    className="h-full w-full object-contain"
                  >
                    Your browser does not support video playback.
                  </video>
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-foreground" title={video.title}>
                        {video.title}
                      </h2>
                      <p className="mt-1 truncate text-sm text-muted-foreground" title={episodeLabel}>
                        {episodeLabel}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-600 dark:text-emerald-400">
                      {video.status || "ready"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {video.duration && <span>{video.duration}</span>}
                      {video.created_at && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(video.created_at)}
                        </span>
                      )}
                    </div>

                    <a
                      href={video.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Open Video
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <div className="border-t border-border/60 pt-4">
                    <YouTubePublishControls
                      key={`${video.id}:${connection?.channel_id || "disconnected"}`}
                      videoId={video.id}
                      channelId={connection?.channel_id ?? null}
                      videoTitle={video.title}
                      connected={Boolean(connection)}
                      upload={channelUpload ? {
                        id: channelUpload.id,
                        status: channelUpload.status,
                        progress: channelUpload.progress,
                        youtubeVideoId: channelUpload.youtube_video_id,
                        youtubeUrl: channelUpload.youtube_url,
                        errorMessage: channelUpload.error_message,
                      } : null}
                      defaults={defaults}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
