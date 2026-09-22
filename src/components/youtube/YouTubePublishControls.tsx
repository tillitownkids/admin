"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, RefreshCw, Tv, Upload, X } from "lucide-react";
import {
  publishVideoToYouTubeAction,
  refreshYouTubeUploadStatusAction,
} from "@/actions/youtubePublishingAction";

type PrivacyStatus = "private" | "unlisted" | "public";

interface UploadState {
  id: string;
  status: string;
  progress: number;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  errorMessage: string | null;
}

interface YouTubePublishControlsProps {
  videoId: string;
  channelId: string | null;
  videoTitle: string;
  connected: boolean;
  upload: UploadState | null;
  defaults: {
    privacyStatus: PrivacyStatus;
    categoryId: string;
    madeForKids: boolean;
    containsSyntheticMedia: boolean;
  };
}

function statusClass(status: string) {
  if (status === "published") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (status === "failed") return "bg-destructive/10 text-destructive";
  return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
}

export function YouTubePublishControls({
  videoId,
  channelId,
  videoTitle,
  connected,
  upload,
  defaults,
}: YouTubePublishControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(videoTitle.slice(0, 100));
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("TilliTown, kids animation, educational");
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus>(defaults.privacyStatus);
  const [categoryId, setCategoryId] = useState(defaults.categoryId);
  const [madeForKids, setMadeForKids] = useState(defaults.madeForKids);
  const [containsSyntheticMedia, setContainsSyntheticMedia] = useState(defaults.containsSyntheticMedia);

  const hasYouTubeVideo = Boolean(upload?.youtubeVideoId);
  const canRetry = upload?.status === "failed" && !hasYouTubeVideo;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channelId) return;
    setError(null);
    startTransition(async () => {
      const result = await publishVideoToYouTubeAction({
        videoId,
        channelId,
        title,
        description,
        tags: tags.split(","),
        categoryId,
        privacyStatus,
        madeForKids,
        containsSyntheticMedia,
      });

      if (!result.success) {
        setError(result.error || "YouTube upload failed.");
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  function refreshStatus() {
    if (!upload) return;
    setError(null);
    startTransition(async () => {
      const result = await refreshYouTubeUploadStatusAction(upload.id);
      if (!result.success) setError(result.error || "Could not refresh YouTube status.");
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-3">
        {upload && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(upload.status)}`}>
              YouTube: {upload.status}{upload.status === "uploading" ? ` ${upload.progress}%` : ""}
            </span>
            <div className="flex items-center gap-2">
              {upload.youtubeUrl && (
                <a
                  href={upload.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  View on YouTube <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {hasYouTubeVideo && (
                <button
                  type="button"
                  onClick={refreshStatus}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                  Refresh status
                </button>
              )}
            </div>
          </div>
        )}

        {upload?.errorMessage && <p className="text-xs text-destructive">{upload.errorMessage}</p>}
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}

        {!hasYouTubeVideo && (!upload || canRetry) && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={!connected}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            title={connected ? "Review metadata and upload" : "Connect YouTube first"}
          >
            <Tv className="h-4 w-4" />
            {canRetry ? "Retry Upload" : "Review & Upload"}
          </button>
        )}
      </div>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">Review YouTube Upload</h2>
                <p className="mt-1 text-sm text-muted-foreground">Confirm the metadata and declarations before uploading.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-foreground">Title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/40" />
                <span className="block text-right text-xs text-muted-foreground">{title.length}/100</span>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-foreground">Description</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={5} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/40" />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-foreground">Tags</span>
                <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="comma, separated, tags" className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/40" />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-foreground">Visibility</span>
                  <select value={privacyStatus} onChange={(event) => setPrivacyStatus(event.target.value as PrivacyStatus)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/40">
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-foreground">Category</span>
                  <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground outline-none focus:ring-2 focus:ring-primary/40">
                    <option value="1">Film & Animation</option>
                    <option value="22">People & Blogs</option>
                    <option value="24">Entertainment</option>
                    <option value="27">Education</option>
                  </select>
                </label>
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={madeForKids} onChange={(event) => setMadeForKids(event.target.checked)} className="mt-1 h-4 w-4" />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">Made for kids</span>
                    <span className="text-xs text-muted-foreground">Declares the intended audience to YouTube.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={containsSyntheticMedia} onChange={(event) => setContainsSyntheticMedia(event.target.checked)} className="mt-1 h-4 w-4" />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">Contains realistic altered or synthetic media</span>
                    <span className="text-xs text-muted-foreground">Use this when YouTube&apos;s altered-content disclosure applies.</span>
                  </span>
                </label>
              </div>

              <p className="text-xs text-muted-foreground">Unaudited YouTube API projects may force uploaded videos to private visibility.</p>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-border pt-5">
              <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isPending} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isPending ? "Uploading…" : "Accept & Upload"}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
