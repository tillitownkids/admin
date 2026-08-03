import { BaseAITask } from '../BaseAITask';

export interface AskInput {
  selectedText: string;
  userQuestion: string;
  isStoryEdit?: boolean;
}

export class AskTask extends BaseAITask {
  buildPrompt(input: AskInput): string {
    if (input.isStoryEdit || (input.selectedText && input.selectedText.length > 50)) {
      return `You are a creative director and editor for the children's animated show "Tilli & Jaksh".

Current Narrative Story:
"""
${input.selectedText}
"""

User Requested Changes:
"${input.userQuestion}"

Task:
Revise the story by seamlessly incorporating the requested changes into the narrative while maintaining the warm bedtime tone, character personalities, and world rules.

You MUST respond ONLY with a raw JSON object matching the following structure (no preamble, no markdown code block wraps):

{
  "summary": "A clear, bulleted list or 2-3 sentence overview summary of the specific updates made to the story (e.g. • Added dialogue between Tilli and Jaksh near the creek\\n• Updated narrative tone\\n• Updated Episode Recap)",
  "fullStory": "The complete, revised narrative bedtime story with all requested changes seamlessly merged into it. At the very end, MUST include:\\n\\n**Episode Recap**\\n[1-paragraph summary recap of this episode]"
}`;
    }

    if (input.userQuestion && input.userQuestion.trim() !== '') {
      return `Given this text: '${input.selectedText}', answer the following question: '${input.userQuestion}'`;
    }
    return `Explain, improve, or provide insight on this text: '${input.selectedText}'`;
  }

  async execute(input: AskInput): Promise<string> {
    const prompt = this.buildPrompt(input);
    const responseText = await this.bedrockService.invokeModel(prompt);
    
    if (input.isStoryEdit) {
      try {
        let cleanedJson = responseText.trim();
        if (cleanedJson.startsWith('```json')) {
          cleanedJson = cleanedJson.substring(7);
        } else if (cleanedJson.startsWith('```')) {
          cleanedJson = cleanedJson.substring(3);
        }
        if (cleanedJson.endsWith('```')) {
          cleanedJson = cleanedJson.substring(0, cleanedJson.length - 3);
        }

        const parsed = JSON.parse(cleanedJson.trim());
        if (parsed.fullStory && parsed.summary) {
          let story = parsed.fullStory.trim();
          if (!story.toLowerCase().includes('recap')) {
            story += `\n\n**Episode Recap**\nUpdated episode summary reflecting recent story changes.`;
          }
          return JSON.stringify({
            summary: parsed.summary,
            fullStory: story
          });
        }
      } catch (e) {
        console.warn("JSON parsing failed in AskTask story edit, falling back to structured object:", e);
      }

      // Fallback if AI didn't return valid JSON object
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
      }
      cleanedText = cleanedText.replace(/^(Here is the updated story|Here's the revised story|Sure! Here is the updated narrative story)[:\n\s]*/i, '');

      if (!cleanedText.toLowerCase().includes('recap')) {
        cleanedText += `\n\n**Episode Recap**\nUpdated episode summary reflecting recent story changes.`;
      }

      const autoSummary = `**Updates Made:**\n• Revised story content according to request: "${input.userQuestion}"\n• Preserved bedtime tone and episode recap.`;

      return JSON.stringify({
        summary: autoSummary,
        fullStory: cleanedText
      });
    }

    // Standard non-story-edit response
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
    }
    return cleaned.trim();
  }
}
