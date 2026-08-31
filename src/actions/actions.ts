"use server";

import { aiService } from "@/services/aiService";

export async function callAi(prompt: string, maxTokens: number = 8000) {
  return await aiService.call(prompt, maxTokens);
}

