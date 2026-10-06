"use server";

import { aiService } from '@/services/aiService';
import { mapWithConcurrency, parseStoryboardJson } from '@/lib/storyboardGeneration';
import {
  buildShotDirectionPrompt,
  buildShotPlan,
  sceneBeats,
  validateShotDirection,
  type SceneShotPlan,
  type ShotSceneContext,
} from '@/lib/sceneShots';

export type ShotPlanResult = { ok: true; plan: SceneShotPlan } | { ok: false; error: string };

export async function planSceneShotsAction(
  scenes: (ShotSceneContext & { previousPlan?: SceneShotPlan | null })[]
): Promise<ShotPlanResult[]> {
  // Scenes are independent, so one failed plan is reported for its scene instead of discarding the rest.
  return mapWithConcurrency(scenes, 3, async (scene): Promise<ShotPlanResult> => {
    let failure: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await aiService.call(buildShotDirectionPrompt(scene), 4000);
        const direction = validateShotDirection(parseStoryboardJson(response.text || ''), sceneBeats(scene));
        return { ok: true, plan: buildShotPlan(scene, direction, scene.previousPlan) };
      } catch (error) {
        failure = error;
      }
    }
    return { ok: false, error: failure instanceof Error ? failure.message : 'Shot planning failed.' };
  });
}
