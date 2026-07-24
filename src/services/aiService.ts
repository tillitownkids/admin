import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  }
});

const modelId = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";

export async function generateText(prompt: string, maxTokens: number = 2000): Promise<string> {
  const payload = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt }
        ]
      }
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  };

  const command = new InvokeModelCommand({
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  try {
    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Attempt to parse standard Bedrock Anthropic Claude 3 response format
    if (responseBody.content && responseBody.content.length > 0) {
      return responseBody.content[0].text;
    }
    
    // Fallback for other model structures that might return a raw text
    return responseBody.text || JSON.stringify(responseBody);
  } catch (error) {
    console.error("Error invoking Bedrock:", error);
    throw new Error("Failed to generate content from AI service.");
  }
}

export async function generateIdea(topic: string, context?: string): Promise<string> {
  const prompt = `You are a creative brainstorming assistant. Generate a brief, creative concept or idea for a story or script.
Topic: ${topic}
${context ? `Context: ${context}` : ''}
Please keep the response short, engaging, and in HTML format (e.g., using <p>, <ul>, <strong>) so it can be directly injected into a rich text editor.`;
  
  return await generateText(prompt, 500);
}

export async function generateScript(
  mode: 'single' | 'multi',
  topic: string,
  instructions: string,
  generationType: string,
  episodeCount?: number,
  previousContext?: string
): Promise<string> {
  let prompt = `You are an expert scriptwriter for the TilliTown universe.
`;

  if (mode === 'multi') {
    prompt += `Create a multi-episode arc script. Total Episodes: ${episodeCount}.
Provide the output as a valid JSON array of objects, where each object has:
- "episodeNumber": (number)
- "title": (string)
- "script": (string, formatted in HTML, ready for a rich text editor)
`;
  } else {
    prompt += `Create a single episode script.
Provide the output formatted purely in HTML, ready for a rich text editor. Do not include markdown code blocks.
`;
  }

  prompt += `
Topic/Brief: ${topic}
Type: ${generationType === 'continue' ? 'Continue the ongoing script' : 'Write a brand new script'}
`;

  if (instructions) {
    prompt += `\nAdditional Instructions: ${instructions}\n`;
  }

  if (previousContext) {
    prompt += `\nPrevious Context/History: ${previousContext}\n`;
  }

  const response = await generateText(prompt, 4000);
  
  // Clean up potential markdown wrapper from response if it exists
  let cleanResponse = response.trim();
  if (cleanResponse.startsWith('```html')) cleanResponse = cleanResponse.substring(7);
  else if (cleanResponse.startsWith('```json')) cleanResponse = cleanResponse.substring(7);
  if (cleanResponse.endsWith('```')) cleanResponse = cleanResponse.substring(0, cleanResponse.length - 3);

  return cleanResponse.trim();
}
