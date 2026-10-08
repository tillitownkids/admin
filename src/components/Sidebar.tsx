"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, LayoutDashboard, LogOut, MapPin, Settings, Tv, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { signout } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
}

// Episodes hold the whole pipeline; the library is what episodes draw on.
export const navGroups: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { name: "Dashboard", path: "/", icon: LayoutDashboard },
      { name: "Episodes", path: "/episodes", icon: Clapperboard },
    ],
  },
  {
    label: "Library",
    items: [
      { name: "Characters", path: "/characters", icon: Users },
      { name: "Locations", path: "/locations", icon: MapPin },
    ],
  },
  {
    label: null,
    items: [{ name: "Settings", path: "/settings", icon: Settings }],
  },
];

export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return pathname === item.path || (item.path !== "/" && pathname.startsWith(`${item.path}/`));
}

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5" aria-label="Main">
      {navGroups.map((group, index) => (
        <div key={group.label ?? index} className="flex flex-col gap-1">
          {group.label && (
            <div className="px-3 pb-1 text-xs font-medium text-muted-foreground">{group.label}</div>
          )}
          {group.items.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="size-4" />
                {item.name}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default function Sidebar() {
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

  const userEmail = user?.email ?? "Signed in";

  return (
    <aside className="sticky top-0 z-10 hidden h-screen w-[232px] shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Tv size={16} strokeWidth={2.5} />
        </div>
        <span className="text-base font-semibold tracking-tight text-foreground">TilliTown</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <NavLinks />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={userEmail}>
          {userEmail}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={() => signout()} aria-label="Sign out" title="Sign out">
          <LogOut />
        </Button>
      </div>
    </aside>
  );
}
