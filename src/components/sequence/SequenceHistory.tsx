"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, History, Loader2 } from "lucide-react";

import { listPromptVersionsAction, restorePromptVersionAction } from "@/actions/sequenceAction";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatWhen } from "@/components/sequence/sequenceFormat";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import type { PromptField, PromptVersion } from "@/lib/promptHistory";

const FIELD_LABELS: Record<PromptField, string> = {
  beats: "Beats",
  storyboard_prompt: "Storyboard prompt",
  clip_prompt: "Clip prompt",
};

const AUTHOR_LABELS: Record<PromptVersion["author"], string> = {
  admin: "Team",
  claude: "Claude",
  ai: "AI planner",
  original: "Original",
};

/** Every saved version of the sequence's beats and prompts, newest first, each one restorable. */
export function SequenceHistory({ sceneId, onRestored }: { sceneId: string; onRestored: () => Promise<void> | void }) {
  const query = useQuery({
    queryKey: queryKeys.promptVersions(sceneId),
    queryFn: async () => {
      const result = await listPromptVersionsAction(sceneId);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
  });
  const [field, setField] = useState<PromptField | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const versions = query.data?.versions || [];
  // The newest version of each field is what the sequence holds now.
  const current = new Set(PROMPT_FIELD_KEYS.map((key) => versions.find((version) => version.field === key)?.id).filter(Boolean));
  const shown = versions.filter((version) => field === "all" || version.field === field);

  const restore = async (version: PromptVersion) => {
    setBusy(version.id);
    setMessage(null);
    const result = await restorePromptVersionAction(version.id);
    setBusy(null);
    if (!result.ok) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setMessage({ type: "success", text: result.note || `${FIELD_LABELS[version.field]} restored. It is saved as the newest version.` });
    await Promise.all([query.refetch(), onRestored()]);
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="size-4" />History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive">{query.error.message}</p>
        ) : !query.data?.available ? (
          <p className="text-sm text-muted-foreground">
            Run <code className="break-all text-xs">supabase/migrations/20261102000000_sequence_workspace.sql</code> in the Supabase SQL editor to keep a history of every change.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="Show history of">
              {(["all", ...PROMPT_FIELD_KEYS] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={field === key}
                  onClick={() => setField(key)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    field === key ? "border-primary text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {key === "all" ? "All" : FIELD_LABELS[key]}
                </button>
              ))}
            </div>

            {message && (
              <Alert variant={message.type === "error" ? "destructive" : "default"}>
                {message.type === "error" && <AlertTriangle />}
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            )}

            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes recorded yet. Every saved edit, from the team or from Claude, appears here.</p>
            ) : (
              <ul className="space-y-2">
                {shown.map((version) => (
                  <li key={version.id} className="rounded-lg border border-border p-3">
                    <Collapsible>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{FIELD_LABELS[version.field]}</span>
                        <Badge variant={version.author === "claude" ? "secondary" : "outline"}>{AUTHOR_LABELS[version.author]}</Badge>
                        {current.has(version.id) && <Badge variant="outline">Current</Badge>}
                        <span>{formatWhen(version.created_at)}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{version.value}</p>
                      <CollapsibleContent>
                        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-foreground">{version.value}</pre>
                      </CollapsibleContent>
                      <div className="mt-1 flex items-center gap-1">
                        <CollapsibleTrigger className="group/trigger inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 -ml-2">
                          <ChevronDown className="size-3 transition-transform group-data-[panel-open]/trigger:rotate-180" />
                          Full text
                        </CollapsibleTrigger>
                        {!current.has(version.id) && (
                          <ConfirmButton
                            variant="ghost"
                            size="xs"
                            disabled={busy !== null}
                            title={`Restore this ${FIELD_LABELS[version.field].toLowerCase()}?`}
                            description={
                              version.field === "beats"
                                ? "The sequence's beats, and the same beats in the episode script, go back to this version. The current text stays in the history."
                                : "The sequence goes back to this text. The current text stays in the history. Generate a new storyboard or clip to see it."
                            }
                            confirmLabel="Restore"
                            onConfirm={() => restore(version)}
                          >
                            {busy === version.id && <Loader2 className="animate-spin" />}
                            Restore
                          </ConfirmButton>
                        )}
                      </div>
                    </Collapsible>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const PROMPT_FIELD_KEYS: PromptField[] = ["beats", "storyboard_prompt", "clip_prompt"];
