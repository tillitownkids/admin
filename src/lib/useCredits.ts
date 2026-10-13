"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queryKeys";

export interface CreditsData {
  available: number;
  totalPlan: number;
  spent: number;
  hasExtraCredits: boolean;
}

export interface PlanData {
  tier?: string;
  productName?: string;
  isUnlimitedMode?: boolean;
  unlimitedAppliesHere?: boolean;
}

async function fetchCredits(): Promise<{ credits: CreditsData; plan: PlanData | null }> {
  const res = await fetch("https://automation.tillitown.com/webhook/get-credits", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`The credits service answered with HTTP ${res.status}.`);
  const json = await res.json();
  if (!json?.credits) throw new Error("The credits service returned no balance.");
  return { credits: json.credits, plan: json.Plan ?? null };
}

/**
 * The generation provider's credit balance, read through the n8n webhook. Cached and shared, so the
 * header chip and the Settings panel make one request between them.
 */
export function useCredits() {
  const query = useQuery({ queryKey: queryKeys.credits(), queryFn: fetchCredits });
  return {
    data: query.data?.credits ?? null,
    plan: query.data?.plan ?? null,
    isLoading: query.isPending,
    isRefetching: query.isRefetching,
    error: query.error ? query.error.message : null,
    refetch: () => query.refetch(),
  };
}
