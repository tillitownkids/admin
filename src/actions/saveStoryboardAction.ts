"use server";

import { prisma } from "@/lib/prisma";

export interface ConfirmSceneInput {
  scriptId: string;
  sceneNumber: number;
  title?: string;
  description?: string;
  storyboardPrompt: string;
}

export async function saveStoryboardScenesAction(scenes: ConfirmSceneInput[]) {
  try {
    if (!scenes || scenes.length === 0) {
      return { success: false, error: "No scenes provided to save." };
    }

    const inputScriptId = scenes[0].scriptId;
    let validStoryId: string | null = null;

    // 1. Find existing story matching ID or script topic/episode
    let targetStory = await prisma.story.findUnique({
      where: { id: inputScriptId }
    }).catch(() => null);

    if (!targetStory) {
      const scriptObj = await prisma.script.findUnique({
        where: { id: inputScriptId }
      }).catch(() => null);

      if (scriptObj?.topic) {
        targetStory = await prisma.story.findFirst({
          where: { topic: scriptObj.topic }
        }).catch(() => null);
      }

      if (!targetStory) {
        targetStory = await prisma.story.findFirst().catch(() => null);
      }
    }

    if (targetStory?.id) {
      validStoryId = targetStory.id;
    }

    if (!validStoryId) {
      return { success: false, error: "No associated story found to link storyboard scenes." };
    }

    // 2. Check if an episode location exists for this story
    let episodeLocation = await prisma.episodeLocation.findFirst({
      where: { story_id: validStoryId }
    });

    if (!episodeLocation) {
      // Find or create default location
      let location = await prisma.location.findFirst();
      if (!location) {
        location = await prisma.location.create({
          data: {
            name: "Main Scene Setting",
            description: "Default scene setting"
          }
        });
      }

      episodeLocation = await prisma.episodeLocation.create({
        data: {
          story_id: validStoryId,
          location_id: location.id,
          status: "active"
        }
      });
    }

    const savedScenes = [];

    for (const sceneInput of scenes) {
      const existingScene = await prisma.scene.findFirst({
        where: {
          episode_location_id: episodeLocation.id,
          scene_number: sceneInput.sceneNumber
        }
      });

      let updatedScene;
      if (existingScene) {
        updatedScene = await prisma.scene.update({
          where: { id: existingScene.id },
          data: {
            storyboard_prompt: sceneInput.storyboardPrompt,
            description: sceneInput.description || existingScene.description,
            storyboard_status: "confirmed",
            updated_at: new Date()
          }
        });
      } else {
        updatedScene = await prisma.scene.create({
          data: {
            episode_location_id: episodeLocation.id,
            scene_number: sceneInput.sceneNumber,
            description: sceneInput.description || "",
            storyboard_prompt: sceneInput.storyboardPrompt,
            storyboard_status: "confirmed",
            order_index: sceneInput.sceneNumber
          }
        });
      }
      savedScenes.push(updatedScene);
    }

    return { success: true, scenes: savedScenes };
  } catch (error: any) {
    console.error("Error saving storyboard scenes:", error);
    return { success: false, error: error.message || "Failed to save storyboard scenes." };
  }
}
