import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import Anthropic from "@anthropic-ai/sdk";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

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

  async call(prompt: string, maxTokens = 5000) {
    try {
      const response = await this.callBedrock(prompt);

      if (response) {
        return response;
      }

      return await this.callClaude(prompt, maxTokens);
    } catch (error) {
      console.error("AI Service Error:", error);
      return { text: "" };
    }
  }

  private async callBedrock(prompt: string) {
    const command = new ConverseCommand({
      modelId: process.env.BEDROCK_MODEL_ID!,
      messages: [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ],
    });

    const response = await this.bedrockClient.send(command);

    return response.output?.message?.content?.[0];
  }

  private async callClaude(prompt: string, maxTokens: number) {
    const response = await this.anthropicClient.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: maxTokens,
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