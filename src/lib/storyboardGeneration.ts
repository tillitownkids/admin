export interface ScenePlan {
  scene_number: number;
  title: string;
  location_name: string;
  character_names: string[];
  beat_numbers: number[];
}

/** A scene is one storyboard sheet: a 2x2 grid with one panel per beat. */
export const MAX_BEATS_PER_SCENE = 4;

export function parseStoryboardJson(text: string): unknown {
  let json = text.trim();
  if (json.startsWith('```')) {
    const newline = json.indexOf('\n');
    if (newline < 0 || !json.endsWith('```')) throw new Error('Incomplete storyboard JSON response.');
    json = json.slice(newline + 1, -3).trim();
  }
  // Never repair truncated JSON into an apparently successful partial storyboard.
  return JSON.parse(json);
}

export function validateScenePlan(value: unknown): ScenePlan[] {
  const plan = value as { total_beats?: number; scenes?: ScenePlan[] } | null;
  if (!plan || !Number.isSafeInteger(plan.total_beats) || plan.total_beats! < 1 ||
      !Array.isArray(plan.scenes) || !plan.scenes.length) {
    throw new Error('Scene plan must contain total_beats and a nonempty scenes array.');
  }
  let nextBeat = 1;
  plan.scenes.forEach((scene, index) => {
    if (!scene || scene.scene_number !== index + 1 ||
        typeof scene.title !== 'string' || !scene.title.trim() ||
        typeof scene.location_name !== 'string' || !scene.location_name.trim() ||
        !Array.isArray(scene.character_names) || scene.character_names.some(name => typeof name !== 'string' || !name.trim()) ||
        !Array.isArray(scene.beat_numbers) || !scene.beat_numbers.length || scene.beat_numbers.length > MAX_BEATS_PER_SCENE) {
      throw new Error(`Invalid metadata or beat count for scene ${index + 1}.`);
    }
    for (const beat of scene.beat_numbers) {
      if (!Number.isSafeInteger(beat) || beat !== nextBeat) {
        throw new Error(`Missing, duplicated, or out-of-order beat near beat ${nextBeat}.`);
      }
      nextBeat++;
    }
  });
  if (nextBeat - 1 !== plan.total_beats) throw new Error('Scene plan does not cover its declared total beat count.');
  return plan.scenes;
}

export function validateSceneOutput(value: unknown, expectedBeats: number[], sourceScript?: string) {
  const scene = value as { beat_numbers?: number[]; scene_script_beats?: string; storyboard_prompt?: string } | null;
  if (!scene || !Array.isArray(scene.beat_numbers) ||
      scene.beat_numbers.length !== expectedBeats.length ||
      scene.beat_numbers.some((beat, index) => beat !== expectedBeats[index]) ||
      typeof scene.scene_script_beats !== 'string' || !scene.scene_script_beats.trim() ||
      typeof scene.storyboard_prompt !== 'string' || !scene.storyboard_prompt.trim()) {
    throw new Error('Scene response is missing its assigned beats, script text, or storyboard prompt.');
  }
  if (sourceScript !== undefined && !sourceScript.replaceAll('\r\n', '\n')
    .includes(scene.scene_script_beats.replaceAll('\r\n', '\n').trim())) {
    throw new Error('Scene beat text was rewritten or does not match a contiguous excerpt of the original script.');
  }
  return { scene_script_beats: scene.scene_script_beats, storyboard_prompt: scene.storyboard_prompt };
}

/** Wait for active workers to settle before surfacing an error; never return partial results. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid concurrency limit.');
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try { results[index] = await task(items[index], index); }
      catch (error) { if (!failed) failure = error; failed = true; }
    }
  }));
  if (failed) throw failure;
  return results;
}
