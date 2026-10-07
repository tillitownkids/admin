"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText, ImageIcon, Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

export const productionTabs = [
  { name: "Story Generate", path: "/episode-production/stories", icon: BookOpen },
  { name: "Script Generate", path: "/episode-production/scripts", icon: FileText },
  { name: "Storyboard", path: "/episode-production/storyboards", icon: ImageIcon },
  { name: "Video Generation", path: "/episode-production", icon: Clapperboard },
];

export function ProductionNavigation() {
  const pathname = usePathname();
  const isVideoGeneration = !productionTabs.filter((tab) => tab.path !== "/episode-production").some(
    (tab) => pathname === tab.path || pathname.startsWith(`${tab.path}/`),
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
      <div className="flex items-center gap-2 px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Clapperboard className="h-3.5 w-3.5" />
        Video Production Workspace
      </div>
      <nav aria-label="Video production workflows" className="flex gap-1 overflow-x-auto">
        {productionTabs.map(({ name, path, icon: Icon }) => {
          const active = path === "/episode-production"
            ? isVideoGeneration
            : pathname === path || pathname.startsWith(`${path}/`);
          return (
            <Link key={path} href={path} aria-current={active ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <Icon className="h-4 w-4" />
              {name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
