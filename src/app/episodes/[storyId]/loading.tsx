import { Skeleton } from "@/components/ui/skeleton";

// Shown at once when moving between an episode's steps; the header and stepper above stay in place.
export default function EpisodeStepLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading this step">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}
