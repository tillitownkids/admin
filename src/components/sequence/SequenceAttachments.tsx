"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, ImageIcon, Loader2, Paperclip } from "lucide-react";

import { getSequenceAttachmentsAction, resetSequenceAttachmentsAction } from "@/actions/sequenceAction";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/queryKeys";
import type { AttachmentTarget, ResolvedAttachment } from "@/lib/sequenceAttachments";

const KIND_LABELS: Record<ResolvedAttachment["kind"], string> = {
  character: "Character sheet",
  location: "Location sheet",
  object: "Object sheet",
  storyboard: "Storyboard",
  reference: "Reference image",
};

/**
 * The reference images a sequence's storyboard or clip request sends, in order (Image 1, 2, ...).
 * Claude chooses them through the MCP server; without a choice they are automatic.
 */
export function SequenceAttachments({
  sceneId,
  target,
  onChanged,
}: {
  sceneId: string;
  target: AttachmentTarget;
  onChanged?: () => Promise<void> | void;
}) {
  const query = useQuery({
    queryKey: queryKeys.sequenceAttachments(sceneId),
    queryFn: async () => {
      const result = await getSequenceAttachmentsAction(sceneId);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
  });
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = query.data?.[target];

  const reset = async () => {
    setResetting(true);
    setError(null);
    const result = await resetSequenceAttachmentsAction(sceneId, target);
    setResetting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await Promise.all([query.refetch(), onChanged?.()]);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Paperclip className="size-3.5 text-muted-foreground" />
          Attachments
          {set && (set.automatic
            ? <Badge variant="outline" className="text-muted-foreground">Automatic</Badge>
            : <Badge variant="secondary"><Bot />Chosen by Claude</Badge>)}
        </p>
        {set && !set.automatic && (
          <ConfirmButton
            variant="ghost"
            size="xs"
            disabled={resetting}
            title="Use automatic attachments?"
            description={`The ${target === "clip" ? "clip" : "storyboard"} request goes back to attaching this sequence's cast, location and objects${target === "clip" ? ", after its own storyboard" : ""}. Claude's chosen order and sheet versions are forgotten, and prompts that name images by number may no longer match.`}
            confirmLabel="Use automatic"
            onConfirm={reset}
          >
            {resetting && <Loader2 className="animate-spin" />}
            Use automatic
          </ConfirmButton>
        )}
      </div>

      {query.isPending ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Loading…</p>
      ) : query.error ? (
        <p className="text-xs text-destructive">{query.error.message}</p>
      ) : !set || set.attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing is attached. Link characters, a location or objects to this sequence, or ask Claude to choose its attachments.</p>
      ) : (
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {set.attachments.map((item) => (
            <li key={`${item.image}-${item.id}`} className="min-w-0 space-y-1">
              <div className="relative overflow-hidden rounded-md border border-border bg-muted/30">
                {item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.label} className="aspect-video w-full object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-muted-foreground"><ImageIcon className="size-4" /></div>
                )}
                <span className="absolute left-1 top-1 rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] text-foreground">Image {item.image}</span>
              </div>
              <p className="truncate text-xs font-medium text-foreground" title={item.label}>{item.label}</p>
              <p className="truncate text-[11px] text-muted-foreground" title={item.role || KIND_LABELS[item.kind]}>
                {item.role || KIND_LABELS[item.kind]}{item.take_id ? " · chosen version" : ""}
              </p>
              {item.problem && (
                <p className="flex gap-1 text-[11px] text-destructive"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{item.problem}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {set?.automatic && (
        <p className="text-[11px] text-muted-foreground">Ask Claude to choose this {target === "clip" ? "clip" : "storyboard"}&apos;s attachments (order, sheet versions, a continuity storyboard); the request then sends exactly that list.</p>
      )}
    </div>
  );
}
