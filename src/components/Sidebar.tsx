"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, CheckSquare, Tv, Clapperboard, Users, MapPin, ImageIcon, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { signout } from "@/actions/auth";
import type { User } from "@supabase/supabase-js";

export const navItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "Story Generate", path: "/story-generate", icon: FileText },
  { name: "Characters", path: "/characters", icon: Users },
  { name: "Locations", path: "/locations", icon: MapPin },
  { name: "Script Generate", path: "/script-generate", icon: FileText },
  { name: "Storyboard", path: "/storyboard", icon: ImageIcon },
  { name: "Video Production", path: "/episode-production", icon: Clapperboard },
  { name: "Video Approval", path: "/video-approval", icon: CheckSquare },
  { name: "YouTube Publishing", path: "/youtube-publishing", icon: Tv },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : "A";
  const userEmail = user?.email ?? "Admin User";

  return (
    <aside className="w-[260px] h-screen bg-card border-r border-border flex flex-col sticky top-0 shrink-0 z-10">
      <div className="flex items-center gap-3 px-6 py-6 border-b border-border/50">
        <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-lg text-primary-foreground">
          <Tv size={18} strokeWidth={2.5} />
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">
          TilliTown
        </span>
      </div>

      <div className="px-4 py-4 overflow-y-auto flex-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Main Menu</div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.path || (item.path !== "/" && pathname.startsWith(`${item.path}/`));
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground " 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon 
                  className={cn(
                    "w-4 h-4", 
                    isActive ? "text-primary-foreground" : "text-muted-foreground"
                  )} 
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto border-t border-border/50 p-4">
        <div className="flex items-center justify-between gap-3 px-2 py-2 rounded-lg bg-muted/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 bg-primary/15 text-primary border border-primary/20 rounded-full font-semibold text-sm shrink-0">
              {userInitial}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-xs text-foreground truncate" title={userEmail}>
                {userEmail}
              </span>
              <span className="text-[10px] text-muted-foreground truncate uppercase font-semibold">
                Administrator
              </span>
            </div>
          </div>
          <button
            onClick={() => signout()}
            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors shrink-0"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
