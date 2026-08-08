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

FORMATTING REQUIREMENTS:
- Start the story with a clear heading:
  # **[Story Title]**

- At the very end of the story, you MUST include a dedicated episode recap section structured as:

### **Episode Recap**
**Summary:** [1-paragraph summary recap of this episode summarizing key events and outcome so it can be used to prepare future episodes.]

You MUST respond ONLY with a raw JSON object matching the following structure (no preamble, no markdown code block wraps):

{
  "summary": "**Updates Made:**\\n• [Concise summary of updates made]",
  "fullStory": "The complete, revised narrative bedtime story incorporating all changes and ending with the mandatory Episode Recap section."
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
      const parsedResult = this.parseAiResponse(responseText, input.userQuestion);
      return JSON.stringify(parsedResult);
    }

    // Standard non-story-edit response
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
    }
    return cleaned.trim();
  }

  private parseAiResponse(responseText: string, userQuestion?: string): { summary: string; fullStory: string } {
    let cleaned = responseText.trim();

    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    // 1. Try standard JSON parsing
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && (parsed.fullStory || parsed.summary)) {
          let story = (parsed.fullStory || parsed.summary || '').trim();
          if (!story.toLowerCase().includes('recap')) {
            story += `\n\n### **Episode Recap**\n**Summary:** Updated episode summary reflecting recent story changes.`;
          }
          return {
            summary: parsed.summary || '**Updates Made:**\n• Revised story content as requested.',
            fullStory: story
          };
        }
      }
    } catch (e) {
      console.warn("JSON.parse failed in AskTask, running regex extraction fallback:", e);
    }

    // 2. Extract "fullStory" using robust regex (handles missing commas, unescaped quotes/newlines)
    let fullStory = '';
    let summary = '';

    const fullStoryRegex = /"fullStory"\s*:\s*"([\s\S]*)/i;
    const fullStoryMatch = cleaned.match(fullStoryRegex);

    if (fullStoryMatch && fullStoryMatch[1]) {
      let rawStory = fullStoryMatch[1].trim();
      rawStory = rawStory.replace(/"\s*\}\s*$/g, '').trim();

      fullStory = rawStory
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '\t');
    }

    const summaryRegex = /"summary"\s*:\s*"([\s\S]*?)"\s*(?:,|\n|\r)*\s*"fullStory"/i;
    const summaryMatch = cleaned.match(summaryRegex);

    if (summaryMatch && summaryMatch[1]) {
      summary = summaryMatch[1].trim()
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '\t');
    }

    if (fullStory) {
      if (!summary) {
        summary = '**Updates Made:**\n• Revised story content according to your request.';
      }
      if (!fullStory.toLowerCase().includes('recap')) {
        fullStory += `\n\n### **Episode Recap**\n**Summary:** Updated episode summary reflecting recent story changes.`;
      }
      return { summary, fullStory };
    }

    // 3. Fallback for raw text responses
    let fallbackStory = cleaned
      .replace(/^\{[\s\S]*?"fullStory"\s*:\s*"/i, '')
      .replace(/^\{[\s\S]*?"summary"\s*:\s*"[\s\S]*?"\s*/i, '')
      .replace(/"\s*\}\s*$/i, '')
      .trim();

    if (!fallbackStory.toLowerCase().includes('recap')) {
      fallbackStory += `\n\n### **Episode Recap**\n**Summary:** Updated episode summary reflecting recent story changes.`;
    }

    const autoSummary = userQuestion 
      ? `**Updates Made:**\n• Revised story content according to request: "${userQuestion}"`
      : '**Updates Made:**\n• Revised story content as requested.';

    return {
      summary: autoSummary,
      fullStory: fallbackStory
    };
  }
}
