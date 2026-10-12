"use server";

import { supabase } from "@/lib/supabase";

export interface GlobalSettings {
  targetAudience?: string;
  audience?: string;
  tone?: string;
  aiModel?: string;
}

const DEFAULT_SETTINGS = { targetAudience: "kids", tone: "educational", aiModel: "claude" };

// Read and written through Supabase, which works wherever the app runs; Prisma needs DATABASE_URL.
export async function getGlobalSettingsAction(): Promise<{
  success: boolean;
  settings: { targetAudience: string; tone: string; aiModel: string };
  error?: string;
}> {
  const { data, error } = await supabase
    .from("Setting")
    .select("key, value")
    .in("key", ["targetAudience", "tone", "aiModel"]);

  if (error) {
    console.error("Error fetching global settings from database:", error);
    return { success: false, settings: DEFAULT_SETTINGS, error: `The settings could not be loaded: ${error.message}` };
  }

  const map = new Map((data || []).map((row) => [row.key as string, row.value as string]));
  return {
    success: true,
    settings: {
      targetAudience: map.get("targetAudience") || DEFAULT_SETTINGS.targetAudience,
      tone: map.get("tone") || DEFAULT_SETTINGS.tone,
      aiModel: map.get("aiModel") || DEFAULT_SETTINGS.aiModel,
    },
  };
}

export async function saveGlobalSettingsAction(input: GlobalSettings) {
  const targetAudience = input.targetAudience || input.audience || DEFAULT_SETTINGS.targetAudience;
  const tone = input.tone || DEFAULT_SETTINGS.tone;
  const aiModel = input.aiModel || DEFAULT_SETTINGS.aiModel;
  const updated_at = new Date().toISOString();

  const { error } = await supabase.from("Setting").upsert(
    [
      { key: "targetAudience", value: targetAudience, updated_at },
      { key: "tone", value: tone, updated_at },
      { key: "aiModel", value: aiModel, updated_at },
    ],
    { onConflict: "key" }
  );

  if (error) {
    console.error("Error saving global settings to database:", error);
    return { success: false, error: `The settings could not be saved: ${error.message}` };
  }
  return { success: true, targetAudience, tone, aiModel, timestamp: updated_at };
}
