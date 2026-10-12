"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { CharacterCheck } from "@/components/episode/CharacterCheck";
import type { SceneCharacterReport } from "@/actions/characterCheckAction";
import { StoryboardGenerator } from "@/components/episode/StoryboardGenerator";
import { StoryboardImages } from "@/components/episode/StoryboardImages";
import { StoryboardPromptEditor } from "@/components/episode/StoryboardPromptEditor";
import { useEpisodeScenes } from "@/components/episode/useEpisodeScenes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type View = "prompts" | "images";

/** The Storyboard step: plan the scenes, review their prompts, then generate one image per scene. */
export function StoryboardStep({
  storyId,
  scriptId,
  sceneCount,
  imageCount,
}: {
  storyId: string;
  scriptId: string;
  sceneCount: number;
  imageCount: number;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(imageCount > 0 ? "images" : "prompts");
  const [replanning, setReplanning] = useState(false);
  // Bumped when the character check changes prompts or links, so the open view loads them again.
  const [checkVersion, setCheckVersion] = useState(0);
  // The character check that ran right after planning, shown until the next check.
  const [planReports, setPlanReports] = useState<SceneCharacterReport[] | null>(null);

  if (sceneCount === 0 || replanning) {
    return (
      <div className="space-y-2">
        <StoryboardGenerator
          storyId={storyId}
          scriptId={scriptId}
          onPlanned={(characterReports) => {
            setPlanReports(characterReports);
            setReplanning(false);
            setView("prompts");
          }}
        />
        {replanning && (
          <Button variant="ghost" size="sm" onClick={() => setReplanning(false)}>
            Keep the current prompts
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Storyboard view">
          {([["prompts", "1. Prompts"], ["images", "2. Images"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={cn(
                "rounded-[5px] px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                view === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <ConfirmButton
          variant="ghost"
          size="sm"
          title="Plan the storyboard again?"
          description={`This splits the script into new scenes of 5 to 15 seconds and writes new prompts. Once the new plan is ready, the ${sceneCount} current scenes are deleted with their prompts, storyboard images, video clips and every take. Stitched episodes, character sheets and location sheets are kept. This cannot be undone.`}
          confirmLabel="Plan again"
          destructive
          onConfirm={() => setReplanning(true)}
        >
          <RefreshCw />
          Plan again
        </ConfirmButton>
      </div>

      <CharacterCheck
        storyId={storyId}
        initialReports={planReports}
        onChanged={() => {
          setCheckVersion((version) => version + 1);
          router.refresh();
        }}
      />

      {view === "prompts" ? (
        <StoryboardPromptEditor key={checkVersion} storyId={storyId} onSaved={() => router.refresh()} />
      ) : (
        <StoryboardImagesView key={checkVersion} storyId={storyId} />
      )}
    </div>
  );
}

function StoryboardImagesView({ storyId }: { storyId: string }) {
  const router = useRouter();
  const { scenes, episodeLocations, isLoading, error, refetch } = useEpisodeScenes(storyId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading scenes…
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

  return (
    <StoryboardImages
      storyId={storyId}
      scenes={scenes}
      episodeLocations={episodeLocations}
      onChanged={async () => {
        await refetch();
        router.refresh();
      }}
    />
  );
}
