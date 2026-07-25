import { Tv, Calendar, Globe, AlertCircle, FileVideo, Type, AlignLeft, Tags } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { GlassPanel } from "@/components/GlassPanel";
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass, selectFieldClass } from "@/lib/styles";

export default function YoutubePublishingPage() {
  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={Tv}
        title="YouTube"
        highlight="Publishing"
        description="Manage uploads, metadata, and scheduling for your channel."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">

        {/* Main Publishing Form */}
        <GlassPanel
          footer={
            <>
              <button className={secondaryButtonClass}>
                <Calendar className="w-4 h-4" />
                Schedule
              </button>
              <button className={`${primaryButtonClass} group`}>
                <Globe className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
                Publish Now
              </button>
            </>
          }
        >
          <h2 className="flex items-center gap-2.5 text-xl font-bold text-foreground">
            <span className="p-2 rounded-lg bg-primary/10 text-primary">
              <Globe className="w-5 h-5" />
            </span>
            New Release Setup
          </h2>

          <div className="space-y-3">
            <label className={labelClass}>
              <FileVideo className="w-4 h-4 text-primary" />
              Select Approved Video
            </label>
            <div className="relative">
              <select className={selectFieldClass}>
                <option>The Candy Forest Adventure (12:45)</option>
                <option>Learning Numbers with Tilli (05:20)</option>
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-muted-foreground">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m8 9 4-4 4 4m0 6-4 4-4-4"></path></svg>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className={labelClass}>
              <Type className="w-4 h-4 text-primary" />
              Video Title
            </label>
            <input
              type="text"
              className={fieldClass}
              defaultValue="The Candy Forest Adventure | TilliTown Kids"
            />
          </div>

          <div className="space-y-3">
            <label className={labelClass}>
              <AlignLeft className="w-4 h-4 text-primary" />
              Description
            </label>
            <textarea
              className={`min-h-[160px] resize-y ${fieldClass}`}
              defaultValue="Join Tilli on a magical adventure through the Candy Forest! ✨🍬&#10;&#10;Don't forget to subscribe for more fun episodes! #TilliTown #KidsAnimation"
            ></textarea>
          </div>

          <div className="space-y-3">
            <label className={labelClass}>
              <Tags className="w-4 h-4 text-primary" />
              Tags <span className="text-muted-foreground font-normal lowercase">(comma separated)</span>
            </label>
            <input
              type="text"
              className={fieldClass}
              defaultValue="kids, animation, tillitown, cartoon, educational, fun"
            />
          </div>
        </GlassPanel>

        {/* Sidebar / Status Area */}
        <div className="flex flex-col gap-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2.5 text-foreground">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Calendar className="w-4 h-4" />
              </span>
              Scheduled Releases
            </h3>

            <div className="flex flex-col gap-3">
              {[
                { title: "Space Journey Ep 3", date: "Tomorrow, 10:00 AM" },
                { title: "Fun with Shapes", date: "Friday, 02:00 PM" }
              ].map((item, i) => (
                <div key={i} className="p-4 bg-background/50 border border-border rounded-xl hover:bg-background/80 transition-colors duration-300 cursor-pointer">
                  <div className="font-semibold text-foreground">{item.title}</div>
                  <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {item.date}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2.5 text-primary">
              <AlertCircle className="w-5 h-5" />
              YouTube API Status
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              API connection is active. <br/>
              <span className="font-medium text-foreground/80 mt-2 block">Quota usage: <span className="text-primary">45%</span></span>
              (resets in 4 hours).
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
