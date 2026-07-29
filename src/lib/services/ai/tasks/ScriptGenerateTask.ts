import { BaseAITask } from '../BaseAITask';

export interface ScriptGenerateInput {
  topic: string;
  concept?: string;
  storyOverview?: string;
  teachLesson?: string;
  audience?: string;
  tone?: string;
  instructions?: string;
  generationType?: string;
  featuredCharacters?: { name: string; description: string }[];
  previousEpisodeSummary?: string;
}

export class ScriptGenerateTask extends BaseAITask {
  buildPrompt(input: ScriptGenerateInput): string {
    const isContinuing = input.generationType === 'continue';
    const actionText = isContinuing
      ? `Continue the ongoing story seamlessly based on the provided inputs and previous context.`
      : `Create a complete, engaging, structured script based on the following separate inputs:`;

    const topicBlock = `- **Topic / Title**: ${input.topic || 'Untitled'}`;
    const conceptBlock = `- **Concept**: ${input.concept || 'N/A'}`;
    const storyOverviewBlock = `- **Story Overview**: ${input.storyOverview || 'N/A'}`;
    const teachLessonBlock = `- **Lesson to Teach**: ${input.teachLesson || 'N/A'}`;

    return `You are a professional story writer for the TilliTown universe.
${actionText}

${topicBlock}
${conceptBlock}
${storyOverviewBlock}
${teachLessonBlock}
${input.audience ? `- **Target Audience**: ${input.audience}` : ''}
${input.tone ? `- **Tone**: ${input.tone}` : ''}
${input.instructions ? `- **Additional Instructions**: ${input.instructions}` : ''}

You MUST respond ONLY with a JSON object matching the following TypeScript interface (no markdown code blocks, no preamble, no commentary):

{
  "recap": "A short summary recap of the episode",
  "scenes": [
    {
      "sceneNumber": 1,
      "setting": "INT./EXT. LOCATION - DAY/NIGHT",
      "narration": "Setting the scene narration...",
      "dialogues": [
        {
          "character": "Character Name",
          "line": "Dialogue spoken by the character"
        }
      ]
    }
  ]
}

Ensure all scene numbers are sequential starting from 1. Return ONLY raw valid JSON.`;
  }

  async execute(input: ScriptGenerateInput): Promise<string> {
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
    cleaned = cleaned.trim();

    try {
      const parsed = JSON.parse(cleaned);
      return JSON.stringify(parsed);
    } catch (e) {
      console.warn("ScriptGenerateTask returned non-JSON, wrapping in fallback structure", e);
      return JSON.stringify({
        recap: input.topic || "Episode Recap",
        scenes: [
          {
            sceneNumber: 1,
            setting: "INT. TILLITOWN - DAY",
            narration: cleaned,
            dialogues: []
          }
        ]
      });
    }
  }
}
