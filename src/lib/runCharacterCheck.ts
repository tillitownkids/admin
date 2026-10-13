// The character check, run silently after the storyboard is planned: an agent reads the episode in
// order, works out who each shot shows, and attaches, names and places them in every scene's prompt.
// Runs in the browser so each step is its own request, well inside the server time limit.

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
