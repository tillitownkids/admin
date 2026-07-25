import { BaseAITask } from '../BaseAITask';

export interface BeatScriptInput {
  sceneDescription: string;
  storyboardPrompt: string;
}

export interface GeneratedBeat {
  beat_number: number;
  action: string;
  camera: string;
  motion: string;
  dialogue: string;
  sfx: string;
  order_index: number;
}

export class BeatScriptTask extends BaseAITask {
  buildPrompt(input: BeatScriptInput): string {
    return `You are a scriptwriter for a 3D-animated kids' show (TilliTown, ages 3-6), writing the shot-by-shot beat script for one storyboard scene.

Scene description: ${input.sceneDescription}
Storyboard shot: ${input.storyboardPrompt}

Break this scene into one or more sequential beats. Each beat needs all five fields filled in with age-appropriate, production-ready detail:
- action: what physically happens/what characters do
- camera: camera angle/movement (e.g. "Wide shot, static", "Slow push-in on character's face")
- motion: animation/motion notes (e.g. "Character bounces excitedly", "Leaves rustle in the wind")
- dialogue: spoken lines, in the format "CharacterName: line" (empty string "" if this beat has no dialogue)
- sfx: sound effects/audio notes (empty string "" if none)

You MUST return your response ONLY as a valid JSON array of objects. Do NOT include any preamble, explanation, or markdown code blocks — return raw JSON only.
CRITICAL: Escape all newlines (\\n) and double quotes (\\") inside string values. Do not output actual unescaped line breaks inside the strings.

Each object must have this structure:
{
  "beat_number": <number, starting at 1>,
  "action": "<string>",
  "camera": "<string>",
  "motion": "<string>",
  "dialogue": "<string, can be empty>",
  "sfx": "<string, can be empty>",
  "order_index": <number, same as beat_number - 1>
}`;
  }

  async execute(input: BeatScriptInput): Promise<GeneratedBeat[]> {
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
