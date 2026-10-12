import { loadEpisode } from "@/lib/episodeLoader";
import { ScriptStep } from "@/components/episode/ScriptStep";

export default async function EpisodeScriptPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const result = await loadEpisode(storyId);
  // The layout reports a missing episode.
  if (!result.success) return null;

  return <ScriptStep key={result.episode.scriptId ?? "none"} storyId={storyId} scriptId={result.episode.scriptId} />;
}
