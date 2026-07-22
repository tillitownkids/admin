import { BaseAITask } from '../BaseAITask';

export class BrainstormTask extends BaseAITask {
  
  buildPrompt(input: string): string {
    return `Generate 5 creative ideas/directions based on this content:\n\n${input}\n\nPlease format the response as a bulleted list of short ideas.`;
  }

  async execute(input: string): Promise<string[]> {
    const prompt = this.buildPrompt(input);
    const responseText = await this.bedrockService.invokeModel(prompt);
    
    // Clean response and split into array of ideas
    // Usually Claude responds with bullet points (- or *)
    const ideas = responseText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line))
      .map(line => line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, ''));

    // If parsing failed (no bullets), just return the text as a single item or try to split by paragraphs
    if (ideas.length === 0 && responseText.trim().length > 0) {
      return [responseText.trim()];
    }

    return ideas;
  }
}
