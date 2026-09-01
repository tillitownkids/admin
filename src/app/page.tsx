'use client';

import { useEffect, useState } from 'react';
import { FileText, CheckSquare, Image as ImageIcon, Tv, ArrowRight, LayoutDashboard, Film, Sparkles, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { DashboardSettings } from '@/components/DashboardSettings';
import { CreditsSection } from '@/components/CreditsSection';
import { PageHeader } from '@/components/PageHeader';
import { getRecentActivityAction, type RecentActivityItem } from '@/actions/getRecentActivityAction';

export default function Home() {
  const [activities, setActivities] = useState<RecentActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const res = await getRecentActivityAction();
        if (res.success && res.activities) {
          setActivities(res.activities);
        }
      } catch (err) {
        console.error('Failed to load recent activities:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const getActivityIcon = (type: RecentActivityItem['type']) => {
    switch (type) {
      case 'story':
        return <FileText size={18} className="text-primary" />;
      case 'script':
        return <Sparkles size={18} className="text-amber-500" />;
      case 'storyboard':
        return <ImageIcon size={18} className="text-emerald-500" />;
      case 'video':
        return <Film size={18} className="text-sky-500" />;
    }
  };

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
            className="group bg-card text-card-foreground p-4 rounded-xl border border-border flex flex-col justify-between relative overflow-hidden"
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
        {/* Dynamic Recent Activity */}
        <div className="lg:col-span-2 bg-card text-card-foreground rounded-xl border border-border flex flex-col">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Recent Activity</h2>
          </div>

          <div className="flex flex-col divide-y divide-border">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Loading recent activity...
              </div>
            ) : activities.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No recent activity recorded yet.
              </div>
            ) : (
              activities.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group flex items-center gap-4 p-5 hover:bg-muted/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center shrink-0">
                    {getActivityIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
                      {item.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{item.timeAgo}</span>
                      <span>•</span>
                      <span className="truncate">{item.subtitle}</span>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-secondary-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-primary-foreground shrink-0">
                    <ArrowRight size={14} />
                  </div>
                </Link>
              ))
            )}
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
