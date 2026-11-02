import { sceneClips } from "@/lib/sceneShots";
import type { SceneRow } from "@/components/episode-production/types";

// Small shared helpers for the sequence pages (usable from server and client components).

export type SequencesTab = "overview" | "prompts" | "storyboards" | "clips";
export const SEQUENCES_TABS: SequencesTab[] = ["overview", "prompts", "storyboards", "clips"];

/** "SEQ 07": how the team names sequences. */
export function sequenceCode(number: number): string {
  return `SEQ ${String(number).padStart(2, "0")}`;
}

export function beatNumbersOf(scene: Pick<SceneRow, "beat_numbers">): number[] {
  const value = scene.beat_numbers;
  if (Array.isArray(value)) return value.map(Number).filter((n) => Number.isFinite(n));
  if (typeof value === "string") return value.split(",").map((n) => Number(n.trim())).filter((n) => Number.isFinite(n));
  return [];
}

/** "Beat 4" or "Beats 4–7". */
export function beatRange(numbers: number[]): string {
  if (!numbers.length) return "No beats";
  return numbers.length === 1 ? `Beat ${numbers[0]}` : `Beats ${numbers[0]}–${numbers[numbers.length - 1]}`;
}

export function castOf(scene: SceneRow): string[] {
  return (scene.SceneCharacter || []).flatMap((link) => (link.Character ? [link.Character.name] : []));
}

export function objectsOf(scene: SceneRow): string[] {
  return (scene.SceneProp || []).flatMap((link) => (link.Prop ? [link.Prop.name] : []));
}

export function hasClip(scene: SceneRow): boolean {
  return sceneClips(scene).clips.length > 0;
}

const dateTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function formatWhen(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : "";
}
