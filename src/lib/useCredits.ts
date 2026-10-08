"use client";

import { useCallback, useEffect, useState } from "react";

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

/** The generation provider's credit balance, read through the n8n webhook. */
export function useCredits() {
  const [data, setData] = useState<CreditsData | null>(null);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefetch: boolean) => {
    if (isRefetch) setIsRefetching(true);
    setError(null);
    try {
      const res = await fetch("https://automation.tillitown.com/webhook/get-credits", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`The credits service answered with HTTP ${res.status}.`);
      const json = await res.json();
      if (!json?.credits) throw new Error("The credits service returned no balance.");
      setData(json.credits);
      setPlan(json.Plan ?? null);
    } catch (err) {
      console.error("Error fetching credits:", err);
      setError(err instanceof Error ? err.message : "Could not load credits.");
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load(false);
    })();
  }, [load]);

  return { data, plan, isLoading, isRefetching, error, refetch: () => load(true) };
}
