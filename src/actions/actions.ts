"use server"
import { client } from "@/services/aiService";
import {  ConverseCommand } from "@aws-sdk/client-bedrock-runtime"
import Anthropic from "@anthropic-ai/sdk"


const Client = new Anthropic({apiKey : process.env.CLAUDE_API_KEY})

export async function callAi(prompt:string,maxTokens: number = 5000){
  try{
    const command = new ConverseCommand({
      modelId: process.env.BEDROCK_MODEL_ID!,
      
      messages: [
        {
          role: "user",
          content: [
            {
              text: prompt,
            },
          ],
        },
    ],})

    console.log("Bedrock called");
    const response = await client.send(command);
    if(response!=null){
      return response.output?.message?.content?.[0]
    }else{
      
      console.log("Claude called");
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



  }catch(err){
    console.log(`some error occurred : ${err}`)
    return { text: "" };


  }
  
}
