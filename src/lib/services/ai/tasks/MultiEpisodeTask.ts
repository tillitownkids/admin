import { BaseAITask } from '../BaseAITask';

export interface MultiEpisodeGenerateInput {
  topic: string;
  audience: string;
  tone: string;
  instructions: string;
  episodeCount: number;
}

export class MultiEpisodeTask extends BaseAITask {
  buildPrompt(input: MultiEpisodeGenerateInput): string {
    return `You are a professional story writer for the TilliTown universe.
Create a multi-episode story arc consisting of exactly ${input.episodeCount} episodes based on the following details:

- **Story Idea / Topic**: ${input.topic}
- **Target Audience**: ${input.audience}
- **Tone**: ${input.tone}
${input.instructions ? `- **Additional Context**: ${input.instructions}` : ''}

You MUST return your response ONLY as a valid JSON array of objects, where each object represents one episode. Do NOT include any preamble, introduction, or explanations outside the JSON array. Do not use markdown blocks to wrap the JSON. Return raw JSON.
CRITICAL: The output MUST be valid JSON. You must escape all newlines (\\n) and double quotes (\\") inside the string values (especially in the "script" field). Do NOT output actual unescaped line breaks inside the strings.

Each episode object must have the following structure:
{
  "episodeNumber": <number>,
  "title": "<string, the title of the episode>",
  "synopsis": "<string, a brief 2-3 sentence summary of what happens in this episode>",
  "script": "<string, the complete script for this episode formatted using clean, valid semantic HTML tags. It MUST use the format: <p><strong>INT/EXT — [LOCATION] — [TIME]</strong></p> followed by Beats like <h3>BEAT 1</h3> <p><strong>[ACTION]</strong>...</p> <p><strong>[CAMERA]</strong>...</p> <p><strong>[MOTION]</strong>...</p> <p><strong>[SFX]</strong>...</p> for the entire script>"
}

Make sure the storyline flows logically from one episode to the next, building up a larger narrative arc across the ${input.episodeCount} episodes.
`;
  }

  async execute(input: MultiEpisodeGenerateInput): Promise<string> {
    const prompt = this.buildPrompt(input);
    const responseText = await this.bedrockService.invokeModel(prompt);
    
    // Clean response in case the model returns markdown code block wraps
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    
    // Strip actual control characters (newlines, tabs) which break JSON.parse()
    // Since the text is HTML, it will render correctly without raw newlines.
    cleaned = cleaned.replace(/[\n\r\t]/g, ' ');
    
    return cleaned.trim();
  }
}
