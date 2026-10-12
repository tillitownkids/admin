"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { CharacterCheck } from "@/components/episode/CharacterCheck";
import { EpisodeStitcher } from "@/components/episode/EpisodeStitcher";
import { useEpisodeScenes } from "@/components/episode/useEpisodeScenes";
import { VideoStage } from "@/components/episode-production/VideoStage";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** The Video step: one clip per shot, then the clips stitched into the episode. */
export function VideoStep({ storyId, episodeTitle }: { storyId: string; episodeTitle: string }) {
  const router = useRouter();
  const { scenes, episodeLocations, isLoading, error, refetch } = useEpisodeScenes(storyId);
  const [clipsVersion, setClipsVersion] = useState(0);
  // Bumped when the character check re-plans shots, so the video stage drops plans it holds from before.
  const [checkVersion, setCheckVersion] = useState(0);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading scenes…
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-10">
      <CharacterCheck
        storyId={storyId}
        onChanged={async () => {
          await refetch();
          setCheckVersion((version) => version + 1);
          router.refresh();
        }}
      />
      <VideoStage
        key={checkVersion}
        scenes={scenes}
        episodeLocations={episodeLocations}
        onRefetchScenes={async () => {
          await refetch();
          setClipsVersion((version) => version + 1);
          router.refresh();
        }}
      />
      <div className="border-t border-border pt-8">
        <EpisodeStitcher storyId={storyId} episodeTitle={episodeTitle} reloadKey={clipsVersion} />
      </div>
    </div>
  );
}
