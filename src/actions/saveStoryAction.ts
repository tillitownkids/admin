"use server";

import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";

export async function getStoriesAction() {
  try {
    let stories;
    try {
      const { data, error } = await supabase
        .from('Story')
        .select('*')
        .order('generated_at', { ascending: false });
      if (!error && data) {
        stories = data;
      }
    } catch (e) {}

    if (!stories) {
      stories = await prisma.story.findMany({
        orderBy: { generated_at: 'desc' }
      });
    }

    return { success: true, stories };
  } catch (error: any) {
    console.error("Error fetching stories:", error);
    return { success: false, error: error.message || "Failed to fetch stories" };
  }
}

export async function getStoryByIdAction(id: string) {
  try {
    if (!id) return { success: false, error: "Missing story ID" };

    let story;
    try {
      const { data, error } = await supabase
        .from('Story')
        .select('*')
        .eq('id', id)
        .single();
      if (!error && data) {
        story = data;
      }
    } catch (e) {}

    if (!story) {
      story = await prisma.story.findUnique({
        where: { id }
      });
    }

    return { success: true, story };
  } catch (error: any) {
    console.error("Error fetching story by ID:", error);
    return { success: false, error: error.message || "Failed to fetch story" };
  }
}

export async function saveGeneratedStoryAction(payload: {
  id?: string;
  topic?: string;
  episode_number?: string;
  generation_type?: string;
  mode?: string;
  content: string;
  status?: string;
  production_stage?: string;
  characterIds?: string[];
  locationIds?: string[];
}) {
  try {
    const {
      id,
      topic,
      episode_number,
      generation_type,
      mode,
      content,
      status,
      production_stage,
      characterIds,
      locationIds,
    } = payload;

    const dataPayload = {
      topic: topic || "",
      episode_number: episode_number?.toString() || "1",
      generation_type: generation_type || "new",
      mode: mode || "single",
      content: typeof content === 'object' ? JSON.stringify(content) : (content || "{}"),
      status: status || "draft",
      production_stage: production_stage || "story"
    };

    let story;

    if (id) {
     
      try {
        const { data, error } = await supabase
          .from('Story')
          .update(dataPayload)
          .eq('id', id)
          .select()
          .single();
        if (!error && data) {
          story = data;
        }
      } catch (e) {}

      if (!story) {
        story = await prisma.story.update({
          where: { id },
          data: dataPayload
        });
      }
    } else {
      
      try {
        const { data, error } = await supabase
          .from('Story')
          .insert([dataPayload])
          .select()
          .single();
        if (!error && data) {
          story = data;
        }
      } catch (e) {}

      if (!story) {
        story = await prisma.story.create({
          data: dataPayload
        });
      }
    }

    // Link characters and locations if provided
    if (story && story.id) {
      await linkStoryCharactersAndLocationsAction(
        story.id,
        characterIds || [],
        locationIds || []
      );
    }

    return { success: true, story };
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

    // 1. Link StoryCharacters with Prisma & Supabase
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

    // 2. Link EpisodeLocations with Prisma & Supabase
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

    // Fallback Supabase without join
    if (characters.length === 0) {
      try {
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
      } catch (e) {}
    }

    // Fallback Prisma StoryCharacter join
    if (characters.length === 0) {
      try {
        const scPrisma = await prisma.storyCharacter.findMany({
          where: { story_id: storyId },
          include: { Character: true }
        });
        if (scPrisma && scPrisma.length > 0) {
          characters = scPrisma.map((sc) => sc.Character).filter(Boolean);
        }
      } catch (e) {}
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
          id: el.location_id || el.id,
          location_id: el.location_id || el.id,
          episode_location_id: el.id,
          name: el.Location?.name || 'Unnamed Location',
          description: el.Location?.description || '',
          generated_image_url: el.Location?.generated_image_url || null,
          reference_image_url: el.Location?.generated_image_url || el.Location?.reference_image_url || el.stylesheet_image_url || null,
          status: el.status,
          order_index: el.order_index
        }));
      }
    } catch (e) {}

    // Fallback Supabase without join
    if (locations.length === 0) {
      try {
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
              id: el.location_id || el.id,
              location_id: el.location_id || el.id,
              episode_location_id: el.id,
              name: locObj?.name || 'Unnamed Location',
              description: locObj?.description || '',
              generated_image_url: locObj?.generated_image_url || null,
              reference_image_url: locObj?.generated_image_url || locObj?.reference_image_url || el.stylesheet_image_url || null,
              status: el.status,
              order_index: el.order_index
            };
          });
        }
      } catch (e) {}
    }

    // Fallback Prisma EpisodeLocation join
    if (locations.length === 0) {
      try {
        const elPrisma = await prisma.episodeLocation.findMany({
          where: { story_id: storyId },
          include: { Location: true },
          orderBy: { order_index: 'asc' }
        });
        if (elPrisma && elPrisma.length > 0) {
          locations = elPrisma.map((el) => ({
            id: el.location_id || el.id,
            location_id: el.location_id || el.id,
            episode_location_id: el.id,
            name: el.Location?.name || 'Unnamed Location',
            description: el.Location?.description || '',
            generated_image_url: el.Location?.generated_image_url || null,
            reference_image_url: el.Location?.generated_image_url || el.Location?.reference_image_url || el.stylesheet_image_url || null,
            status: el.status,
            order_index: el.order_index
          }));
        }
      } catch (e) {}
    }

    return { success: true, characters, locations };
  } catch (err: any) {
    console.error("Failed to fetch characters and locations for story:", err);
    return { success: false, characters: [], locations: [], error: err?.message || "Failed to fetch details" };
  }
}
