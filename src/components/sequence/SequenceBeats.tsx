"use client";

import { useState } from "react";
import { AlertTriangle, Check, Clock, Loader2, MessageSquareQuote, Pencil, Video } from "lucide-react";

import { saveSequenceBeatsAction } from "@/actions/sequenceAction";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { planShotTiming, sceneBeats } from "@/lib/sceneShots";
import type { SceneRow } from "@/components/episode-production/types";
import { beatNumbersOf } from "@/components/sequence/sequenceFormat";

/** A sequence's beats, read as cards, edited as the script text they come from. */
export function SequenceBeats({ scene, onSaved }: { scene: SceneRow; onSaved: () => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scene.script_beats || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const beats = sceneBeats({ scriptBeats: scene.script_beats || "", beatNumbers: beatNumbersOf(scene), description: scene.description || "" });

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const result = await saveSequenceBeatsAction(scene.id, draft);
    setSaving(false);
    if (!result.ok) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setEditing(false);
    setMessage({ type: "success", text: result.note || "Beats saved, and the episode script updated to match." });
    await onSaved();
  };

  return (
    <section className="space-y-3" aria-labelledby="sequence-beats">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="sequence-beats" className="text-base font-semibold text-foreground">Script</h3>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => { setDraft(scene.script_beats || ""); setEditing(true); setMessage(null); }}>
            <Pencil />
            Edit beats
          </Button>
        )}
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          {message.type === "error" ? <AlertTriangle /> : <Check />}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-[320px] font-mono text-xs leading-relaxed"
            aria-label="Beat script of this sequence"
          />
          <p className="text-xs text-muted-foreground">
            Keep each beat&apos;s header (&quot;### BEAT 12 — Title&quot;). Saving also updates these beats in the episode script; the clip plan is not changed until you plan the clip again.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving || !draft.trim()}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              Save beats
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      ) : (
        <ol className="space-y-2">
          {beats.map((beat, index) => {
            const timing = planShotTiming(beat);
            return (
              <li key={`${beat.number ?? "x"}-${index}`} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">Panel {index + 1} · Beat {beat.number ?? "?"}</span>
                    {beat.title || "Untitled beat"}
                  </p>
                  <span className={timing.overCap ? "flex items-center gap-1 text-xs text-destructive" : "flex items-center gap-1 text-xs text-muted-foreground"}>
                    <Clock className="size-3" />
                    {timing.seconds} s{timing.overCap ? " · over 8 s" : ""}
                  </span>
                </div>
                {beat.setting && <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{beat.setting}</p>}
                {beat.action && <p className="mt-2 text-sm text-foreground">{beat.action}</p>}
                {beat.dialogue && (
                  <p className="mt-2 flex gap-2 text-sm text-foreground">
                    <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>{beat.dialogue}</span>
                  </p>
                )}
                {beat.camera && (
                  <p className="mt-2 flex gap-2 text-xs text-muted-foreground">
                    <Video className="mt-0.5 size-3 shrink-0" />
                    <span>{beat.camera}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
