"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clapperboard,
  Play,
  Search,
  Library,
  Lightbulb,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

const navItems = [
  { href: "/", label: "Current video", icon: Clapperboard },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/references", label: "Find references", icon: Search },
  { href: "/library", label: "Library", icon: Library },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-sidebar-border bg-sidebar flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl brand-gradient shadow-lg shadow-primary/20">
            <Play className="h-4 w-4 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">
              <span className="brand-gradient-text">YT</span>{" "}
              <span className="text-foreground">Analyzer</span>
            </h1>
            <p className="text-[11px] text-muted-foreground leading-none">
              Research Tool
            </p>
          </div>
        </div>
      </div>

      <WorkspaceSwitcher />

      <nav className="flex-1 p-3 space-y-1">
        <p className="px-3 py-2 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
          Navigation
        </p>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border",
                isActive
                  ? "bg-primary/15 text-primary border-primary/20 shadow-sm shadow-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50 border-transparent"
              )}
            >
              <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
              {item.label}
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-2">
        <Link
          href="/advanced"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            pathname.startsWith("/advanced")
              ? "bg-accent/60 text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
          )}
        >
          <Settings2 className="h-4 w-4" />
          Advanced
        </Link>
        <div className="flex items-center gap-2 px-3 text-[11px] text-muted-foreground/60">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Personal Research Tool
        </div>
      </div>
    </aside>
  );
}
