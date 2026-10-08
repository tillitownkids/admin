import { redirect } from "next/navigation";

import { loadEpisode } from "@/lib/episodeLoader";
import { nextEpisodeStep } from "@/lib/episodeSteps";

// Opening an episode lands on the step it is waiting at.
export default async function EpisodePage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const result = await loadEpisode(storyId);
  redirect(`/episodes/${storyId}/${result.success ? nextEpisodeStep(result.episode.progress) : "story"}`);
}
