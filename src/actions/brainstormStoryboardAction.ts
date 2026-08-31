"use server";

import { callAi } from "@/actions/actions";
import { parseAiJson } from "@/lib/parseAiJson";

export interface StoryboardSceneInput {


  scene_number: number;
  title: string;
  beat_numbers?: number[];
  scene_script_beats?: string;
  location_name?: string;
  character_names?: string[];
  storyboard_prompt: string;
}

export async function brainstormStoryboardAction(
  scriptContent: string,
  currentScenes: StoryboardSceneInput[],
  userMessage: string
) {
  try {
    const prompt = `You are an expert creative director and storyboard assistant for a 3D animated children's series ("Tilli & Jaksh").
The user is reviewing and refining storyboard prompts for episode scenes.

Current Script Context:
${scriptContent.slice(0, 1500)}

Current Storyboard Scenes & Prompts:
${JSON.stringify(currentScenes, null, 2)}

User Request:
"${userMessage}"

YOUR TASK:
1. Process the user's request.
2. If the user requests scene revisions (e.g. lighting, camera framing, action, environment, continuity), update the affected storyboard_prompt strings while maintaining scene structure.
3. STRICT CHARACTER FIDELITY: NEVER invent, add, or extrapolate physical traits, body mechanics, technological qualities (such as wheels, robot parts, metal chassis, engines, camera eyes, or gadgets), powers, or unstated equipment to any character. Stick 100% strictly to official character descriptions and beat script content.
4. Return all scenes in the updatedScenes array (keep unchanged scenes as they are, and update the modified ones with their correct scene_number).
5. Provide a clear, short, conversational summary explanation of what you changed.

Return ONLY valid JSON with this exact structure:
{
  "summary": "Short conversational summary of what you modified or answered for the user.",
  "updatedScenes": [
    {
      "scene_number": 1,
      "title": "Scene Title",
      "beat_numbers": [1, 2, 3],
      "storyboard_prompt": "Updated complete prompt text..."
    }
  ]
}`;

    const response = await callAi(prompt);
    const rawText = typeof response === "string" ? response : response?.text || "";

    const parsed = parseAiJson(rawText);


    let summary = "I have updated the storyboard prompts according to your request.";
    let updatedScenes: StoryboardSceneInput[] = currentScenes;

    if (parsed) {
      if (parsed.summary) summary = parsed.summary;
      if (Array.isArray(parsed.updatedScenes) && parsed.updatedScenes.length > 0) {
        updatedScenes = parsed.updatedScenes;
      }
    }

    return {
      success: true,
      summary,
      updatedScenes
    };
  } catch (error: any) {
    console.error("Error in brainstormStoryboardAction:", error);
    return {
      success: false,
      error: error.message || "Failed to process brainstorm chat request."
    };
  }
}
