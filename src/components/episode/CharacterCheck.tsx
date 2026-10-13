"use client";

import { useState } from "react";
import { AlertTriangle, Check, ImageIcon, Loader2, UserCheck, Wrench } from "lucide-react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  checkSceneCharactersAction,
  completeEpisodeCastAction,
  listCharacterCheckScenesAction,
  planEpisodeCastReadAction,
  readEpisodeCastBatchAction,
  type CastCompletion,
  type SceneCharacterReport,
} from "@/actions/characterCheckAction";
import type { BeatCast, Whereabouts } from "@/lib/characterContinuity";

/** Scenes checked at the same time. Each check makes one to a few AI calls. */
const PARALLEL_SCENES = 2;

/**
 * Reads the whole episode in order, one batch of a handful of beats per call. Who is where after each
 * batch is passed to the next, so a character placed long ago and not mentioned since stays known.
 * Each batch is its own request, which keeps every call well inside the server time limit.
 */
async function readEpisodeCast(storyId: string, onBatch?: (done: number, total: number) => void): Promise<Record<string, BeatCast[]>> {
  const { batches } = await planEpisodeCastReadAction(storyId);
  const byScene: Record<string, BeatCast[]> = {};
  let whereabouts: Whereabouts[] = [];
  onBatch?.(0, batches.length);
  for (const [index, batch] of batches.entries()) {
    const read = await readEpisodeCastBatchAction(storyId, batch, whereabouts).catch(() => null);
    if (read) {
      Object.assign(byScene, read.byScene);
      whereabouts = read.whereabouts;
    }
    onBatch?.(index + 1, batches.length);
  }
  return byScene;
}

/**
 * Runs the character check over every scene of the episode, a few at a time, and returns one
 * report per scene in scene order. With `fix`, each scene is repaired in rounds on the server.
 */
export async function runCharacterCheck(
  storyId: string,
  options: {
    fix: boolean;
    onProgress?: (done: number, total: number) => void;
    /** Called as the episode is read, batch by batch. */
    onReading?: (done: number, total: number) => void;
    /** Called before characters outside the episode's cast are attached or created. */
    onCompletingCast?: (names: string[]) => void;
    /** What completing the cast did; null when it failed. */
    onCastCompleted?: (completion: CastCompletion | null) => void;
  },
): Promise<SceneCharacterReport[]> {
  // First the agent reads the whole episode in order, so it knows who is present in every scene.
  const [scenes, firstRead] = await Promise.all([
    listCharacterCheckScenesAction(storyId),
    readEpisodeCast(storyId, options.onReading).catch(() => null),
  ]);
  let episodeCast = firstRead;

  // Characters on screen but outside the episode's cast are brought in, from the library or newly
  // created with a sheet, then the episode is read again so every scene counts them.
  const outsideCast = Array.from(new Set(Object.values(episodeCast || {}).flat().flatMap((beat) => beat.notInCast)));
  if (options.fix && outsideCast.length) {
    options.onCompletingCast?.(outsideCast);
    const completion = await completeEpisodeCastAction(storyId, outsideCast).catch(() => null);
    options.onCastCompleted?.(completion);
    if (completion && (completion.attached.length || completion.created.length)) {
      episodeCast = await readEpisodeCast(storyId, options.onReading).catch(() => episodeCast);
    }
  }
  const reports: SceneCharacterReport[] = new Array(scenes.length);
  let next = 0;
  let done = 0;
  options.onProgress?.(0, scenes.length);
  await Promise.all(Array.from({ length: Math.min(PARALLEL_SCENES, scenes.length) }, async () => {
    while (next < scenes.length) {
      const index = next++;
      try {
        // A scene the episode read missed is read on its own.
        reports[index] = await checkSceneCharactersAction(scenes[index].id, {
          fix: options.fix,
          beats: episodeCast?.[scenes[index].id],
        });
      } catch (error) {
        reports[index] = {
          sceneId: scenes[index].id, sceneNumber: scenes[index].sceneNumber, ok: false,
          error: error instanceof Error ? error.message : "The scene could not be checked.",
          beats: [], found: [], fixed: [], remaining: [], warnings: [],
        };
      }
      options.onProgress?.(++done, scenes.length);
    }
  }));
  return reports;
}

