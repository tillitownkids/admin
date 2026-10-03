"use server";

import { aiService } from '@/services/aiService';
import { mapWithConcurrency, parseStoryboardJson, validateSceneOutput } from '@/lib/storyboardGeneration';

export async function generateStoryboardBatchAction(sourceScript: string, requests: { prompt: string; beatNumbers: number[] }[]) {
  if (!sourceScript.trim() || !requests.length) throw new Error('Script and scene requests are required.');
  // One server action dispatches concurrent provider requests. Client-side server
  // actions can be queued; the shared script also needs to cross the network only once.
  return mapWithConcurrency(requests, 3, async (request, index) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await aiService.call(`${request.prompt}\n\n## FULL SOURCE BEAT SCRIPT (reference only; extract ONLY assigned beats)\n${sourceScript}`, 64000);
        return validateSceneOutput(parseStoryboardJson(response.text || ''), request.beatNumbers, sourceScript);
      } catch (error) {
        if (attempt === 1) throw new Error(`Scene ${index + 1} failed after two attempts. No storyboard was saved. ${error instanceof Error ? error.message : 'Unknown generation error.'}`);
      }
    }
    throw new Error('Scene generation failed.');
  });
}
