"use server"

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
        return { success: true, data: coreRes.data };
      }
      return { success: true, data };
    }

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

      return { success: true, data: coreRes.data };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error("Failed to execute saveGeneratedStoryAction:", err);
    return { success: false, error: err?.message || "Internal server action error" };
  }
}
