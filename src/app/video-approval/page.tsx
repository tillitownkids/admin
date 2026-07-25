import { Check, X, Play, Video, Clock, BadgeCheck } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export default function VideoApprovalPage() {
  const pendingVideos = [
    { id: 1, title: "The Candy Forest Adventure", duration: "12:45", status: "Needs Review", author: "Animation Team A" },
    { id: 2, title: "Learning Numbers with Tilli", duration: "05:20", status: "Needs Review", author: "Edu-Creators" },
    { id: 3, title: "Space Journey Episode 4", duration: "15:10", status: "Needs Review", author: "Animation Team B" },
  ];

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={BadgeCheck}
        title="Video"
        highlight="Approval"
        description="Review and approve rendered videos before publishing."
        action={
          <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg border border-primary/20 backdrop-blur-sm">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            <span className="font-semibold">{pendingVideos.length} Pending</span>
          </div>
        }
      />

      <div className="space-y-4">
        {pendingVideos.map((video) => (
          <div
            key={video.id}
            className="bg-card border border-border rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row gap-5 sm:gap-6 items-start md:items-center"
          >
            {/* Video Thumbnail */}
            <div className="group/thumb relative shrink-0 w-full md:w-64 aspect-video rounded-xl overflow-hidden bg-muted border border-border cursor-pointer">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-background/80 flex items-center justify-center text-foreground group-hover/thumb:bg-primary group-hover/thumb:text-primary-foreground transition-colors duration-300">
                  <Play className="w-6 h-6 ml-1" fill="currentColor" />
                </div>
              </div>

              <div className="absolute bottom-3 right-3 px-2 py-1 bg-background/80 rounded-md text-xs font-medium text-foreground flex items-center gap-1.5 border border-border">
                <Clock className="w-3 h-3" />
                {video.duration}
              </div>
            </div>

            {/* Video Details */}
            <div className="flex-1 space-y-3 w-full">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                  {video.title}
                </h3>
                <p className="text-muted-foreground mt-1 flex items-center gap-2">
                  <span className="inline-block w-6 h-px bg-border"></span>
                  Submitted by <span className="font-medium text-foreground/80">{video.author}</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-600 dark:text-emerald-400 font-semibold transition-all duration-300 border border-emerald-500/20 hover:border-emerald-500 active:scale-[0.98]">
                  <Check className="w-4 h-4" strokeWidth={3} /> Approve
                </button>
                <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-destructive/10 hover:bg-destructive text-destructive font-semibold transition-all duration-300 border border-destructive/20 hover:border-destructive hover:text-destructive-foreground active:scale-[0.98]">
                  <X className="w-4 h-4" strokeWidth={3} /> Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
