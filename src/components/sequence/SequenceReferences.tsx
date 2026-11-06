"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, Check, Loader2, Map as MapIcon, Trash2, Upload, User } from "lucide-react";

import {
  deleteReferenceAction,
  finishReferenceUploadAction,
  listSequenceReferencesAction,
  setReferenceIdentifierAction,
  startReferenceUploadAction,
} from "@/actions/sequenceAction";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import type { ReferenceKind, SequenceReference } from "@/lib/sequenceReferences";

const KIND_LABELS: Record<ReferenceKind, string> = {
  camera_map: "Camera map",
  seating_map: "Seating map",
  reference: "Reference",
};

/**
 * A sequence's reference images: camera maps and seating maps made after its storyboard failed
 * several times. Claude usually adds them; they can also be uploaded here. Once one is in Magnific it
 * can be attached to the storyboard like a sheet.
 */
export function SequenceReferences({
  sceneId,
  sequenceCode,
  onChanged,
}: {
  sceneId: string;
  sequenceCode: string;
  onChanged?: () => Promise<void> | void;
}) {
  const query = useQuery({
    queryKey: queryKeys.sequenceReferences(sceneId),
    queryFn: async () => {
      const result = await listSequenceReferencesAction(sceneId);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ReferenceKind>("camera_map");
  const [label, setLabel] = useState(`${sequenceCode} camera map`);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [identifiers, setIdentifiers] = useState<Record<string, string>>({});

  const reload = async () => {
    await Promise.all([query.refetch(), onChanged?.()]);
  };

  const upload = async (file: File) => {
    setBusy("upload");
    setMessage(null);
    try {
      const start = await startReferenceUploadAction(sceneId, file.type, file.size);
      if (!start.ok) throw new Error(start.error);
      const { error } = await createClient().storage.from(start.bucket).uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
      if (error) throw new Error(`The image could not be uploaded: ${error.message}`);
      const finish = await finishReferenceUploadAction({ sceneId, path: start.path, label, kind });
      if (!finish.ok) throw new Error(finish.error);
      setMessage({ type: "success", text: `${finish.reference.label} saved. Add its Magnific identifier so it can be attached to a generation.` });
      await reload();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "The image could not be uploaded." });
    } finally {
      setBusy(null);
    }
  };

  const saveIdentifier = async (reference: SequenceReference) => {
    setBusy(reference.id);
    setMessage(null);
    const result = await setReferenceIdentifierAction(reference.id, identifiers[reference.id] || "");
    setBusy(null);
    if (!result.ok) setMessage({ type: "error", text: result.error });
    await reload();
  };

  const remove = async (reference: SequenceReference) => {
    setBusy(reference.id);
    setMessage(null);
    const result = await deleteReferenceAction(reference.id);
    setBusy(null);
    if (!result.ok) setMessage({ type: "error", text: result.error });
    await reload();
  };

  const references = query.data?.references || [];

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MapIcon className="size-3.5 text-muted-foreground" />
          Reference images
        </p>
        <span className="text-[11px] text-muted-foreground">Only when the storyboard keeps getting the layout wrong</span>
      </div>

      {query.isPending ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Loading…</p>
      ) : query.error ? (
        <p className="text-xs text-destructive">{query.error.message}</p>
      ) : !query.data?.available ? (
        <p className="text-xs text-muted-foreground">
          Run <code className="break-all">supabase/migrations/20261106000000_sequence_references.sql</code> in the Supabase SQL editor to keep camera maps here.
        </p>
      ) : (
        <>
          {references.length === 0 ? (
            <p className="text-xs text-muted-foreground">None. When this storyboard fails several times on layout, Claude can make a camera map from the location&apos;s master image, or you can upload one.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {references.map((reference) => (
                <li key={reference.id} className="space-y-1.5">
                  <a href={reference.image_url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={reference.image_url} alt={reference.label} className="aspect-video w-full object-cover" />
                  </a>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-medium text-foreground">{reference.label}</span>
                    <Badge variant="outline">{KIND_LABELS[reference.kind]}</Badge>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      {reference.author === "claude" ? <Bot className="size-3" /> : <User className="size-3" />}
                      {reference.author === "claude" ? "Claude" : "Team"}
                    </span>
                  </div>
                  {reference.magnific_identifier ? (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Check className="size-3" />In Magnific, ready to attach</p>
                  ) : (
                    <div className="flex gap-1.5">
                      <Input
                        value={identifiers[reference.id] || ""}
                        onChange={(event) => setIdentifiers((previous) => ({ ...previous, [reference.id]: event.target.value }))}
                        placeholder="Magnific identifier"
                        aria-label={`Magnific identifier of ${reference.label}`}
                        className="h-7 text-xs"
                      />
                      <Button size="xs" variant="outline" disabled={busy === reference.id || !(identifiers[reference.id] || "").trim()} onClick={() => saveIdentifier(reference)}>
                        Save
                      </Button>
                    </div>
                  )}
                  <ConfirmButton
                    variant="ghost"
                    size="xs"
                    className="-ml-2 text-muted-foreground"
                    disabled={busy === reference.id}
                    title={`Remove ${reference.label}?`}
                    description="The image is removed from the admin. Attachment lists that use it will show it as missing until they are changed."
                    confirmLabel="Remove"
                    destructive
                    onConfirm={() => remove(reference)}
                  >
                    <Trash2 />
                    Remove
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Kind">
              {(Object.keys(KIND_LABELS) as ReferenceKind[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => {
                    setKind(value);
                    setLabel(`${sequenceCode} ${KIND_LABELS[value].toLowerCase()}`);
                  }}
                  className={cn(
                    "rounded-[5px] px-2 py-0.5 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    kind === value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {KIND_LABELS[value]}
                </button>
              ))}
            </div>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} aria-label="Name of the reference image" className="h-7 w-48 text-xs" />
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) upload(file);
              }}
            />
            <Button size="xs" variant="outline" disabled={busy === "upload" || !label.trim()} onClick={() => fileRef.current?.click()}>
              {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />}
              Upload
            </Button>
          </div>
        </>
      )}

      {message && (
        <p className={cn("flex gap-1 text-xs", message.type === "error" ? "text-destructive" : "text-muted-foreground")}>
          {message.type === "error" ? <AlertTriangle className="mt-0.5 size-3 shrink-0" /> : <Check className="mt-0.5 size-3 shrink-0" />}
          {message.text}
        </p>
      )}
    </div>
  );
}
