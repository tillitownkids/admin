"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";

import { listSequenceNotesAction } from "@/actions/sequenceAction";
import { useEpisodeScenes } from "@/components/episode/useEpisodeScenes";
import { beatNumbersOf, beatRange, castOf, hasClip, sequenceCode } from "@/components/sequence/sequenceFormat";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseShotPlan } from "@/lib/sceneShots";
import { formatRuntime, sceneRuntime } from "@/lib/sceneTiming";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import type { SceneRow } from "@/components/episode-production/types";

type Filter = "all" | "storyboard" | "clip" | "issues";

/** Every sequence of an episode at a glance: what it holds, what it still needs, and its open issues. */
export function SequenceTable({ storyId }: { storyId: string }) {
  const router = useRouter();
  const { scenes, isLoading, error } = useEpisodeScenes(storyId);
  const notesQuery = useQuery({
    queryKey: queryKeys.sequenceNotes(storyId),
    queryFn: async () => {
      const result = await listSequenceNotesAction({ storyId });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
  });
  const [filter, setFilter] = useState<Filter>("all");

  const openIssues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notesQuery.data?.notes || []) {
      if (note.kind === "issue" && note.status === "open") counts.set(note.scene_id, (counts.get(note.scene_id) || 0) + 1);
    }
    return counts;
  }, [notesQuery.data]);

  const sorted = useMemo(() => [...scenes].sort((a, b) => a.scene_number - b.scene_number), [scenes]);
  const matches: Record<Filter, (scene: SceneRow) => boolean> = {
    all: () => true,
    storyboard: (scene) => !scene.storyboard_image_url,
    clip: (scene) => !hasClip(scene),
    issues: (scene) => (openIssues.get(scene.id) || 0) > 0,
  };
  const visible = sorted.filter(matches[filter]);
  const totalSeconds = sorted.reduce((sum, scene) => sum + sceneRuntime(scene), 0);

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

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "storyboard", label: "Needs storyboard" },
    { key: "clip", label: "Needs clip" },
    { key: "issues", label: "Open issues" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-md border border-border p-0.5" role="group" aria-label="Show sequences">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-[5px] px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                filter === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              <span className="ml-1.5 tabular-nums text-muted-foreground">{sorted.filter(matches[key]).length}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {sorted.length} sequences · {formatRuntime(totalSeconds)}
        </p>
      </div>

      {notesQuery.data && !notesQuery.data.available && (
        <p className="text-xs text-muted-foreground">
          Issues and history appear once the sequence-workspace migration has been run in Supabase.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Seq</TableHead>
              <TableHead>Sequence</TableHead>
              <TableHead className="w-16 text-right">Length</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Cast</TableHead>
              <TableHead className="w-28">Storyboard</TableHead>
              <TableHead className="w-28">Clip</TableHead>
              <TableHead className="w-20 text-right">Issues</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  No sequences match this filter.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((scene) => {
                const href = `/episodes/${storyId}/sequences/${scene.scene_number}`;
                const issues = openIssues.get(scene.id) || 0;
                const planned = Boolean(parseShotPlan(scene.video_prompt));
                return (
                  <TableRow key={scene.id} className="cursor-pointer" onClick={() => router.push(href)}>
                    <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">{sequenceCode(scene.scene_number)}</TableCell>
                    <TableCell className="max-w-[280px]">
                      <Link href={href} className="block truncate font-medium text-foreground hover:underline" onClick={(event) => event.stopPropagation()}>
                        {scene.description || "Untitled"}
                      </Link>
                      <span className="text-xs text-muted-foreground">{beatRange(beatNumbersOf(scene))}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{sceneRuntime(scene)} s</TableCell>
                    <TableCell className="max-w-[160px] truncate text-muted-foreground">{scene.locationName || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground" title={castOf(scene).join(", ")}>
                      {castOf(scene).join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      {scene.storyboard_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={scene.storyboard_image_url} alt="" className="aspect-video w-20 rounded border border-border object-cover" />
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">None</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasClip(scene) ? <Badge variant="secondary">Clip in use</Badge>
                        : planned ? <Badge variant="outline">Planned</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">Not planned</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {issues > 0 ? <Badge variant="destructive">{issues}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
