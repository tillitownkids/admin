"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, Loader2, ScanSearch, Sparkles } from "lucide-react";

import { detectEpisodeObjectsAction } from "@/actions/propsAction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Reference {
  id: string;
  name: string;
  hasReference: boolean;
  /** An episode object the detection agent expects to return in later episodes. */
  suggestPermanent?: boolean;
}

function ReferenceList({ label, href, items, action }: { label: string; href: string; items: Reference[]; action?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {label} · <Link href={href} className="underline underline-offset-4 hover:text-foreground">open library</Link>
        </div>
        {action}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None linked to this episode.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge
              key={item.id}
              variant={item.hasReference ? "outline" : "destructive"}
              title={[
                item.hasReference ? null : "No reference sheet yet",
                item.suggestPermanent ? "Likely to return: consider making it permanent in Objects" : null,
              ].filter(Boolean).join(". ") || undefined}
            >
              {!item.hasReference && <AlertTriangle />}
              {item.name}
              {item.suggestPermanent && <span className="text-muted-foreground">· recurring?</span>}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The episode's cast, locations and objects, out of the way until asked for. Missing reference sheets
 * are called out because they block image and video generation.
 */
export function EpisodeReferences({
  storyId,
  characters,
  locations,
  objects,
}: {
  storyId: string;
  characters: Reference[];
  locations: Reference[];
  objects: Reference[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"find" | "sheets" | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const missing = [...characters, ...locations, ...objects].filter((item) => !item.hasReference).length;
  const objectsWithoutSheet = objects.filter((item) => !item.hasReference);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

  const findObjects = async () => {
    setBusy("find");
    setMessage(null);
    try {
      const result = await detectEpisodeObjectsAction(storyId);
      if (!result.ok) throw new Error(result.error);
      const found = result.linked.length + result.created.length;
      setMessage({
        error: false,
        text: found === 0
          ? "No objects in this story need a reference sheet."
          : [
              result.created.length ? `New: ${result.created.join(", ")}.` : null,
              result.linked.length ? `From the library: ${result.linked.join(", ")}.` : null,
            ].filter(Boolean).join(" "),
      });
      router.refresh();
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Objects could not be found." });
    } finally {
      setBusy(null);
    }
  };

  const generateSheets = async () => {
    setBusy("sheets");
    setMessage(null);
    try {
      const res = await fetch("/api/references/generate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propIds: objectsWithoutSheet.map((item) => item.id) }),
      });
      const data = await res.json().catch(() => ({}));
      const failed: { error?: string }[] = Array.isArray(data.failed) ? data.failed : [];
      if (!res.ok && failed.length === 0) throw new Error(data.error || `The sheets could not be generated (HTTP ${res.status}).`);
      setMessage(failed.length
        ? { error: true, text: `Some sheets failed: ${failed.map((item) => item.error).join("; ")}` }
        : { error: false, text: `${plural(objectsWithoutSheet.length, "object sheet")} generated.` });
      router.refresh();
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "The sheets could not be generated." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button variant="ghost" size="sm" className="group/trigger -ml-2 text-muted-foreground">
            {plural(characters.length, "character")}, {plural(locations.length, "location")}, {plural(objects.length, "object")}
            {missing > 0 && (
              <Badge variant="destructive">
                <AlertTriangle />
                {missing} without a reference sheet
              </Badge>
            )}
            <ChevronDown className="transition-transform group-data-[panel-open]/trigger:rotate-180" />
          </Button>
        }
      />
      <CollapsibleContent>
        <div className="mt-2 space-y-4 rounded-lg border border-border p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <ReferenceList label="Characters" href="/characters" items={characters} />
            <ReferenceList label="Locations" href="/locations" items={locations} />
            <ReferenceList
              label="Objects"
              href="/objects"
              items={objects}
              action={
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="xs" onClick={findObjects} disabled={busy !== null} title="Read the story and link or create the objects it needs">
                    {busy === "find" ? <Loader2 className="animate-spin" /> : <ScanSearch />}
                    Find objects
                  </Button>
                  {objectsWithoutSheet.length > 0 && (
                    <Button variant="ghost" size="xs" onClick={generateSheets} disabled={busy !== null} title="Generate a reference sheet for each object that has none (uses image credits)">
                      {busy === "sheets" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                      Generate {objectsWithoutSheet.length} sheet{objectsWithoutSheet.length === 1 ? "" : "s"}
                    </Button>
                  )}
                </div>
              }
            />
          </div>
          {message && (
            <p role="status" className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {message.text}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
