import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import { loadEpisode } from "@/lib/episodeLoader";
import { EpisodeReferences } from "@/components/episode/EpisodeReferences";
import { DeleteEpisodeButton } from "@/components/episode/DeleteEpisodeButton";
import { EpisodeCacheSync } from "@/components/episode/EpisodeCacheSync";
import { EpisodeStepper } from "@/components/episode/EpisodeStepper";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { episodeStepStates } from "@/lib/episodeSteps";

// The workspace for one episode: its title, its five steps, and whichever step is open below.
export default async function EpisodeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const result = await loadEpisode(storyId);

  const backLink = (
    <Link
      href="/episodes"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ArrowLeft className="size-3.5" />
      Episodes
    </Link>
  );

  if (!result.success) {
    return (
      <div className="mx-auto w-full max-w-[1200px] space-y-4 pb-10">
        {backLink}
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>This episode could not be opened</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { episode } = result;

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 pb-10">
      <header className="space-y-2">
        {backLink}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">{episode.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <span>Episode {episode.number}</span>
          <EpisodeReferences storyId={storyId} characters={episode.characters} locations={episode.locations} objects={episode.objects} />
          <DeleteEpisodeButton storyId={storyId} title={episode.title} />
        </div>
      </header>

      <EpisodeCacheSync storyId={storyId} version={`${episode.updatedAt}|${JSON.stringify(episode.progress)}`} />
      <EpisodeStepper storyId={storyId} states={episodeStepStates(episode.progress)} />

      {children}
    </div>
  );
}
