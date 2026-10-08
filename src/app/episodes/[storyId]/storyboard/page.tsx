import { ArrowRight } from "lucide-react";

import { loadEpisode } from "@/lib/episodeLoader";
import { ButtonLink } from "@/components/ButtonLink";
import { StepStart } from "@/components/episode/StepStart";
import { StoryboardStep } from "@/components/episode/StoryboardStep";
import { lockedStepReason } from "@/lib/episodeSteps";

export default async function EpisodeStoryboardPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const result = await loadEpisode(storyId);
  if (!result.success) return null;
  const { episode } = result;

  if (!episode.scriptId) {
    return (
      <StepStart
        title="The storyboard needs a script"
        description={`The storyboard is planned from the beat script, one panel per beat. ${lockedStepReason("storyboard")}`}
        action={
          <ButtonLink href={`/episodes/${storyId}/script`}>
            Go to Script
            <ArrowRight />
          </ButtonLink>
        }
      />
    );
  }

  return (
    <StoryboardStep
      storyId={storyId}
      scriptId={episode.scriptId}
      sceneCount={episode.progress.scenes}
      imageCount={episode.progress.scenesWithImage}
    />
  );
}
