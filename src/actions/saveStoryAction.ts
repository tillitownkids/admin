"use server";

import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";

export interface SaveStoryInput {
  id?: string;
  topic?: string;
  concept?: string;
  overview?: string;
  storyOverview?: string;
  lesson?: string;
  teachLesson?: string;
  duration?: string;
  generationType?: string;
  generation_type?: string;
  episode_number?: string | number;
  mode?: string;
  content?: string;
  contentHtml?: string;
  contentText?: string;
  status?: string;
  previousEpisodeId?: string | null;
  previousContext?: string | null;
  characterIds?: string[];
  locationIds?: string[];
}

export async function getStoriesAction() {
  try {
    const { data, error } = await supabase
      .from('Story')
      .select('*')
      .order('generated_at', { ascending: false });

    if (error) {
      console.error("Error fetching stories from Supabase:", error);
      return { success: false, stories: [], error: error.message };
    }

    return { success: true, stories: data || [] };
  } catch (err: any) {
    console.error("Failed to fetch stories:", err);
    return { success: false, stories: [], error: err?.message || "Failed to fetch stories" };
  }
}

export async function getStoryByIdAction(id: string) {
  try {
    const { data, error } = await supabase
      .from('Story')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error("Error fetching story by ID from Supabase:", error);
      return { success: false, story: null, error: error?.message || "Story not found" };
    }

    return { success: true, story: data };
  } catch (err: any) {
    console.error("Failed to fetch story by ID:", err);
    return { success: false, story: null, error: err?.message || "Failed to fetch story" };
  }
}

export async function saveGeneratedStoryAction(input: SaveStoryInput) {
  try {
    const topic = input.topic || (input.concept ? (input.concept.length > 50 ? input.concept.slice(0, 50) + "..." : input.concept) : "Untitled Story");
    const concept = input.concept || "";
    const storyOverview = input.storyOverview || input.overview || "";
    const teachLesson = input.teachLesson || input.lesson || "";
    const episode_number = input.episode_number ? String(input.episode_number) : "1";
    const generation_type = input.generationType || input.generation_type || "new";
    const mode = input.mode || "single";
    const content = input.contentHtml || input.content || input.contentText || "";
    const status = input.status || "success";

    const corePayload: Record<string, any> = {
      topic,
      content,
      episode_number,
      generation_type,
      mode,
      status,
      generated_at: new Date().toISOString()
    };

    const extendedPayload: Record<string, any> = {
      ...corePayload,
      concept,
      storyOverview,
      teachLesson
    };

    let savedStory: any = null;

    if (input.id) {
      const { data, error } = await supabase
        .from('Story')
        .update(extendedPayload)
        .eq('id', input.id)
        .select()
        .single();

      if (error) {
        const coreRes = await supabase
          .from('Story')
          .update(corePayload)
          .eq('id', input.id)
          .select()
          .single();

        if (coreRes.error) {
          console.error("Supabase update error:", coreRes.error);
          return { success: false, error: coreRes.error.message };
        }
        savedStory = coreRes.data;
      } else {
        savedStory = data;
      }
    } else {
      const { data, error } = await supabase
        .from('Story')
        .insert([extendedPayload])
        .select()
        .single();

      if (error) {
        console.warn("Supabase insert with extended columns failed ('" + error.message + "'), falling back to core schema columns...");

        const coreRes = await supabase
          .from('Story')
          .insert([corePayload])
          .select()
          .single();

        if (coreRes.error) {
          console.error("Supabase core story insert error:", coreRes.error);
          return { success: false, error: coreRes.error.message };
        }

        savedStory = coreRes.data;
      } else {
        savedStory = data;
      }
    }

    if (savedStory?.id) {
      await linkStoryCharactersAndLocationsAction(
        savedStory.id,
        input.characterIds || [],
        input.locationIds || []
      );
    }

    return { success: true, data: savedStory };
  } catch (err: any) {
    console.error("Failed to execute saveGeneratedStoryAction:", err);
    return { success: false, error: err?.message || "Internal server action error" };
  }
}

