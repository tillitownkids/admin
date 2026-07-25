import { BaseAITask } from '../BaseAITask';

export interface LocationDetectInput {
  storyContent: string;
}

export interface DetectedLocation {
  name: string;
  description: string;
  story_excerpt: string;
  order_index: number;
}

export class LocationDetectTask extends BaseAITask {
  buildPrompt(input: LocationDetectInput): string {
    return `You are a production designer breaking an animated kids' episode script down into its distinct locations.

Read the following episode story/script and identify every distinct physical location the story takes place in, in the order they first appear.

Episode content:
"""
${input.storyContent}
"""

You MUST return your response ONLY as a valid JSON array of objects. Do NOT include any preamble, explanation, or markdown code blocks — return raw JSON only.
CRITICAL: Escape all newlines (\\n) and double quotes (\\") inside string values. Do not output actual unescaped line breaks inside the strings.

Each object must have this structure:
{
  "name": "<short location name, e.g. 'Candy Forest'>",
  "description": "<1-2 sentence visual description of what this location looks like>",
  "story_excerpt": "<the portion(s) of the episode content that take place in this location, concatenated>",
  "order_index": <number, position of first appearance starting at 0>
}`;
  }

  async execute(input: LocationDetectInput): Promise<DetectedLocation[]> {
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
