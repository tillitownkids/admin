import { aiService } from '@/services/aiService';
import type { AiCallOptions } from './webSearch';

/**
 * The AI tasks behind /api/ai/execute (ask, brainstorm, location detection, ...). Calls go through
 * the shared AI service, so they use the model chosen in Settings (Claude or Kimi) like every other
 * feature. With `webSearch`, the model can call the web_search tool while answering.
 */
export class BedrockService {
  async invokeModel(promptText: string, options?: AiCallOptions): Promise<string> {
    const response = await aiService.call(promptText, 8192, options);
    return response.text;
  }
}
