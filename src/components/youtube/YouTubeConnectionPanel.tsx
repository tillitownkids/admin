"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, Loader2, LogOut, Tv } from "lucide-react";
import { disconnectYouTubeAction } from "@/actions/youtubePublishingAction";
import { ConfirmButton } from "@/components/ConfirmButton";

interface YouTubeConnectionPanelProps {
  connection: {
    channelId: string;
    channelTitle: string | null;
  } | null;
  callbackStatus?: string;
}

export function YouTubeConnectionPanel({ connection, callbackStatus }: YouTubeConnectionPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectYouTubeAction();
      if (!result.success) {
        setError(result.error || "Could not disconnect YouTube.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
            <Tv className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">YouTube channel</h2>
              {connection && <CheckCircle2 className="h-4 w-4 text-success" />}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {connection
                ? connection.channelTitle || "Connected channel"
                : "Connect the channel that episodes are published to."}
            </p>
          </div>
        </div>

        {connection ? (
          <div className="flex items-center gap-2">
            <a
              href="/api/youtube/connect"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Link2 className="h-4 w-4" />
              Reconnect
            </a>
            <ConfirmButton
              variant="destructive"
              disabled={isPending}
              title="Disconnect this YouTube channel?"
              description="Episodes can no longer be uploaded until a channel is connected again. Videos already on YouTube are not affected."
              confirmLabel="Disconnect channel"
              destructive
              onConfirm={disconnect}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
              Disconnect
            </ConfirmButton>
          </div>
        ) : (
          <a
            href="/api/youtube/connect"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
          >
            <Tv className="h-4 w-4" />
            Connect YouTube
          </a>
        )}
      </div>

      {callbackStatus && callbackStatus !== "connected" && (
        <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          YouTube connection failed or was cancelled. Please try again.
        </p>
      )}
      {error && <p className="mt-4 text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
