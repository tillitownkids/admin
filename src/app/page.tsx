import { FileText, CheckSquare, Image as ImageIcon, Tv, TrendingUp, Users, ArrowRight, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { DashboardSettings } from "@/components/DashboardSettings";
import { CreditsSection } from "@/components/CreditsSection";
import { PageHeader } from "@/components/PageHeader";

export default function Home() {  
  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 page-enter pb-10">
      <PageHeader
        icon={LayoutDashboard}
        title="Overview"
        highlight="Dashboard"
        description="Welcome back! Here's what's happening today."
      />

      {/* Stats Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Scripts Pending", value: "12", icon: FileText, color: "text-primary", bg: "bg-primary/10" },
          { title: "Videos to Approve", value: "5", icon: CheckSquare, color: "text-amber-500", bg: "bg-amber-500/10" },
          { title: "Storyboards Active", value: "8", icon: ImageIcon, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { title: "Published this week", value: "24", icon: Tv, color: "text-rose-500", bg: "bg-rose-500/10" },
        ].map((stat, i) => (
          <div
            key={i}
            className="group bg-card text-card-foreground p-4 rounded-xl border border-border flex flex-col justify-between transition- relative overflow-hidden"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="text-sm font-medium text-muted-foreground">{stat.title}</div>
              <div className={`p-2 rounded-lg ${stat.bg} ${stat.color}`}>
                <stat.icon size={20} strokeWidth={2} />
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Credits & Usage Section */}
      <CreditsSection />

      <DashboardSettings />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-card text-card-foreground rounded-xl border border-border flex flex-col">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
            <button className="text-sm text-primary hover:underline">View all</button>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="group flex items-center gap-4 p-5 hover:bg-muted/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Users size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">
                    New script &quot;Summer Special&quot; generated
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">2 hours ago by Sarah</div>
                </div>
                <button className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-secondary-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-primary-foreground">
                  <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-card text-card-foreground rounded-xl border border-border flex flex-col h-fit">
          <div className="p-5 border-b border-border">
            <h2 className="text-lg font-semibold tracking-tight">Quick Actions</h2>
          </div>
          <div className="p-5 flex flex-col gap-2">
            <Link href="/story-generate" className="w-full block">
              <div className="group w-full flex flex-col items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 p-5 rounded-lg font-medium transition-colors">
                <FileText size={24} className="mb-1 opacity-90 group-hover:scale-110 transition-transform" />
                <span>Generate New Story</span>
              </div>
            </Link>
            <Link href="/script-generate" className="w-full block">
              <div className="group w-full flex flex-col items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 p-5 rounded-lg font-medium transition-colors">
                <FileText size={24} className="mb-1 opacity-90 group-hover:scale-110 transition-transform" />
                <span>Generate New Script</span>
              </div>
            </Link>
            <Link href="/video-approval" className="w-full block">
              <div className="group w-full flex items-center justify-between bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-3 rounded-lg font-medium transition-colors border border-border/50">
                <div className="flex items-center gap-3">
                  <CheckSquare size={18} className="text-primary" /> 
                  <span>Review Videos</span>
                </div>
                <ArrowRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
