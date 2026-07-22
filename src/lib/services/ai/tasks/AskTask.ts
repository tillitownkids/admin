import { BaseAITask } from '../BaseAITask';

export interface AskInput {
  selectedText: string;
  userQuestion: string;
}

export class AskTask extends BaseAITask {
  buildPrompt(input: AskInput): string {
    if (input.userQuestion && input.userQuestion.trim() !== '') {
      return `Given this text: '${input.selectedText}', answer the following question: '${input.userQuestion}'`;
    }
    return `Explain, improve, or provide insight on this text: '${input.selectedText}'`;
  }

  async execute(input: AskInput): Promise<string> {
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
