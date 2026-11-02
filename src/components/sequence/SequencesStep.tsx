"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { StoryboardGenerator } from "@/components/episode/StoryboardGenerator";
import { StoryboardImages } from "@/components/episode/StoryboardImages";
import { StoryboardPromptEditor } from "@/components/episode/StoryboardPromptEditor";
import { useEpisodeScenes } from "@/components/episode/useEpisodeScenes";
import { VideoStage } from "@/components/episode-production/VideoStage";
import { SequenceTable } from "@/components/sequence/SequenceTable";
import type { SequencesTab } from "@/components/sequence/sequenceFormat";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The Sequences step: the episode's sequences at a glance, plus the episode-wide views for writing
 * prompts and generating storyboards and clips in bulk. Each sequence also has its own page.
 */
export function SequencesStep({
  storyId,
  scriptId,
  sequenceCount,
  initialTab,
}: {
  storyId: string;
  scriptId: string;
  sequenceCount: number;
  initialTab: SequencesTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<SequencesTab>(initialTab);
  const [replanning, setReplanning] = useState(false);

  if (sequenceCount === 0 || replanning) {
    return (
      <div className="space-y-2">
        <StoryboardGenerator
          storyId={storyId}
          scriptId={scriptId}
          onPlanned={() => {
            setReplanning(false);
            setTab("overview");
          }}
        />
        {replanning && (
          <Button variant="ghost" size="sm" onClick={() => setReplanning(false)}>
            Keep the current sequences
          </Button>
        )}
      </div>
    );
  }

  const changeTab = (next: SequencesTab) => {
    setTab(next);
    // The tab is part of the address, so a reload or a shared link opens the same view.
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  return (
    <Tabs value={tab} onValueChange={(value) => changeTab(value as SequencesTab)} className="gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="storyboards">Storyboards</TabsTrigger>
          <TabsTrigger value="clips">Clips</TabsTrigger>
        </TabsList>
        <ConfirmButton
          variant="ghost"
          size="sm"
          title="Plan the sequences again?"
          description={`This splits the script into new sequences of 5 to 15 seconds and writes new prompts. Once the new plan is ready, the ${sequenceCount} current sequences are deleted with their prompts, storyboard images, clips, every take, their issues and notes, and their prompt history. Stitched episodes and asset sheets are kept. This cannot be undone.`}
          confirmLabel="Plan again"
          destructive
          onConfirm={() => setReplanning(true)}
        >
          <RefreshCw />
          Plan again
        </ConfirmButton>
      </div>

      <TabsContent value="overview">
        <SequenceTable storyId={storyId} />
      </TabsContent>
      <TabsContent value="prompts">
        <StoryboardPromptEditor storyId={storyId} onSaved={() => router.refresh()} />
      </TabsContent>
      <TabsContent value="storyboards">
        <EpisodeScenesView storyId={storyId} kind="storyboards" />
      </TabsContent>
      <TabsContent value="clips">
        <EpisodeScenesView storyId={storyId} kind="clips" />
      </TabsContent>
    </Tabs>
  );
}

/** The episode-wide storyboard or clip view, loaded with the episode's sequences. */
function EpisodeScenesView({ storyId, kind }: { storyId: string; kind: "storyboards" | "clips" }) {
  const router = useRouter();
  const { scenes, episodeLocations, isLoading, error, refetch } = useEpisodeScenes(storyId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading sequences…
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
  const reload = async () => {
    await refetch();
    router.refresh();
  };
  return kind === "storyboards"
    ? <StoryboardImages storyId={storyId} scenes={scenes} episodeLocations={episodeLocations} onChanged={reload} />
    : <VideoStage scenes={scenes} episodeLocations={episodeLocations} onRefetchScenes={reload} />;
}
