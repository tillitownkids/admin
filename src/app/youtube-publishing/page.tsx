import { Tv, Calendar, Globe, AlertCircle, FileVideo, Type, AlignLeft, Tags } from "lucide-react";

export default function YoutubePublishingPage() {
  return (
    <div className="max-w-6xl w-full mx-auto space-y-8 page-enter pb-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20">
            <Tv className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-heading">
              YouTube <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400">Publishing</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage uploads, metadata, and scheduling for your channel.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
        
        {/* Main Publishing Form */}
        <div className="bg-card/40 backdrop-blur-2xl border border-border/50 rounded-3xl overflow-hidden transition-all duration-500 hover:border-red-500/20 group/panel">
          <div className="p-8 sm:p-10 space-y-8 relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl -z-10 pointer-events-none group-hover/panel:bg-red-500/10 transition-colors duration-500"></div>

            <h2 className="flex items-center gap-2.5 text-xl font-bold text-foreground mb-6">
              <span className="p-2 rounded-xl bg-red-500/10 text-red-500">
                <Globe className="w-5 h-5" />
              </span>
              New Release Setup
            </h2>
            
            <div className="space-y-3">
              <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
                <FileVideo className="w-4 h-4 text-red-500/70" />
                Select Approved Video
              </label>
              <div className="relative">
                <select className="w-full appearance-none bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 cursor-pointer hover:bg-background text-foreground">
                  <option>The Candy Forest Adventure (12:45)</option>
                  <option>Learning Numbers with Tilli (05:20)</option>
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4"></path></svg>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
                <Type className="w-4 h-4 text-red-500/70" />
                Video Title
              </label>
              <input 
                type="text" 
                className="w-full bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 placeholder:text-muted-foreground/60 hover:bg-background"
                defaultValue="The Candy Forest Adventure | TilliTown Kids" 
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
                <AlignLeft className="w-4 h-4 text-red-500/70" />
                Description
              </label>
              <textarea 
                className="w-full min-h-[160px] resize-y bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 placeholder:text-muted-foreground/60 hover:bg-background"
                defaultValue="Join Tilli on a magical adventure through the Candy Forest! ✨🍬&#10;&#10;Don't forget to subscribe for more fun episodes! #TilliTown #KidsAnimation"
              ></textarea>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold tracking-wider uppercase text-foreground/80 flex items-center gap-2">
                <Tags className="w-4 h-4 text-red-500/70" />
                Tags <span className="text-muted-foreground font-normal lowercase">(comma separated)</span>
              </label>
              <input 
                type="text" 
                className="w-full bg-background/60 border border-input rounded-2xl px-5 py-4 text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 placeholder:text-muted-foreground/60 hover:bg-background"
                defaultValue="kids, animation, tillitown, cartoon, educational, fun" 
              />
            </div>
          </div>
          
          <div className="bg-muted/30 p-6 sm:px-10 border-t border-border/40 flex flex-col sm:flex-row items-center justify-end gap-4 backdrop-blur-md">
            <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-border/80 bg-background/80 hover:bg-muted text-foreground font-semibold transition-all duration-300 active:scale-[0.98]">
              <Calendar className="w-4 h-4" /> 
              Schedule
            </button>
            <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-all duration-300 active:scale-[0.98] group">
              <Globe className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" /> 
              Publish Now
            </button>
          </div>
        </div>

        {/* Sidebar / Status Area */}
        <div className="flex flex-col gap-6">
          <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-3xl p-6 transition- duration-300">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2.5 text-foreground">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Calendar className="w-4 h-4" />
              </span>
              Scheduled Releases
            </h3>
            
            <div className="flex flex-col gap-4">
              {[
                { title: "Space Journey Ep 3", date: "Tomorrow, 10:00 AM" },
                { title: "Fun with Shapes", date: "Friday, 02:00 PM" }
              ].map((item, i) => (
                <div key={i} className="group p-4 bg-background/50 border border-border/50 rounded-2xl hover:bg-background/80 hover:border-primary/30 transition-all duration-300 cursor-pointer">
                  <div className="font-semibold text-foreground group-hover:text-primary transition-colors">{item.title}</div>
                  <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {item.date}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-red-500/5 backdrop-blur-xl border border-red-500/20 rounded-3xl p-6">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2.5 text-red-500">
              <AlertCircle className="w-5 h-5" /> 
              YouTube API Status
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              API connection is active. <br/>
              <span className="font-medium text-foreground/80 mt-2 block">Quota usage: <span className="text-red-500">45%</span></span>
              (resets in 4 hours).
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
