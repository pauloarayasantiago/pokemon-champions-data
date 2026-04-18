"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Users, Calculator, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/team", label: "Team", icon: Users, match: (p: string) => p.startsWith("/team") },
  { href: "/calc", label: "Calc", icon: Calculator, match: (p: string) => p.startsWith("/calc") },
  { href: "/meta", label: "Meta", icon: TrendingUp, match: (p: string) => p.startsWith("/meta") },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-3xl grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-xs transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn("h-5 w-5", active && "stroke-[2.5]")}
                aria-hidden="true"
              />
              <span className={cn(active && "font-medium")}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
