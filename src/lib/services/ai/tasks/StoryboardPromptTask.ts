import { BaseAITask } from '../BaseAITask';

export interface StoryboardPromptInput {
  sceneDescription: string;
  locationContext: string;
  characterNames: string[];
  characterDescriptions: string[];
}

export class StoryboardPromptTask extends BaseAITask {
  buildPrompt(input: StoryboardPromptInput): string {
    const charactersBlock = input.characterNames.length
      ? input.characterNames
          .map((name, i) => `- ${name}: ${input.characterDescriptions[i] || ''}`)
          .join('\n')
      : '(no named characters in this scene)';

    return `You are a storyboard artist writing an image-generation prompt for one storyboard panel of a 3D-animated kids' show (TilliTown, ages 3-6).

Location context: ${input.locationContext}
Scene description: ${input.sceneDescription}
Characters present:
${charactersBlock}

Write a single, vivid, self-contained image-generation prompt (2-4 sentences) describing this exact shot: composition/framing, character poses and expressions, action, and art style ("soft, colorful, friendly 3D-animated children's show style, consistent with the reference character images provided"). Reference images of the characters and location style will be attached separately alongside this prompt — describe the shot assuming the viewer already knows what the characters/location look like, don't re-describe their appearance in detail.

Return ONLY the prompt text, no preamble, no labels, no markdown code blocks.`;
  }

  async execute(input: StoryboardPromptInput): Promise<string> {
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
