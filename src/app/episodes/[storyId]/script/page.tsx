import { loadEpisode } from "@/lib/episodeLoader";
import { BeatScriptEditor } from "@/components/episode/BeatScriptEditor";
import { ScriptGenerator } from "@/components/episode/ScriptGenerator";

export default async function EpisodeScriptPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const result = await loadEpisode(storyId);
  // The layout reports a missing episode.
  if (!result.success) return null;

  return result.episode.scriptId
    ? <BeatScriptEditor key={result.episode.scriptId} scriptId={result.episode.scriptId} />
    : <ScriptGenerator storyId={storyId} />;
}
