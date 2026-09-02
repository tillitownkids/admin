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
  beatNumbers?: number[] | string;
  sceneScriptBeats?: string;
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

      if (scriptObj?.story_id) {
        targetStory = await prisma.story.findUnique({
          where: { id: scriptObj.story_id }
        }).catch(() => null);
      }

      if (!targetStory && scriptObj?.topic) {
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

      if (scriptObj?.story_id) {
        targetStory = await prisma.story.findUnique({
          where: { id: scriptObj.story_id }
        }).catch(() => null);
      }

      if (!targetStory && scriptObj?.topic) {
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

      let beatNumbersArray: number[] = [];
      if (Array.isArray(sceneInput.beatNumbers)) {
        beatNumbersArray = sceneInput.beatNumbers.map(n => Number(n)).filter(n => !isNaN(n));
      } else if (typeof sceneInput.beatNumbers === 'string') {
        beatNumbersArray = (sceneInput.beatNumbers as string)
          .split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n));
      } else if (typeof sceneInput.beatNumbers === 'number') {
        beatNumbersArray = [sceneInput.beatNumbers];
      }

      let updatedScene;
      if (existingScene) {
        updatedScene = await prisma.scene.update({
          where: { id: existingScene.id },
          data: {
            story_id: validStoryId,
            episode_location_id: targetEpLocId,
            storyboard_prompt: sceneInput.storyboardPrompt,
            description: sceneInput.description || sceneInput.title || existingScene.description,
            script_beats: sceneInput.sceneScriptBeats || existingScene.script_beats,
            beat_numbers: beatNumbersArray.length > 0 ? beatNumbersArray : existingScene.beat_numbers,
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
            description: sceneInput.description || sceneInput.title || "",
            storyboard_prompt: sceneInput.storyboardPrompt,
            script_beats: sceneInput.sceneScriptBeats || null,
            beat_numbers: beatNumbersArray,
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

export async function getStoryboardByStoryIdAction(storyId: string) {
  try {
    if (!storyId) {
      return { success: false, error: "Story ID is required" };
    }

    // 1. Fetch Story
    let story = await prisma.story.findUnique({
      where: { id: storyId }
    }).catch(() => null);

    let validStoryId = storyId;

    if (!story) {
      // Fallback: check if storyId is a script ID
      const scriptObj = await prisma.script.findUnique({
        where: { id: storyId }
      }).catch(() => null);

      if (scriptObj?.story_id) {
        story = await prisma.story.findUnique({
          where: { id: scriptObj.story_id }
        }).catch(() => null);
      }

      if (!story && scriptObj?.topic) {
        story = await prisma.story.findFirst({
          where: { topic: scriptObj.topic }
        }).catch(() => null);
      }

      if (story) {
        validStoryId = story.id;
      }
    }

    // 2. Resolve script content
    let scriptContent = story?.content || "";
    if (!scriptContent) {
      const scriptObj = await prisma.script.findFirst({
        where: { topic: story?.topic || "" }
      }).catch(() => null);
      if (scriptObj) scriptContent = scriptObj.content || "";
    }

    // 3. Fetch scenes for this story
    const scenes = await prisma.scene.findMany({
      where: { story_id: validStoryId },
      include: {
        EpisodeLocation: { include: { Location: true } },
        SceneCharacter: { include: { Character: true } }
      },
      orderBy: { scene_number: 'asc' }
    }).catch(() => []);

    // 4. Fetch EpisodeLocations and StoryCharacters
    const episodeLocations = await prisma.episodeLocation.findMany({
      where: { story_id: validStoryId },
      include: { Location: true },
      orderBy: { order_index: 'asc' }
    }).catch(() => []);

    const storyChars = await prisma.storyCharacter.findMany({
      where: { story_id: validStoryId },
      include: { Character: true }
    }).catch(() => []);

    const formattedScenes = scenes.map((sc) => ({
      id: sc.id,
      scene_number: sc.scene_number,
      title: sc.description ? (sc.description.length > 50 ? sc.description.slice(0, 50) + "..." : sc.description) : `Scene ${sc.scene_number}`,
      description: sc.description,
      storyboard_prompt: sc.storyboard_prompt,
      video_url: sc.video_url,
      video_prompt: sc.video_prompt,
      script_beats: sc.script_beats,
      beat_numbers: sc.beat_numbers,
      location_name: sc.EpisodeLocation?.Location?.name || "",
      character_names: sc.SceneCharacter.map(scChar => scChar.Character.name),
      episodeLocationId: sc.episode_location_id,
    }));

    const formattedLocations = episodeLocations.map(el => ({
      id: el.id,
      name: el.Location.name,
      description: el.Location.description,
    }));

    const formattedCharacters = storyChars.map(sc => ({
      id: sc.Character.id,
      name: sc.Character.name,
      description: sc.Character.description,
    }));

    return {
      success: true,
      storyId: validStoryId,
      story,
      scriptContent,
      scenes: formattedScenes,
      locations: formattedLocations,
      characters: formattedCharacters,
    };
  } catch (error: any) {
    console.error("Error in getStoryboardByStoryIdAction:", error);
    return { success: false, error: error.message || "Failed to fetch storyboard data." };
  }
}

export async function getSavedStoryboardsAction() {
  try {
    const scenesWithStory = await prisma.scene.findMany({
      where: {
        story_id: { not: null }
      },
      select: {
        story_id: true,
        updated_at: true,
      },
      orderBy: { updated_at: 'desc' }
    });

    const storyMap = new Map<string, Date>();
    for (const sc of scenesWithStory) {
      if (sc.story_id && !storyMap.has(sc.story_id)) {
        storyMap.set(sc.story_id, sc.updated_at);
      }
    }

    const uniqueStoryIds = Array.from(storyMap.keys());

    if (uniqueStoryIds.length === 0) {
      return { success: true, storyboards: [] };
    }

    const stories = await prisma.story.findMany({
      where: { id: { in: uniqueStoryIds } }
    });

    const storyLookup = new Map(stories.map(s => [s.id, s]));

    const result = uniqueStoryIds
      .map(id => {
        const story = storyLookup.get(id);
        if (!story) return null;
        const date = storyMap.get(id);

        return {
          id: story.id,
          episode_number: story.episode_number || "1",
          topic: story.topic || "Untitled Storyboard",
          generated_at: date ? (typeof date === 'string' ? date : date.toISOString()) : story.generated_at ? story.generated_at.toISOString() : new Date().toISOString(),
          production_stage: story.production_stage || 'storyboards',
        };
      })
      .filter((item): item is { id: string; episode_number: string; topic: string; generated_at: string; production_stage: string } => item !== null);




    return { success: true, storyboards: result };
  } catch (error: any) {
    console.error("Error in getSavedStoryboardsAction:", error);
    return { success: false, error: error.message || "Failed to fetch saved storyboards." };
  }

}


