"use server"

import Anthropic from "@anthropic-ai/sdk"


const Client = new Anthropic({apiKey : process.env.CLAUDE_API_KEY})

export async function callAi(prompt:string,maxTokens: number = 5000){

  const message = await Client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: maxTokens,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const textBlock = message.content.find(
    (block) => block.type === "text"
  );

  return { text: textBlock?.text ?? "" };
}
