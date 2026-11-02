"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, CheckCircle2, CircleDot, Loader2, RotateCcw, StickyNote, User } from "lucide-react";

import { addSequenceNoteAction, listSequenceNotesAction, setSequenceNoteStatusAction } from "@/actions/sequenceAction";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatWhen } from "@/components/sequence/sequenceFormat";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import type { NoteKind, SequenceNote } from "@/lib/sequenceNotes";

type Link = "none" | "storyboard" | "clip";

/** Issues found in a sequence's storyboard or clip, and notes about it, from the team or from Claude. */
export function SequenceNotes({
  storyId,
  sceneId,
  storyboardUrl,
  clipUrl,
}: {
  storyId: string;
  sceneId: string;
  storyboardUrl: string | null;
  clipUrl: string | null;
}) {
  const queryClient = useQueryClient();
  // The episode's notes are loaded once and shared with the sequence table.
  const query = useQuery({
    queryKey: queryKeys.sequenceNotes(storyId),
    queryFn: async () => {
      const result = await listSequenceNotesAction({ storyId });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
  });
  const [kind, setKind] = useState<NoteKind>("issue");
  const [body, setBody] = useState("");
  const [link, setLink] = useState<Link>("none");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const notes = (query.data?.notes || []).filter((note) => note.scene_id === sceneId);
  const open = notes.filter((note) => note.status === "open");
  const resolved = notes.filter((note) => note.status === "resolved");
  const reload = () => queryClient.invalidateQueries({ queryKey: queryKeys.sequenceNotes(storyId) });

  const add = async () => {
    setBusy("add");
    setError(null);
    const mediaUrl = link === "storyboard" ? storyboardUrl : link === "clip" ? clipUrl : null;
    const result = await addSequenceNoteAction({ sceneId, kind, body, mediaUrl });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBody("");
    setLink("none");
    await reload();
  };

  const setStatus = async (note: SequenceNote, status: "open" | "resolved") => {
    setBusy(note.id);
    setError(null);
    const result = await setSequenceNoteStatusAction(note.id, status);
    setBusy(null);
    if (!result.ok) setError(result.error);
    await reload();
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Issues &amp; notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive">{query.error.message}</p>
        ) : !query.data?.available ? (
          <p className="text-sm text-muted-foreground">
            Run <code className="break-all text-xs">supabase/migrations/20261102000000_sequence_workspace.sql</code> in the Supabase SQL editor to record issues and notes.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Kind">
                {(["issue", "note"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={kind === value}
                    onClick={() => setKind(value)}
                    className={cn(
                      "rounded-[5px] px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      kind === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {value === "issue" ? "Issue" : "Note"}
                  </button>
                ))}
              </div>
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={kind === "issue" ? "What is wrong, e.g. beat 43 background glitches" : "A note about this sequence"}
                className="min-h-20 text-sm"
                aria-label={kind === "issue" ? "Describe the issue" : "Write a note"}
              />
              {(storyboardUrl || clipUrl) && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>About:</span>
                  {([["none", "Nothing specific"], ...(storyboardUrl ? [["storyboard", "Storyboard in use"]] : []), ...(clipUrl ? [["clip", "Clip in use"]] : [])] as [Link, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={link === value}
                      onClick={() => setLink(value)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                        link === value ? "border-primary text-foreground" : "border-border hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <Button size="sm" onClick={add} disabled={busy === "add" || !body.trim()}>
                {busy === "add" ? <Loader2 className="animate-spin" /> : kind === "issue" ? <CircleDot /> : <StickyNote />}
                Add {kind}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No issues or notes yet.</p>
            ) : (
              <ul className="space-y-2">
                {[...open, ...resolved].map((note) => (
                  <li key={note.id} className={cn("space-y-1.5 rounded-lg border border-border p-3", note.status === "resolved" && "opacity-60")}>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {note.kind === "issue"
                        ? <Badge variant={note.status === "open" ? "destructive" : "outline"}>{note.status === "open" ? "Issue" : "Resolved"}</Badge>
                        : <Badge variant="outline">Note</Badge>}
                      <span className="flex items-center gap-1">
                        {note.author === "claude" ? <Bot className="size-3" /> : <User className="size-3" />}
                        {note.author === "claude" ? "Claude" : "Team"}
                      </span>
                      <span>· {formatWhen(note.created_at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
                    {note.media_url && (
                      <a href={note.media_url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                        Open the take it is about
                      </a>
                    )}
                    {note.kind === "issue" && (
                      <div>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="-ml-2"
                          disabled={busy === note.id}
                          onClick={() => setStatus(note, note.status === "open" ? "resolved" : "open")}
                        >
                          {busy === note.id ? <Loader2 className="animate-spin" /> : note.status === "open" ? <CheckCircle2 /> : <RotateCcw />}
                          {note.status === "open" ? "Resolve" : "Reopen"}
                        </Button>
                      </div>
                    )}
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
