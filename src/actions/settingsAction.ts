"use server";

import { prisma } from "@/lib/prisma";

export interface GlobalSettings {
  targetAudience?: string;
  audience?: string;
  tone?: string;
}

export async function getGlobalSettingsAction(): Promise<{ success: boolean; settings: { targetAudience: string; tone: string } }> {
  try {
    const rows = await prisma.setting.findMany({
      where: {
        key: { in: ["targetAudience", "tone"] }
      }
    }).catch(() => []);

    const map = new Map((rows || []).map((r) => [r.key, r.value]));

    return {
      success: true,
      settings: {
        targetAudience: map.get("targetAudience") || "kids",
        tone: map.get("tone") || "educational",
      }
    };
  } catch (err: any) {
    console.error("Error fetching global settings from database:", err);
    return {
      success: false,
      settings: { targetAudience: "kids", tone: "educational" }
    };
  }
}

export async function saveGlobalSettingsAction(input: GlobalSettings) {
  try {
    const targetAudience = input.targetAudience || input.audience || "kids";
    const tone = input.tone || "educational";

    await prisma.$transaction([
      prisma.setting.upsert({
        where: { key: "targetAudience" },
        update: { value: targetAudience },
        create: { key: "targetAudience", value: targetAudience }
      }),
      prisma.setting.upsert({
        where: { key: "tone" },
        update: { value: tone },
        create: { key: "tone", value: tone }
      })
    ]);

    const resultPayload = {
      success: true,
      targetAudience,
      tone,
      timestamp: new Date().toISOString()
    };

    console.log("[GLOBAL STORY SETTINGS SAVED TO DATABASE]", resultPayload);

    return resultPayload;
  } catch (err: any) {
    console.error("Error saving global settings to database:", err);
    return { success: false, error: err?.message || "Failed to save settings to database." };
  }
}
