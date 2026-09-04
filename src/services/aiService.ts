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
      return { text: "" };
    }
  }

  private async callBedrock(prompt: string, modelId: string) {
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

      const response = await this.bedrockClient.send(command);
      return response.output?.message?.content?.[0];
    } catch (err: any) {
      console.error(`Bedrock Error for modelId "${modelId}":`, err?.message || err);
      return null;
    }
  }

  private async callClaude(prompt: string, maxTokens: number) {
    const safeMaxTokens = Math.min(maxTokens || 4096, 8192);

    const response = await this.anthropicClient.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: safeMaxTokens,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const textBlock = response.content.find(
      (block) => block.type === "text"
    );

    return {
      text: textBlock?.text ?? "",
    };
  }
}

export const aiService = new AiService();