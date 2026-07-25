import { BaseAITask } from '../BaseAITask';

export interface SceneDetectInput {
  locationName: string;
  storyExcerpt: string;
}

export interface DetectedScene {
  scene_number: number;
  description: string;
  order_index: number;
}

export class SceneDetectTask extends BaseAITask {
  buildPrompt(input: SceneDetectInput): string {
    return `You are a storyboard artist breaking down the portion of an animated kids' episode that happens at one location into individual scenes/shots.

Location: ${input.locationName}
Story content at this location:
"""
${input.storyExcerpt}
"""

Split this into a sequence of distinct scenes (a scene = one continuous beat of action worth its own storyboard panel), in order.

You MUST return your response ONLY as a valid JSON array of objects. Do NOT include any preamble, explanation, or markdown code blocks — return raw JSON only.
CRITICAL: Escape all newlines (\\n) and double quotes (\\") inside string values. Do not output actual unescaped line breaks inside the strings.

Each object must have this structure:
{
  "scene_number": <number, starting at 1>,
  "description": "<what happens in this scene: who's present, what they do, key visual/action beats>",
  "order_index": <number, same as scene_number - 1>
}`;
  }

  async execute(input: SceneDetectInput): Promise<DetectedScene[]> {
    const prompt = this.buildPrompt(input);
    const responseText = await this.bedrockService.invokeModel(prompt);

    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.replace(/[\n\r\t]/g, ' ').trim();

    return JSON.parse(cleaned);
  }
}
