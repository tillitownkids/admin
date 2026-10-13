import { Skeleton } from "@/components/ui/skeleton";

// Shown at once for any page that renders on the server, while it loads; the sidebar stays in place.
export default function PageLoading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 pb-10" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}
      </div>
    </div>
  );
}
