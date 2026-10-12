"use server";

import { aiService } from "@/services/aiService";
import { supabase } from "@/lib/supabase";
import { parseStoryboardJson } from "@/lib/storyboardGeneration";
import { normalizeCharacterName } from "@/lib/characterNames";
import { buildObjectDetectionPrompt, parseDetectedObjects, type DetectedObject } from "@/lib/propSheet";
import { errorText, linkPropToEpisode } from "@/lib/props";

// Objects are stored as props (see src/lib/propSheet.ts).

interface PropRow {
  id: string;
  name: string;
  description: string;
  kind: string;
  story_id: string | null;
}

export type DetectObjectsResult =
  | { ok: true; linked: string[]; created: string[] }
  | { ok: false; error: string };

/**
 * The object detection agent for one episode: reads its story, links the library objects it uses,
 * and creates the new ones as episode objects (flagged when they look likely to return). It only
 * adds, so running it again never removes an object or a sheet.
 */
export async function detectEpisodeObjectsAction(storyId: string): Promise<DetectObjectsResult> {
  try {
    const [{ data: story, error: storyError }, { data: props, error: propsError }, { data: castLinks }] = await Promise.all([
      supabase.from("Story").select("id, content").eq("id", storyId).maybeSingle(),
      supabase.from("Prop").select("id, name, description, kind, story_id"),
      supabase.from("StoryCharacter").select("Character(name, description)").eq("story_id", storyId),
    ]);
    if (storyError || propsError) throw storyError || propsError;
    // The cast, so things that are part of a character (Tilli's compass) are not listed as objects.
    const cast = ((castLinks || []) as unknown as { Character: { name: string; description: string } | null }[])
      .flatMap((link) => (link.Character ? [link.Character] : []));
    if (!story?.content?.trim()) return { ok: false, error: "This episode has no story to read objects from." };

    // The objects this episode may reuse: every permanent object, and its own episode objects.
    const library = ((props || []) as PropRow[]).filter((prop) => prop.kind === "permanent" || prop.story_id === storyId);
    const byName = new Map(library.map((prop) => [normalizeCharacterName(prop.name), prop]));

    let detected: DetectedObject[] | null = null;
    let failure: unknown;
    for (let attempt = 0; attempt < 2 && !detected; attempt++) {
      try {
        // Search lets the agent describe real-world objects (a dhow, an abra boat) accurately.
        const response = await aiService.call(buildObjectDetectionPrompt(story.content, library, cast), 8000, { webSearch: true });
        detected = parseDetectedObjects(parseStoryboardJson(response.text || ""));
      } catch (error) {
        failure = error;
      }
    }
    if (!detected) throw failure;

    const linked: string[] = [];
    const created: string[] = [];
    for (const object of detected) {
      const known = byName.get(normalizeCharacterName(object.name));
      if (known) {
        await linkPropToEpisode(known.id, storyId);
        linked.push(known.name);
        continue;
      }
      // An unknown name the agent marked as existing is a slip; it is created rather than dropped.
      if (!object.description) continue;
      const { data: prop, error } = await supabase
        .from("Prop")
        .insert([{ name: object.name, description: object.description, kind: "episode", story_id: storyId, suggest_permanent: object.recurring }])
        .select("id, name")
        .single();
      if (error) throw error;
      await linkPropToEpisode(prop.id, storyId);
      byName.set(normalizeCharacterName(prop.name), { ...prop, description: object.description, kind: "episode", story_id: storyId });
      created.push(prop.name);
    }
    return { ok: true, linked, created };
  } catch (error) {
    console.error("Object detection failed:", error);
    return { ok: false, error: `Objects could not be found: ${errorText(error, error instanceof Error ? error.message : "unknown error")}` };
  }
}

export interface EpisodeObject {
  id: string;
  name: string;
  description: string;
  hasSheet: boolean;
}

/** The objects linked to an episode, for scene planning. Empty when their tables cannot be read. */
export async function getEpisodeObjectsAction(storyId: string): Promise<EpisodeObject[]> {
  const { data, error } = await supabase
    .from("StoryProp")
    .select("Prop(id, name, description, magnific_identifier)")
    .eq("story_id", storyId);
  if (error) {
    console.warn("Episode objects could not be loaded:", error.message);
    return [];
  }
  return ((data || []) as unknown as { Prop: { id: string; name: string; description: string; magnific_identifier: string | null } | null }[])
    .flatMap((row) => (row.Prop ? [{ id: row.Prop.id, name: row.Prop.name, description: row.Prop.description, hasSheet: Boolean(row.Prop.magnific_identifier) }] : []));
}
