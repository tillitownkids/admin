"use server"

import { client } from "@/services/aiService";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime"



// const client2 = new BedrockRuntimeClient({
//     region: process.env.AWS_REGION,
//     credentials: {
//       accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
//       secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
//     },
// });

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
        // inferenceConfig : {
        //     maxTokens
        // }
    });
      
    const response = await client.send(command);
      
    console.log(response.output?.message?.content?.[0]);

    return response.output?.message?.content?.[0]
}