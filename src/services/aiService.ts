import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { getGlobalSettingsAction } from "@/actions/settingsAction";

export class AiService {
  private anthropicClient: Anthropic;
  private bedrockClient: BedrockRuntimeClient;

  constructor() {
    this.anthropicClient = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY
    });

    this.bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      }
    });
  }

  async call(prompt: string, maxTokens = 64000) {
    try {
      // 1. Fetch active model preference from Supabase DB
      let aiModelPreference = "claude";
      try {
        const dbRes = await getGlobalSettingsAction();
        if (dbRes.success && dbRes.settings?.aiModel) {
          aiModelPreference = dbRes.settings.aiModel;
        }
      } catch (e) {
        // Silent fallback
      }

      // 2. Dispatch to the selected AI provider
      if (aiModelPreference === "kimi2.5" || aiModelPreference === "kimi") {
        const bedrockModelId = process.env.BEDROCK_MODEL_ID || "moonshotai.kimi-k2.5";
        const bedrockResponse = await this.callBedrock(prompt, bedrockModelId);
        if (bedrockResponse) {
          return bedrockResponse;
        }
      }
      return await this.callClaude(prompt, maxTokens);
    } catch (error) {
      console.error("AI Service Error:", error);
      throw error;
    }
  }

  private async callBedrock(prompt: string, modelId: string) {
    let response;
    try {
      const command = new ConverseCommand({
        modelId,
        messages: [
          {
            role: "user",
            content: [{ text: prompt }],
          },
        ],
      });

      response = await this.bedrockClient.send(command);
    } catch (err: unknown) {
      console.error(`Bedrock Error for modelId "${modelId}":`, err instanceof Error ? err.message : err);
      return null;
    }
    // Incomplete output must not be accepted or silently retried on another model.
    if (response.stopReason === 'max_tokens' || response.stopReason === 'model_context_window_exceeded') {
      throw new Error('Kimi/Bedrock reached its token limit before finishing. The incomplete response was not accepted.');
    }
    if (response.stopReason !== 'end_turn' && response.stopReason !== 'stop_sequence') {
      throw new Error(`Bedrock did not return a completed text response (${response.stopReason || 'unknown stop reason'}).`);
    }
    const text = (response.output?.message?.content || []).map(block => block.text || '').join('');
    if (!text.trim()) throw new Error('Bedrock returned no text. Please retry generation.');
    return { text };
  }

  private async callClaude(prompt: string, maxTokens: number) {
    // Large output budgets require streaming in the Anthropic SDK. Collect
    // the completed message here to preserve the existing { text } contract.
    const stream = this.anthropicClient.messages.stream({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const response = await stream.finalMessage();

    if (response.stop_reason === "max_tokens") {
      throw new Error("AI generation reached its output limit before finishing. The incomplete response was not accepted. Try generating the content in smaller sections.");
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (!text.trim()) {
      throw new Error("Claude returned no text. Please retry generation.");
    }

    return {
      text,
    };
  }
}

export const aiService = new AiService();
