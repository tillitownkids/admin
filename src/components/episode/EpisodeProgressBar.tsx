import { EPISODE_STEPS, episodeStepStates, type EpisodeProgress } from "@/lib/episodeSteps";
import { cn } from "@/lib/utils";

const STATE_LABEL = { done: "done", active: "in progress", todo: "not started", locked: "not started" } as const;

/** Five segments, one per step, so a row shows at a glance how far an episode has got. */
export function EpisodeProgressBar({ progress }: { progress: EpisodeProgress }) {
  const states = episodeStepStates(progress);

  return (
    <ol className="flex items-center gap-1" aria-label="Episode progress">
      {EPISODE_STEPS.map((step) => (
        <li
          key={step.key}
          title={`${step.label}: ${STATE_LABEL[states[step.key]]}`}
          className={cn(
            "h-1.5 w-7 rounded-full",
            states[step.key] === "done" && "bg-primary",
            states[step.key] === "active" && "bg-primary/40",
            (states[step.key] === "todo" || states[step.key] === "locked") && "bg-muted"
          )}
        >
          <span className="sr-only">{`${step.label}: ${STATE_LABEL[states[step.key]]}`}</span>
        </li>
      ))}
    </ol>
  );
}