/** One line on how the whole run went. */
export function summarizeCharacterCheck(reports: SceneCharacterReport[]): { clean: boolean; text: string } {
  const failed = reports.filter((report) => !report.ok).length;
  const fixed = reports.filter((report) => report.fixed.length > 0).length;
  const remaining = reports.filter((report) => report.remaining.length > 0).length;
  const warned = reports.filter((report) => report.warnings.length > 0).length;
  const parts = [
    fixed ? `fixed ${fixed} scene${fixed === 1 ? "" : "s"}` : "",
    remaining ? `${remaining} still ${remaining === 1 ? "has" : "have"} problems` : "",
    warned ? `${warned} need${warned === 1 ? "s" : ""} your attention` : "",
    failed ? `${failed} could not be checked` : "",
  ].filter(Boolean);
  if (!parts.length) {
    return {
      clean: true,
      text: reports.length === 1
        ? "The scene attaches and names every character its script shows."
        : `All ${reports.length} scenes attach and name every character their script shows.`,
    };
  }
  const text = parts.join(", ");
  return { clean: !remaining && !failed && !warned, text: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` };
}

/** The reports worth showing: scenes that were fixed, still have problems, need a person, or failed. */
export function CharacterCheckReports({ reports }: { reports: SceneCharacterReport[] }) {
  const shown = reports.filter((report) => !report.ok || report.fixed.length || report.remaining.length || report.warnings.length);
  if (!shown.length) return null;
  return (
    <ul className="divide-y divide-border border-y border-border">
      {shown.map((report) => (
        <li key={report.sceneId} className="space-y-1.5 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">Scene {report.sceneNumber}</span>
            {!report.ok ? (
              <Badge variant="destructive">Not checked</Badge>
            ) : report.remaining.length ? (
              <Badge variant="destructive">Problems left</Badge>
            ) : report.fixed.length ? (
              <Badge variant="secondary">Fixed</Badge>
            ) : (
              <Badge variant="outline">Check</Badge>
            )}
            {report.beats.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {report.beats.map((beat) => `Beat ${beat.beat}: ${beat.onScreen.length ? beat.onScreen.join(", ") : "no cast"}`).join(" · ")}
              </span>
            )}
          </div>
          {report.error && <p className="text-destructive">{report.error}</p>}
          {report.fixed.map((line) => (
            <p key={line} className="flex items-start gap-1.5 text-muted-foreground">
              <Check className="mt-0.5 size-3.5 shrink-0" />
              {line}
            </p>
          ))}
          {report.remaining.map((line) => (
            <p key={line} className="flex items-start gap-1.5 text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {line}
            </p>
          ))}
          {report.warnings.map((line) => (
            <p key={line} className="flex items-start gap-1.5 text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {line}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}

/**
 * The character check for an episode: an agent reads every scene's beats, finds who is on screen,
 * and makes sure each of them is attached to the scene and named in its storyboard and video prompts.
 */
export function CharacterCheck({
  storyId,
  initialReports = null,
  onChanged,
  onRegenerateImages,
}: {
  storyId: string;
  /** A check that already ran, such as the one right after planning. */
  initialReports?: SceneCharacterReport[] | null;
  onChanged?: () => void | Promise<void>;
  /** Generates new storyboard images for these scenes and puts them in use. Offered when given. */
  onRegenerateImages?: (sceneIds: string[]) => void;
}) {
  const [progress, setProgress] = useState<string | null>(null);
  const [reports, setReports] = useState<SceneCharacterReport[] | null>(initialReports);
  const [castCompletion, setCastCompletion] = useState<CastCompletion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setReports(null);
    setCastCompletion(null);
    // Read below in this same run, so it is kept here rather than read back from state.
    let completion: CastCompletion | null = null;
    try {
      const result = await runCharacterCheck(storyId, {
        fix: true,
        onReading: (done, total) => setProgress(`Reading the episode to see who is where (${done} of ${total} parts)…`),
        onCompletingCast: (names) => setProgress(`Adding ${names.join(", ")} to the episode's characters…`),
        onCastCompleted: (result) => {
          completion = result;
          setCastCompletion(result);
        },
        onProgress: (done, total) => setProgress(`Checked ${done} of ${total} scenes…`),
      });
      setReports(result);
      const castChanged = Boolean(completion && ((completion as CastCompletion).attached.length || (completion as CastCompletion).created.length));
      if (castChanged || result.some((report) => report.fixed.length > 0)) await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The character check could not run.");
    } finally {
      setProgress(null);
    }
  };

  const summary = reports ? summarizeCharacterCheck(reports) : null;
  const outdatedImages = (reports || []).filter((report) => report.imageOutdated).map((report) => report.sceneId);
  const castLines = castCompletion
    ? [
        castCompletion.attached.length ? `Added from the character library: ${castCompletion.attached.join(", ")}.` : null,
        castCompletion.created.length ? `Created as new characters, each with a reference sheet: ${castCompletion.created.join(", ")}.` : null,
        castCompletion.skipped.length ? `Left out (not one specific character): ${castCompletion.skipped.join(", ")}.` : null,
      ].filter((line): line is string => Boolean(line))
    : [];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="size-4" />
          Character check
        </CardTitle>
        <CardDescription>
          Reads the episode in order, works out who each shot shows (not everyone in the episode), and makes sure each of them is attached, named and placed in frame in the storyboard panel and video shot.
        </CardDescription>
        <CardAction>
          <ConfirmButton
            variant="outline"
            size="sm"
            disabled={Boolean(progress)}
            title="Check and fix every scene's characters?"
            description="An agent reads the episode in order and decides who each shot shows. Characters on screen but missing from the episode are added from the character library, or created with a reference sheet if they are new (this uses image credits). Characters it finds are attached to the scene, missing names and positions are written into the storyboard prompt, and video shots that leave someone out or unplaced are planned again (their clips are kept). Nothing is removed. This makes a few AI calls per scene."
            confirmLabel="Check characters"
            onConfirm={run}
          >
            {progress ? <Loader2 className="animate-spin" /> : <Wrench />}
            Check characters
          </ConfirmButton>
        </CardAction>
      </CardHeader>
      {(progress || error || reports) && (
        <CardContent className="space-y-3">
          {progress && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" />
              {progress}
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {summary && (
            <Alert variant={summary.clean ? "default" : "destructive"}>
              {summary.clean ? <Check /> : <AlertTriangle />}
              <AlertTitle>{summary.clean ? "Every character is in place" : "Character check finished"}</AlertTitle>
              <AlertDescription>{summary.text}</AlertDescription>
            </Alert>
          )}
          {castLines.map((line) => (
            <p key={line} className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <Check className="mt-0.5 size-3.5 shrink-0" />
              {line}
            </p>
          ))}
          {castCompletion?.sheetErrors.map((line) => (
            <p key={line} className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {line} Generate the sheet in Characters before making images for its scenes.
            </p>
          ))}
          {onRegenerateImages && outdatedImages.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
              <p className="text-sm text-muted-foreground">
                {outdatedImages.length} storyboard image{outdatedImages.length === 1 ? " was" : "s were"} made before these fixes.
              </p>
              <ConfirmButton
                size="sm"
                title={`Generate ${outdatedImages.length} new storyboard image${outdatedImages.length === 1 ? "" : "s"}?`}
                description="Each fixed scene gets a new image from its corrected prompt and characters, and the new image is put in use. Earlier images are kept as takes. Each image spends image credits."
                confirmLabel="Generate images"
                onConfirm={() => onRegenerateImages(outdatedImages)}
              >
                <ImageIcon />
                Update {outdatedImages.length} image{outdatedImages.length === 1 ? "" : "s"}
              </ConfirmButton>
            </div>
          )}
          {reports && <CharacterCheckReports reports={reports} />}
        </CardContent>
      )}
    </Card>
  );
}
