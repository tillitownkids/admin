"use client";

import Link from "next/link";
import { Coins } from "lucide-react";

import { useCredits } from "@/lib/useCredits";

/** The credit balance, always in view while generating. Details live in Settings. */
export function CreditsChip() {
  const { data, isLoading, error } = useCredits();
  if (error || (!isLoading && !data)) return null;

  return (
    <Link
      href="/settings"
      title="Generation credits available. Open Settings for details."
      className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground tabular-nums transition-colors hover:bg-muted hover:text-foreground"
    >
      <Coins className="size-3.5" />
      {isLoading || !data ? "Credits…" : `${Math.round(data.available).toLocaleString()} credits`}
    </Link>
  );
}
