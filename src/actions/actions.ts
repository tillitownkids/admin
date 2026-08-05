"use server"

import { client } from "@/services/aiService";
import {  ConverseCommand } from "@aws-sdk/client-bedrock-runtime"


export async function callAi(prompt:string,maxTokens: number = 2000){

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
        ],

    });
      
    const response = await client.send(command);

    return response.output?.message?.content?.[0]
}