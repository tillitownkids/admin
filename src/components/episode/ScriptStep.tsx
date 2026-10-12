"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { BeatScriptEditor } from "@/components/episode/BeatScriptEditor";
import { ScriptGenerator } from "@/components/episode/ScriptGenerator";
import { Button } from "@/components/ui/button";

/** The Script step: write the beat script from the story, edit it, or write it again when the story changes. */
export function ScriptStep({ storyId, scriptId }: { storyId: string; scriptId: string | null }) {
  const [replanning, setReplanning] = useState(false);
  // Remounts the editor after a rewrite, so it loads the new script text.
  const [version, setVersion] = useState(0);

  if (!scriptId || replanning) {
    return (
      <div className="space-y-2">
        <ScriptGenerator
          storyId={storyId}
          scriptId={scriptId}
          onGenerated={() => {
            setReplanning(false);
            setVersion((value) => value + 1);
          }}
        />
        {replanning && (
          <Button variant="ghost" size="sm" onClick={() => setReplanning(false)}>
            Keep the current script
          </Button>
        )}
      </div>
    );
  }

  return (
    <BeatScriptEditor
      key={`${scriptId}-${version}`}
      scriptId={scriptId}
      headerAction={
        <ConfirmButton
          variant="ghost"
          size="sm"
          title="Write the script again?"
          description="This rewrites the beat script from the episode's current story, replacing the saved script and any edits made to it. The storyboard is not changed; plan it again in the Storyboard step so its scenes match the new beats."
          confirmLabel="Plan again"
          onConfirm={() => setReplanning(true)}
        >
          <RefreshCw />
          Plan again
        </ConfirmButton>
      }
    />
  );
}
