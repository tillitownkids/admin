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

    // Standard core payload matching existing database schema (topic, content, episode_number, generation_type, mode, status, generated_at)
    const corePayload: Record<string, any> = {
      topic,
      content,
      episode_number,
      generation_type,
      mode,
      status,
      generated_at: new Date().toISOString()
    };

    // Extended payload with additional fields
    const extendedPayload: Record<string, any> = {
      ...corePayload,
      concept,
      storyOverview,
      teachLesson
    };

    if (input.id) {
      // 1. Try updating with extended payload first
      const { data, error } = await supabase
        .from('Story')
        .update(extendedPayload)
        .eq('id', input.id)
        .select()
        .single();

      if (error) {
        // Fallback to core payload if schema lacks extra columns
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

    // 2. Insert new story: Try extended payload first
    const { data, error } = await supabase
      .from('Story')
      .insert([extendedPayload])
      .select()
      .single();

    if (error) {
      console.warn("Supabase insert with extended columns failed ('" + error.message + "'), falling back to core schema columns...");

      // Fallback insert with core schema columns (topic, content, episode_number, generation_type, mode, status)
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
