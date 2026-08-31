"use server";

import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";

export interface ConfirmSceneInput {
  scriptId: string;
  sceneNumber: number;
  title?: string;
  description?: string;
  storyboardPrompt: string;
  episodeLocationId?: string;
  locationName?: string;
  characterNames?: string[];
}

export async function buildStoryboardPayloadAction(scriptId: string, scenes: ConfirmSceneInput[], videoPrompt?: string) {
  try {
    if (!scriptId || !scenes || scenes.length === 0) {
      return { success: false, error: "Missing scriptId or scenes" };
    }

    // 1. Resolve Story
    let targetStory = await prisma.story.findUnique({
      where: { id: scriptId }
    }).catch(() => null);

    if (!targetStory) {
      const scriptObj = await prisma.script.findUnique({
        where: { id: scriptId }
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

    const spaceName = targetStory?.topic || "Storyboard Episode";
    const validStoryId = targetStory?.id;

    const firstScene = scenes[0];

    // 2. Fetch Characters ONLY for this scene (STRICTLY magnific_identifier)
    const characterRefs: Record<string, string> = {};
    if (validStoryId && firstScene) {
      const storyChars = await prisma.storyCharacter.findMany({
        where: { story_id: validStoryId },
        include: { Character: true }
      }).catch(() => []);

      const availableCharacters = storyChars.length > 0
        ? storyChars.map(sc => sc.Character)
        : await prisma.character.findMany().catch(() => []);

      // Determine which character names belong to firstScene
      let sceneCharNames = firstScene.characterNames || [];

      // Fallback: if characterNames array is empty, search storyboardPrompt and description for character names
      if (sceneCharNames.length === 0) {
        const promptText = (firstScene.storyboardPrompt + " " + (firstScene.description || "")).toLowerCase();
        sceneCharNames = availableCharacters
          .filter(c => c && promptText.includes(c.name.toLowerCase()))
          .map(c => c.name);
      }

      for (const charObj of availableCharacters) {
        if (!charObj?.name) continue;
        const charName = charObj.name;

        const isPresent = sceneCharNames.some(
          name => name.toLowerCase().includes(charName.toLowerCase()) || charName.toLowerCase().includes(name.toLowerCase())
        );

        if (isPresent) {
          const identifier = (charObj as any)?.magnific_identifier;
          if (identifier) {
            characterRefs[charName] = identifier;
          }
        }
      }
    }

    // 3. Fetch Location for this scene (STRICTLY magnific_identifier, no fallbacks)
    const locationRefs: Record<string, string> = {};
    let targetEpLoc = null;

    if (firstScene.episodeLocationId) {
      targetEpLoc = await prisma.episodeLocation.findUnique({
        where: { id: firstScene.episodeLocationId },
        include: { Location: true }
      }).catch(() => null);
    }

    if (!targetEpLoc && validStoryId) {
      const epLocs = await prisma.episodeLocation.findMany({
        where: { story_id: validStoryId },
        include: { Location: true }
      }).catch(() => []);

      if (firstScene.locationName) {
        targetEpLoc = epLocs.find(
          el => el.Location?.name?.toLowerCase().includes(firstScene.locationName!.toLowerCase()) ||
                firstScene.locationName!.toLowerCase().includes(el.Location?.name?.toLowerCase() || "")
        );
      }
    }

    const locIdentifier = (targetEpLoc?.Location as any)?.magnific_identifier;
    if (targetEpLoc?.Location?.name && locIdentifier) {
      locationRefs[targetEpLoc.Location.name] = locIdentifier;
    }

    // 4. Construct scene object (omit references section if empty)
    const sceneObj: Record<string, any> = {
      id: `scene-${firstScene.sceneNumber || 1}`,
      imagePrompt: firstScene.storyboardPrompt,
      videoPrompt: videoPrompt || ""
    };

    const referencesObj: Record<string, any> = {};
    if (Object.keys(characterRefs).length > 0) {
      referencesObj.characters = characterRefs;
    }
    if (Object.keys(locationRefs).length > 0) {
      referencesObj.locations = locationRefs;
    }

    if (Object.keys(referencesObj).length > 0) {
      sceneObj.references = referencesObj;
    }

    const payload = {
      spaceName,
      scenes: [sceneObj]
    };

    console.log("=== GENERATED STORYBOARD PAYLOAD ===");
    console.log(JSON.stringify(payload, null, 2));

    return { success: true, payload };
  } catch (err: any) {
    console.error("Error in buildStoryboardPayloadAction:", err);
    return { success: false, error: err?.message || "Failed to generate payload" };
  }
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

    // 2. Fetch all episode locations linked to this story
    let episodeLocations = await prisma.episodeLocation.findMany({
      where: { story_id: validStoryId },
      include: { Location: true }
    });

    let defaultEpisodeLocation = episodeLocations[0];
    if (!defaultEpisodeLocation) {
      let location = await prisma.location.create({
        data: {
          name: "Main Scene Setting",
          description: "Default scene setting"
        }
      });

      defaultEpisodeLocation = await prisma.episodeLocation.create({
        data: {
          story_id: validStoryId,
          location_id: location.id,
          status: "active"
        },
        include: { Location: true }
      });
      episodeLocations.push(defaultEpisodeLocation);
    }

    const allEpLocIds = episodeLocations.map(el => el.id);

    // Fetch story characters to link to SceneCharacter
    const storyChars = await prisma.storyCharacter.findMany({
      where: { story_id: validStoryId },
      include: { Character: true }
    }).catch(() => []);

    const availableCharacters = storyChars.length > 0
      ? storyChars.map(sc => sc.Character)
      : await prisma.character.findMany().catch(() => []);

    const savedScenes = [];

    // If batch updating all scenes, clean up old leftover scenes across the story's episode locations
    if (scenes.length > 1) {
      const maxSceneNum = Math.max(...scenes.map((s) => s.sceneNumber));
      await prisma.scene.deleteMany({
        where: {
          OR: [
            { episode_location_id: { in: allEpLocIds } },
            { story_id: validStoryId }
          ],
          scene_number: { gt: maxSceneNum }
        }
      });
    }

    for (const sceneInput of scenes) {
      // Determine specific EpisodeLocation ID for this scene
      let targetEpLocId = defaultEpisodeLocation.id;

      if (sceneInput.episodeLocationId && allEpLocIds.includes(sceneInput.episodeLocationId)) {
        targetEpLocId = sceneInput.episodeLocationId;
      } else if (sceneInput.locationName) {
        const matched = episodeLocations.find(
          el => el.Location?.name?.toLowerCase().includes(sceneInput.locationName!.toLowerCase()) ||
                sceneInput.locationName!.toLowerCase().includes(el.Location?.name?.toLowerCase() || "")
        );
        if (matched) {
          targetEpLocId = matched.id;
        }
      }

      // Check if scene exists under any of the story's episode locations or story_id
      const existingScene = await prisma.scene.findFirst({
        where: {
          OR: [
            { episode_location_id: { in: allEpLocIds } },
            { story_id: validStoryId }
          ],
          scene_number: sceneInput.sceneNumber
        }
      });

      let updatedScene;
      if (existingScene) {
        updatedScene = await prisma.scene.update({
          where: { id: existingScene.id },
          data: {
            story_id: validStoryId,
            episode_location_id: targetEpLocId,
            storyboard_prompt: sceneInput.storyboardPrompt,
            description: sceneInput.description || existingScene.description,
            storyboard_status: "confirmed",
            updated_at: new Date()
          }
        });
      } else {
        updatedScene = await prisma.scene.create({
          data: {
            story_id: validStoryId,
            episode_location_id: targetEpLocId,
            scene_number: sceneInput.sceneNumber,
            description: sceneInput.description || "",
            storyboard_prompt: sceneInput.storyboardPrompt,
            storyboard_status: "confirmed",
            order_index: sceneInput.sceneNumber
          }
        });
      }

      // Resolve character IDs for this scene
      let matchedCharIds: string[] = [];

      if (sceneInput.characterNames && sceneInput.characterNames.length > 0) {
        matchedCharIds = availableCharacters
          .filter(c => c && sceneInput.characterNames!.some(name => name.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(name.toLowerCase())))
          .map(c => c.id);
      }

      if (matchedCharIds.length === 0) {
        const promptText = (sceneInput.storyboardPrompt + " " + (sceneInput.description || "")).toLowerCase();
        matchedCharIds = availableCharacters
          .filter(c => c && promptText.includes(c.name.toLowerCase()))
          .map(c => c.id);

        if (matchedCharIds.length === 0 && availableCharacters.length > 0) {
          matchedCharIds = availableCharacters.map(c => c.id);
        }
      }

      if (updatedScene?.id && matchedCharIds.length > 0) {
        try {
          await prisma.sceneCharacter.deleteMany({
            where: { scene_id: updatedScene.id }
          });
          await prisma.sceneCharacter.createMany({
            data: matchedCharIds.map(charId => ({
              scene_id: updatedScene.id,
              character_id: charId
            })),
            skipDuplicates: true
          });
        } catch (scErr) {
          console.warn("Prisma SceneCharacter insert failed, attempting Supabase fallback:", scErr);
          await supabase.from('SceneCharacter').delete().eq('scene_id', updatedScene.id);
          const rows = matchedCharIds.map(charId => ({ scene_id: updatedScene.id, character_id: charId }));
          await supabase.from('SceneCharacter').insert(rows);
        }
      }

      savedScenes.push(updatedScene);
    }

    return { success: true, scenes: savedScenes };
  } catch (error: any) {
    console.error("Error saving storyboard scenes:", error);
    return { success: false, error: error.message || "Failed to save storyboard scenes." };
  }
}
