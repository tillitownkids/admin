import { ArrowRight } from "lucide-react";

import { loadEpisode } from "@/lib/episodeLoader";
import { ButtonLink } from "@/components/ButtonLink";
import { StepStart } from "@/components/episode/StepStart";
import { VideoStep } from "@/components/episode/VideoStep";
import { lockedStepReason } from "@/lib/episodeSteps";

// Stitching waits on the external stitcher service, which can take minutes.
export const maxDuration = 300;

export default async function EpisodeVideoPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const result = await loadEpisode(storyId);
  if (!result.success) return null;
  const { episode } = result;

  if (episode.progress.scenesWithImage === 0) {
    return (
      <StepStart
        title="Clips need storyboard images"
        description={`Each clip opens on its own storyboard panel. ${lockedStepReason("video")}`}
        action={
          <ButtonLink href={`/episodes/${storyId}/storyboard`}>
            Go to Storyboard
            <ArrowRight />
          </ButtonLink>
        }
      />
    );
  }

  return <VideoStep storyId={storyId} episodeTitle={episode.title} />;
}
