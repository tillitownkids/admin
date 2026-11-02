import { ArrowRight } from "lucide-react";

import { loadEpisode } from "@/lib/episodeLoader";
import { ButtonLink } from "@/components/ButtonLink";
import { StepStart } from "@/components/episode/StepStart";
import { SequencesStep } from "@/components/sequence/SequencesStep";
import { SEQUENCES_TABS, type SequencesTab } from "@/components/sequence/sequenceFormat";
import { lockedStepReason } from "@/lib/episodeSteps";

// Planning sequences and clips runs AI calls from this page's server actions, which can take minutes.
export const maxDuration = 300;

export default async function EpisodeSequencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ storyId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ storyId }, { tab }] = await Promise.all([params, searchParams]);
  const result = await loadEpisode(storyId);
  if (!result.success) return null;
  const { episode } = result;

  if (!episode.scriptId) {
    return (
      <StepStart
        title="Sequences need a script"
        description={`Sequences are planned from the beat script, one storyboard panel per beat. ${lockedStepReason("sequences")}`}
        action={
          <ButtonLink href={`/episodes/${storyId}/script`}>
            Go to Script
            <ArrowRight />
          </ButtonLink>
        }
      />
    );
  }

  const initialTab: SequencesTab = SEQUENCES_TABS.includes(tab as SequencesTab) ? (tab as SequencesTab) : "overview";
  return (
    <SequencesStep
      key={initialTab}
      storyId={storyId}
      scriptId={episode.scriptId}
      sequenceCount={episode.progress.scenes}
      initialTab={initialTab}
    />
  );
}
