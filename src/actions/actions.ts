"use server";

import { aiService } from "@/services/aiService";
import type { AiCallOptions } from "@/lib/services/ai/webSearch";

export async function callAi(prompt: string, maxTokens: number = 64000, options?: AiCallOptions) {
  return await aiService.call(prompt, maxTokens, options);
}

