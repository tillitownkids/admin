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
Revise the story by seamlessly incorporating the requested changes into the current narrative.
Maintain the warm bedtime tone, character personalities, dialogue style, and world rules.

STRICT MANDATORY REQUIREMENTS:
1. Return the COMPLETE updated narrative story with all changes seamlessly merged into it.
2. Do NOT include intro text, conversational commentary, or explanation wrappers (like "Here is the updated story:").
3. MANDATORY EPISODE RECAP: At the very end of the narrative, you MUST ALWAYS include a dedicated recap section structured exactly as:

**Episode Recap**
[A 1-paragraph summary recap of this episode summarizing the key events and moral takeaway.]`;
    }

    if (input.userQuestion && input.userQuestion.trim() !== '') {
      return `Given this text: '${input.selectedText}', answer the following question: '${input.userQuestion}'`;
    }
    return `Explain, improve, or provide insight on this text: '${input.selectedText}'`;
  }

  async execute(input: AskInput): Promise<string> {
    const prompt = this.buildPrompt(input);
    const responseText = await this.bedrockService.invokeModel(prompt);
    
    // Clean response in case the model returns markdown code block wraps or conversational intros
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```html')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }

    cleaned = cleaned.replace(/^(Here is the updated story|Here's the revised story|Here is the revised story|Sure! Here is the updated narrative story)[:\n\s]*/i, '');

    // Safety Fallback: If AI omitted the Episode Recap section in a story edit, generate and append it
    if (input.isStoryEdit && !cleaned.toLowerCase().includes('recap')) {
      try {
        const recapPrompt = `Provide a concise 1-paragraph episode recap for the following children's bedtime story:\n\n${cleaned.slice(-1500)}`;
        const generatedRecap = await this.bedrockService.invokeModel(recapPrompt);
        if (generatedRecap && generatedRecap.trim()) {
          const cleanRecap = generatedRecap.replace(/^(Here is the recap|Episode Recap)[:\n\s]*/i, '').trim();
          cleaned += `\n\n**Episode Recap**\n${cleanRecap}`;
        }
      } catch (recapErr) {
        console.error("Failed to generate fallback recap:", recapErr);
      }
    }

    return cleaned.trim();
  }
}
