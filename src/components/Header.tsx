"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { CreditsChip } from "@/components/CreditsChip";
import { isNavItemActive, navItems } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Header() {
  const pathname = usePathname();
  const section = navItems.find((item) => isNavItemActive(item, pathname));

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-8">
      {/* The sidebar is hidden below md; this menu carries the same destinations. */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="icon-sm" aria-label="Open navigation">
                <Menu />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {navItems.map((item) => (
              <DropdownMenuItem key={item.path} render={<Link href={item.path} />}>
                <item.icon />
                {item.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <span className="text-sm font-medium text-foreground">{section?.name ?? "TilliTown"}</span>

      <div className="ml-auto flex items-center gap-2">
        <CreditsChip />
        <ThemeToggle />
      </div>
    </header>
  );
}
