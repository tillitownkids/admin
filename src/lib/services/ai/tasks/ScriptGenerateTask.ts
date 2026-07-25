import { BaseAITask } from '../BaseAITask';

export interface ScriptGenerateInput {
  topic: string;
  audience: string;
  tone: string;
  instructions: string;
  generationType: string;
  featuredCharacters?: { name: string; description: string }[];
  previousEpisodeSummary?: string;
}

export class ScriptGenerateTask extends BaseAITask {
  buildPrompt(input: ScriptGenerateInput): string {
    const isContinuing = input.generationType === 'continue';
    const actionText = isContinuing
      ? `Continue the ongoing story seamlessly based on the provided instructions and previous text.`
      : `Create a complete, engaging, and age-appropriate new story based on the following details:`;

    const charactersBlock = input.featuredCharacters?.length
      ? `\n- **Featured Characters** (keep their portrayal consistent with these descriptions):\n${input.featuredCharacters
          .map((c) => `  - ${c.name}: ${c.description}`)
          .join('\n')}`
      : '';

    const previousEpisodeBlock = input.previousEpisodeSummary
      ? `\n- **Previous Episode Context** (for continuity — do not repeat it, build on it): ${input.previousEpisodeSummary}`
      : '';

    return `You are a professional story writer for the TilliTown universe.
${actionText}

- **Story Idea / Topic**: ${input.topic}
- **Target Audience**: ${input.audience}
- **Tone**: ${input.tone}
${input.instructions ? `- **Additional Context / Existing Story**: ${input.instructions}` : ''}${charactersBlock}${previousEpisodeBlock}

Please structure the script exactly in the following format, broken down into beats (location-wise):

<p><strong>INT/EXT — [LOCATION] — [TIME] — [Brief notes]</strong></p>

<p></p>
<h3>BEAT 1 — [Beat Title]</h3>
<p></p>
<p><strong>[ACTION]</strong> [Description of the action]</p>
<p><strong>[CAMERA]</strong> [Description of camera angle/movement]</p>
<p><strong>[MOTION]</strong> [Description of motion/animation]</p>
<p><strong>[SFX]</strong> [Sound effects and audio notes]</p>

Format the entire response using clean, valid semantic HTML tags (such as <h3> for Beats, <p> for descriptions, <strong> for tags like [ACTION], etc.) so it renders beautifully in a rich text editor. 
Ensure that EVERY scene is broken down into these specific location-wise beats, with no dialogue unless specified. Let sound design and visual descriptions carry the sequence where appropriate.
Do NOT wrap the HTML code in markdown code blocks (\`\`\`html) - return the raw HTML code directly. Do not include any preamble, introduction, or explanations outside the script content.`;
  }

  async execute(input: ScriptGenerateInput): Promise<string> {
    const prompt = this.buildPrompt(input);
    const responseText = await this.bedrockService.invokeModel(prompt);
    
    // Clean response in case the model returns markdown code block wraps
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```html')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    return cleaned.trim();
  }
}
