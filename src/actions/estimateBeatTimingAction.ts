"use server";

import { aiService } from '@/services/aiService';
import { parseScriptBeats } from '@/lib/sceneShots';
import { parseStoryboardJson } from '@/lib/storyboardGeneration';
import { buildBeatTimingPrompt, resolveBeatTimings, runtimeSeconds, type EpisodeTiming } from '@/lib/sceneTiming';

/** The timing agent: how long each beat of the script needs on screen, and the episode's runtime. */
export async function estimateBeatTimingAction(script: string): Promise<EpisodeTiming> {
  const beats = parseScriptBeats(script);
  if (!beats.length) return { timings: [], runtimeSeconds: 0 };

  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await aiService.call(buildBeatTimingPrompt(beats), 8000);
      const timings = resolveBeatTimings(beats, parseStoryboardJson(response.text || ''));
      // An answer that times almost nothing is a failed answer, not a timing.
      if (timings.filter((timing) => timing.estimated).length < beats.length / 2) {
        throw new Error('The timing agent left most beats without a length.');
      }
      return { timings, runtimeSeconds: runtimeSeconds(timings) };
    } catch (error) {
      failure = error;
    }
  }
  // Storyboarding still works without the agent: every beat is timed by its dialogue alone.
  const timings = resolveBeatTimings(beats, null);
  return {
    timings,
    runtimeSeconds: runtimeSeconds(timings),
    agentError: failure instanceof Error ? failure.message : 'The timing agent failed.',
  };
}
