"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { deleteEpisodeAction } from "@/actions/deleteEpisodeAction";
import { ConfirmButton } from "@/components/ConfirmButton";

/** Deletes the episode after confirmation, then returns to the episode list. */
export function DeleteEpisodeButton({ storyId, title }: { storyId: string; title: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    const result = await deleteEpisodeAction(storyId);
    if (result.success) {
      router.push("/episodes");
      router.refresh();
      return;
    }
    setError(result.error);
    setDeleting(false);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <ConfirmButton
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground hover:text-destructive"
        disabled={deleting}
        destructive
        title={`Delete "${title}"?`}
        description="This deletes the episode with its story, script, scenes, storyboard images, video clips, stitched episodes and episode-only objects, including every take and stored file. Library characters, locations and permanent objects are kept, and a video already published to YouTube stays there. This cannot be undone."
        confirmLabel="Delete episode"
        onConfirm={remove}
      >
        {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        {deleting ? "Deleting…" : "Delete episode"}
      </ConfirmButton>
      {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
    </span>
  );
}
