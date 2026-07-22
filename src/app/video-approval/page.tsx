import { Check, X, Play, Video, Clock, BadgeCheck } from "lucide-react";

export default function VideoApprovalPage() {
  const pendingVideos = [
    { id: 1, title: "The Candy Forest Adventure", duration: "12:45", status: "Needs Review", author: "Animation Team A", gradient: "from-indigo-500/40 to-purple-500/40" },
    { id: 2, title: "Learning Numbers with Tilli", duration: "05:20", status: "Needs Review", author: "Edu-Creators", gradient: "from-emerald-500/40 to-teal-500/40" },
    { id: 3, title: "Space Journey Episode 4", duration: "15:10", status: "Needs Review", author: "Animation Team B", gradient: "from-orange-500/40 to-rose-500/40" },
  ];

  return (
    <div className="max-w-5xl w-full mx-auto space-y-8 page-enter pb-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-pink-500/10 text-pink-500 border border-pink-500/20">
            <BadgeCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-heading">
              Video <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-pink-400">Approval</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Review and approve rendered videos before publishing.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 px-4 py-2 bg-pink-500/10 text-pink-600 dark:text-pink-400 rounded-xl border border-pink-500/20 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></div>
          <span className="font-semibold">{pendingVideos.length} Pending</span>
        </div>
      </header>

      <div className="space-y-6">
        {pendingVideos.map((video) => (
          <div 
            key={video.id} 
            className="group relative bg-card/40 backdrop-blur-xl border border-border/50 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row gap-6 sm:gap-8 items-start md:items-center hover:border-pink-500/30 transition-all duration-400 overflow-hidden"
          >
            {/* Background Glow */}
            <div className={`absolute -right-20 -top-20 w-64 h-64 bg-gradient-to-br ${video.gradient} rounded-full blur-3xl opacity-0 group-hover:opacity-30 transition-opacity duration-500 -z-10`}></div>

            {/* Video Thumbnail */}
            <div className="relative shrink-0 w-full md:w-64 aspect-video rounded-2xl overflow-hidden bg-muted border border-border group-hover:border-pink-500/40 transition-colors duration-300 group/thumb cursor-pointer">
              <div className={`absolute inset-0 bg-gradient-to-br ${video.gradient} opacity-20 group-hover/thumb:opacity-40 transition-opacity duration-300`}></div>
              
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-background/80 backdrop-blur-md flex items-center justify-center text-foreground group-hover/thumb:scale-110 group-hover/thumb:bg-pink-500 group-hover/thumb:text-white transition-all duration-300">
                  <Play className="w-6 h-6 ml-1" fill="currentColor" />
                </div>
              </div>

              <div className="absolute bottom-3 right-3 px-2 py-1 bg-background/80 backdrop-blur-md rounded-md text-xs font-medium text-foreground flex items-center gap-1.5 border border-border/50">
                <Clock className="w-3 h-3" />
                {video.duration}
              </div>
            </div>
            
            {/* Video Details */}
            <div className="flex-1 space-y-4 w-full">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-foreground group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors duration-300">
                  {video.title}
                </h3>
                <p className="text-muted-foreground mt-1 flex items-center gap-2">
                  <span className="inline-block w-6 h-px bg-border"></span>
                  Submitted by <span className="font-medium text-foreground/80">{video.author}</span>
                </p>
              </div>
              
              <div className="flex flex-wrap gap-3 pt-2">
                <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-600 dark:text-emerald-400 font-semibold transition-all duration-300 border border-emerald-500/20 hover:border-emerald-500 active:scale-[0.98]">
                  <Check className="w-4 h-4" strokeWidth={3} /> Approve
                </button>
                <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-destructive/10 hover:bg-destructive text-destructive font-semibold transition-all duration-300 border border-destructive/20 hover:border-destructive hover:text-destructive-foreground active:scale-[0.98]">
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