export async function linkStoryCharactersAndLocationsAction(
  storyId: string,
  characterIds: string[] = [],
  locationIds: string[] = []
) {
  try {
    if (!storyId) return { success: false, error: "Missing storyId" };

    // 1. Link StoryCharacters with Prisma
    if (characterIds && characterIds.length > 0) {
      for (const charId of characterIds) {
        if (!charId) continue;
        try {
          await prisma.storyCharacter.upsert({
            where: {
              story_id_character_id: {
                story_id: storyId,
                character_id: charId,
              },
            },
            create: {
              story_id: storyId,
              character_id: charId,
            },
            update: {},
          });
        } catch (e) {
          try {
            await supabase
              .from('StoryCharacter')
              .upsert([{ story_id: storyId, character_id: charId }]);
          } catch (supaErr) {}
        }
      }
    }

    // 2. Link EpisodeLocations with Prisma
    if (locationIds && locationIds.length > 0) {
      for (let i = 0; i < locationIds.length; i++) {
        const locId = locationIds[i];
        if (!locId) continue;
        try {
          await prisma.episodeLocation.upsert({
            where: {
              story_id_location_id: {
                story_id: storyId,
                location_id: locId,
              },
            },
            create: {
              story_id: storyId,
              location_id: locId,
              order_index: i,
              status: "pending",
            },
            update: {
              order_index: i,
            },
          });
        } catch (e) {
          try {
            await supabase
              .from('EpisodeLocation')
              .upsert([{ story_id: storyId, location_id: locId, order_index: i, status: "pending" }]);
          } catch (supaErr) {}
        }
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error in linkStoryCharactersAndLocationsAction:", err);
    return { success: false, error: err?.message || "Failed to link" };
  }
}

export async function getStoryCharactersAndLocationsAction(storyId: string) {
  try {
    if (!storyId) {
      return { success: true, characters: [], locations: [] };
    }

    // --- Fetch Characters via StoryCharacter joined with Character ---
    let characters: any[] = [];
    try {
      const { data: scData, error: scErr } = await supabase
        .from('StoryCharacter')
        .select('*, Character(*)')
        .eq('story_id', storyId);

      if (!scErr && scData) {
        characters = scData.map((sc: any) => sc.Character).filter(Boolean);
      }
    } catch (e) {}

    // Fallback if join didn't populate
    if (characters.length === 0) {
      const { data: scIds } = await supabase
        .from('StoryCharacter')
        .select('character_id')
        .eq('story_id', storyId);

      if (scIds && scIds.length > 0) {
        const charIds = scIds.map((row: any) => row.character_id).filter(Boolean);
        if (charIds.length > 0) {
          const { data: charList } = await supabase
            .from('Character')
            .select('*')
            .in('id', charIds);
          characters = charList || [];
        }
      }
    }

    // --- Fetch Episode Locations via EpisodeLocation joined with Location ---
    let locations: any[] = [];
    try {
      const { data: elData, error: elErr } = await supabase
        .from('EpisodeLocation')
        .select('*, Location(*)')
        .eq('story_id', storyId)
        .order('order_index', { ascending: true });

      if (!elErr && elData) {
        locations = elData.map((el: any) => ({
          id: el.id,
          location_id: el.location_id,
          name: el.Location?.name || 'Unnamed Location',
          description: el.Location?.description || '',
          reference_image_url: el.Location?.reference_image_url || el.stylesheet_image_url || null,
          status: el.status,
          order_index: el.order_index
        }));
      }
    } catch (e) {}

    // Fallback if join didn't populate
    if (locations.length === 0) {
      const { data: elList } = await supabase
        .from('EpisodeLocation')
        .select('*')
        .eq('story_id', storyId)
        .order('order_index', { ascending: true });

      if (elList && elList.length > 0) {
        const locIds = elList.map((el: any) => el.location_id).filter(Boolean);
        let locMap: Record<string, any> = {};
        if (locIds.length > 0) {
          const { data: locDetails } = await supabase
            .from('Location')
            .select('*')
            .in('id', locIds);
          if (locDetails) {
            locDetails.forEach((l: any) => { locMap[l.id] = l; });
          }
        }
        locations = elList.map((el: any) => {
          const locObj = locMap[el.location_id];
          return {
            id: el.id,
            location_id: el.location_id,
            name: locObj?.name || 'Unnamed Location',
            description: locObj?.description || '',
            reference_image_url: locObj?.reference_image_url || el.stylesheet_image_url || null,
            status: el.status,
            order_index: el.order_index
          };
        });
      }
    }

    return { success: true, characters, locations };
  } catch (err: any) {
    console.error("Failed to fetch characters and locations for story:", err);
    return { success: false, characters: [], locations: [], error: err?.message || "Failed to fetch details" };
  }
}

