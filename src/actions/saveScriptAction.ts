"use server"

import { supabase } from "@/lib/supabase";
import { prisma } from "@/lib/prisma";

export interface SaveScriptInput {
  id?: string;
  topic?: string;
  episode_number?: string | number;
  generationType?: string;
  generation_type?: string;
  mode?: string;
  content?: string;
  contentHtml?: string;
  contentText?: string;
  status?: string;
}

export async function getScriptsAction() {
  try {
    const { data, error } = await supabase
      .from('Script')
      .select('*')
      .order('generated_at', { ascending: false });

    if (!error && data) {
      return { success: true, scripts: data };
    }

    const prismaScripts = await prisma.script.findMany({
      orderBy: { generated_at: 'desc' }
    });
    return { success: true, scripts: prismaScripts };
  } catch (err: any) {
    console.error("Failed to fetch scripts:", err);
    return { success: false, scripts: [], error: err?.message || "Failed to fetch scripts" };
  }
}

export async function getScriptByIdAction(id: string) {
  try {
    const { data, error } = await supabase
      .from('Script')
      .select('*')
      .eq('id', id)
      .single();

    if (!error && data) {
      return { success: true, script: data };
    }

    const prismaScript = await prisma.script.findUnique({
      where: { id }
    });
    if (prismaScript) {
      return { success: true, script: prismaScript };
    }

    return { success: false, script: null, error: "Script not found" };
  } catch (err: any) {
    console.error("Failed to fetch script by ID:", err);
    return { success: false, script: null, error: err?.message || "Failed to fetch script" };
  }
}

export async function saveGeneratedScriptAction(input: SaveScriptInput) {
  try {
    const topic = input.topic || "Untitled Script";
    const episode_number = input.episode_number ? String(input.episode_number) : "1";
    const generation_type = input.generationType || input.generation_type || "new";
    const mode = input.mode || "single";
    const content = input.contentHtml || input.content || input.contentText || "";
    const status = input.status || "success";

    const payload: Record<string, any> = {
      topic,
      content,
      episode_number,
      generation_type,
      mode,
      status,
      generated_at: new Date().toISOString()
    };

    if (input.id) {
      try {
        const { data, error } = await supabase
          .from('Script')
          .update(payload)
          .eq('id', input.id)
          .select()
          .single();
        if (!error && data) return { success: true, data };
      } catch (e) {}

      const updated = await prisma.script.update({
        where: { id: input.id },
        data: payload
      });
      return { success: true, data: updated };
    }

    try {
      const { data, error } = await supabase
        .from('Script')
        .insert([payload])
        .select()
        .single();
      if (!error && data) return { success: true, data };
    } catch (e) {}

    const created = await prisma.script.create({
      data: payload as any
    });

    return { success: true, data: created };
  } catch (err: any) {
    console.error("Failed to execute saveGeneratedScriptAction:", err);
    return { success: false, error: err?.message || "Internal server action error" };
  }
}
