import { loadEpisode } from "@/lib/episodeLoader";
import { getEpisodeAssetsAction } from "@/actions/episodeAssetsAction";
import { AssetsStep } from "@/components/episode/AssetsStep";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Finding objects reads the whole story with the AI, which can take a minute.
export const maxDuration = 300;

export default async function EpisodeAssetsPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const result = await loadEpisode(storyId);
  // The layout reports a missing episode.
  if (!result.success) return null;

  const assets = await getEpisodeAssetsAction(storyId);
  if (!assets.ok) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{assets.error}</AlertDescription>
      </Alert>
    );
  }
  return <AssetsStep storyId={storyId} assets={assets.assets} />;
}
