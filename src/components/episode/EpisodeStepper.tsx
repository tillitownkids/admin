"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Lock } from "lucide-react";

import { EPISODE_STEPS, lockedStepReason, type EpisodeStepKey, type EpisodeStepState } from "@/lib/episodeSteps";
import { cn } from "@/lib/utils";

/** The episode's five steps. It is the only navigation inside an episode. */
export function EpisodeStepper({
  storyId,
  states,
}: {
  storyId: string;
  states: Record<EpisodeStepKey, EpisodeStepState>;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Episode steps">
      <ol className="flex flex-wrap gap-1 border-b border-border">
        {EPISODE_STEPS.map((step, index) => {
          const state = states[step.key];
          const href = `/episodes/${storyId}/${step.key}`;
          const current = pathname === href;
          const marker = (
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                state === "done" && "bg-primary text-primary-foreground",
                state === "active" && "border border-success text-success",
                (state === "todo" || state === "locked") && "border border-border text-muted-foreground"
              )}
            >
              {state === "done" ? <Check className="size-3" /> : state === "locked" ? <Lock className="size-2.5" /> : index + 1}
            </span>
          );
          const className = cn(
            "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors",
            current ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
          );

          return (
            <li key={step.key}>
              {state === "locked" ? (
                <span className={cn(className, "cursor-not-allowed opacity-60")} aria-disabled="true" title={lockedStepReason(step.key)}>
                  {marker}
                  {step.label}
                </span>
              ) : (
                <Link
                  href={href}
                  aria-current={current ? "step" : undefined}
                  className={cn(className, !current && "hover:text-foreground", "focus-visible:ring-3 focus-visible:ring-ring/50")}
                >
                  {marker}
                  {step.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
