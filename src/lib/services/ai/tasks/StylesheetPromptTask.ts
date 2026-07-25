import { BaseAITask } from '../BaseAITask';

export interface StylesheetPromptInput {
  locationName: string;
  locationDescription: string;
  storyExcerpt: string;
}

export class StylesheetPromptTask extends BaseAITask {
  buildPrompt(input: StylesheetPromptInput): string {
    return `You are an art director writing an image-generation prompt for a location "stylesheet" reference image for a 3D-animated kids' show (TilliTown, ages 3-6).

Location name: ${input.locationName}
Location description: ${input.locationDescription}
Relevant story context: ${input.storyExcerpt}

Write a single, vivid, self-contained image-generation prompt (2-4 sentences) that describes this location as a wide establishing shot: environment, lighting/mood matching the story context above, color palette, art style ("soft, colorful, friendly 3D-animated children's show style"). Do not describe any characters — this is an empty environment reference.

Return ONLY the prompt text, no preamble, no labels, no markdown code blocks.`;
  }

  async execute(input: StylesheetPromptInput): Promise<string> {
    const prompt = this.buildPrompt(input);
    const responseText = await this.bedrockService.invokeModel(prompt);

    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\n?/, '');
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    return cleaned.trim();
  }
}
