'use client';

import { useEffect, useState } from 'react';
import { FileText, CheckSquare, Image as ImageIcon, Tv, ArrowRight, Film, Plus, Sparkles, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ButtonLink';
import { PageHeader } from '@/components/PageHeader';
import { getRecentActivityAction, type RecentActivityItem } from '@/actions/getRecentActivityAction';
import { getDashboardStatsAction, type DashboardStats } from '@/actions/getDashboardStatsAction';

export default function Home() {
  const [activities, setActivities] = useState<RecentActivityItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const [activityResult, statsResult] = await Promise.all([
          getRecentActivityAction(),
          getDashboardStatsAction(),
        ]);
        if (activityResult.success && activityResult.activities) {
          setActivities(activityResult.activities);
        }
        setStats(statsResult.stats);
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
        return <ImageIcon size={18} className="text-success" />;
      case 'video':
        return <Film size={18} className="text-sky-500" />;
    }
  };

  return (
    <div className="max-w-[1200px] w-full mx-auto space-y-6 pb-10">
      <PageHeader
        title="Dashboard"
        description="What is in progress and what changed recently."
        action={
          <>
            <ButtonLink href="/episodes" variant="outline">Open episodes</ButtonLink>
            <ButtonLink href="/episodes/new">
              <Plus />
              New episode
            </ButtonLink>
          </>
        }
      />

      {/* Stats Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Scripts Pending", value: stats?.scriptsPending, icon: FileText, color: "text-primary", bg: "bg-primary/10" },
          { title: "Videos to Approve", value: stats?.videosToApprove, icon: CheckSquare, color: "text-amber-500", bg: "bg-amber-500/10" },
          { title: "Storyboards Active", value: stats?.storyboardsActive, icon: ImageIcon, color: "text-success", bg: "bg-success/10" },
          { title: "Published this week", value: stats?.publishedThisWeek, icon: Tv, color: "text-rose-500", bg: "bg-rose-500/10" },
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
            <div className="text-3xl font-bold tracking-tight">{stat.value ?? "—"}</div>
          </div>
        ))}
      </div>

      <div>
        {/* Dynamic Recent Activity */}
        <div className="bg-card text-card-foreground rounded-xl border border-border flex flex-col">
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

      </div>
    </div>
  );
}
