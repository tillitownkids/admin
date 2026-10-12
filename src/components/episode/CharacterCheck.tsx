"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, UserCheck, Wrench } from "lucide-react";

import { ConfirmButton } from "@/components/ConfirmButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  checkSceneCharactersAction,
  detectEpisodeCastAction,
  listCharacterCheckScenesAction,
  type SceneCharacterReport,
} from "@/actions/characterCheckAction";

/** Scenes checked at the same time. Each check makes one to a few AI calls. */
const PARALLEL_SCENES = 2;

/**
 * Runs the character check over every scene of the episode, a few at a time, and returns one
 * report per scene in scene order. With `fix`, each scene is repaired in rounds on the server.
 */
export async function runCharacterCheck(
  storyId: string,
  options: { fix: boolean; onProgress?: (done: number, total: number) => void; onReading?: () => void },
): Promise<SceneCharacterReport[]> {
  // First the agent reads the whole episode in order, so it knows who is present in every scene.
  options.onReading?.();
  const [scenes, episodeCast] = await Promise.all([
    listCharacterCheckScenesAction(storyId),
    detectEpisodeCastAction(storyId).catch(() => null),
  ]);
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
          beats: episodeCast?.byScene[scenes[index].id],
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
}: {
  storyId: string;
  /** A check that already ran, such as the one right after planning. */
  initialReports?: SceneCharacterReport[] | null;
  onChanged?: () => void | Promise<void>;
}) {
  const [progress, setProgress] = useState<string | null>(null);
  const [reports, setReports] = useState<SceneCharacterReport[] | null>(initialReports);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setReports(null);
    try {
      const result = await runCharacterCheck(storyId, {
        fix: true,
        onReading: () => setProgress("Reading the episode to see who is present in each scene…"),
        onProgress: (done, total) => setProgress(`Checked ${done} of ${total} scenes…`),
      });
      setReports(result);
      if (result.some((report) => report.fixed.length > 0)) await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The character check could not run.");
    } finally {
      setProgress(null);
    }
  };

  const summary = reports ? summarizeCharacterCheck(reports) : null;

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
            description="An agent reads the episode in order and decides who each shot shows. Characters it finds are attached to the scene, missing names and positions are written into the storyboard prompt, and video shots that leave someone out or unplaced are planned again (their clips are kept). Nothing is removed, and no images or clips are generated. This makes a few AI calls per scene."
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
          {reports && <CharacterCheckReports reports={reports} />}
        </CardContent>
      )}
    </Card>
  );
}
