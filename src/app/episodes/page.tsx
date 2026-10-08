"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Plus } from "lucide-react";

import { getEpisodesAction, type EpisodeSummary } from "@/actions/episodesAction";
import { EpisodeProgressBar } from "@/components/episode/EpisodeProgressBar";
import { ButtonLink } from "@/components/ButtonLink";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EPISODE_STEPS, episodeStatusLine, nextEpisodeStep } from "@/lib/episodeSteps";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default function EpisodesPage() {
  const [episodes, setEpisodes] = useState<EpisodeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await getEpisodesAction();
    if (result.success) setEpisodes(result.episodes);
    else setError(result.error);
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const newEpisodeButton = (
    <ButtonLink href="/episodes/new">
      <Plus />
      New episode
    </ButtonLink>
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 pb-10">
      <PageHeader
        title="Episodes"
        description="Every episode and the step it has reached."
        action={newEpisodeButton}
      />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Episodes could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
          </AlertAction>
        </Alert>
      )}

      {!error && episodes === null && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading episodes">
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}
        </div>
      )}

      {episodes?.length === 0 && (
        <div className="max-w-xl space-y-4 py-6">
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">No episodes yet</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              An episode starts as a story. From there it moves through script, storyboard, video and publishing, and this list shows where each one stands.
            </p>
          </div>
          {newEpisodeButton}
        </div>
      )}

      {episodes && episodes.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No.</TableHead>
              <TableHead>Episode</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="hidden lg:table-cell">Last change</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Next step</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {episodes.map((episode) => {
              const next = nextEpisodeStep(episode.progress);
              const nextLabel = EPISODE_STEPS.find((step) => step.key === next)!.label;
              const finished = episode.progress.publishedVideos > 0;
              return (
                <TableRow key={episode.id}>
                  <TableCell className="text-muted-foreground tabular-nums">{episode.number}</TableCell>
                  <TableCell className="max-w-[360px] whitespace-normal">
                    <Link
                      href={`/episodes/${episode.id}/${next}`}
                      className="font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
                    >
                      {episode.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <EpisodeProgressBar progress={episode.progress} />
                      <span className="text-xs text-muted-foreground">{episodeStatusLine(episode.progress)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {dateFormat.format(new Date(episode.updatedAt))}
                  </TableCell>
                  <TableCell className="text-right">
                    <ButtonLink
                      variant="outline"
                      size="sm"
                      href={`/episodes/${episode.id}/${next}`}
                    >
                      {finished ? "Open" : `Continue: ${nextLabel}`}
                      <ArrowRight />
                    </ButtonLink>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
