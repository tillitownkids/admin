import { Skeleton } from "@/components/ui/skeleton";

// Shown at once when opening an episode, while its header, steps and first step load.
export default function EpisodeLoading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 pb-10" aria-busy="true" aria-label="Loading the episode">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-8 w-24" />)}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}
