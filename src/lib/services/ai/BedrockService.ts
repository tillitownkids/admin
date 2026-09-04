import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export class BedrockService {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    this.modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      }
    });
  }

  /**
   * Invokes the model with the given prompt string and returns the raw response text.
   * Uses direct Anthropic API as primary if ANTHROPIC_API_KEY is available, falling back to Bedrock.
   */
  async invokeModel(promptText: string): Promise<string> {
    const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    
    if (anthropicKey) {
      const models = [
        'claude-3-5-sonnet-20241022',
        'claude-sonnet-4-5-20250929'
      ];
      
      for (const model of models) {
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: model,
              max_tokens: 4096,
              messages: [
                {
                  role: 'user',
                  content: promptText,
                },
              ],
            }),
          });

          if (!response.ok) {
            const errBody = await response.text();
            if (response.status === 404 || errBody.includes("not_found_error")) {
              console.warn(`Model ${model} not found or access denied, trying next model...`);
              continue;
            }
            throw new Error(`Anthropic API error (${response.status}): ${errBody}`);
          }

          const parsed = await response.json();
          if (parsed.content && parsed.content.length > 0 && parsed.content[0].text) {
            return parsed.content[0].text;
          }
          throw new Error("Unexpected response format from direct Anthropic API");
        } catch (anthropicError: any) {
          console.error(`Direct Anthropic API failed for model ${model}:`, anthropicError);
          // If this is the last model, break to proceed to Bedrock fallback
          if (model === models[models.length - 1]) {
            break;
          }
        }
      }
    }

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: promptText }],
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    try {
      const response = await this.client.send(command);
      const responseBody = new TextDecoder().decode(response.body);
      const parsed = JSON.parse(responseBody);
      
      // Assumes Claude model response structure
      if (parsed.content && parsed.content.length > 0 && parsed.content[0].text) {
        return parsed.content[0].text;
      }

      // Assumes OpenAI / Kimi model response structure
      if (parsed.choices && parsed.choices.length > 0 && parsed.choices[0].message?.content) {
        return parsed.choices[0].message.content;
      }
      
      throw new Error("Unexpected response format from Bedrock");
    } catch (error: any) {
      console.error("BedrockService invokeModel Error:", error);
      throw error;
    }
  }
}
