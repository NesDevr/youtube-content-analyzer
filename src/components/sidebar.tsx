"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  Key,
  TrendingUp,
  FolderOpen,
  Sparkles,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/outlier-finder", label: "Outlier Finder", icon: Search },
  { href: "/keywords", label: "Keyword Research", icon: Key },
  { href: "/trends", label: "Google Trends", icon: TrendingUp },
  { href: "/folders", label: "Folders", icon: FolderOpen },
  { href: "/ai-tools", label: "AI Tools", icon: Sparkles },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-red-500">YT</span> Analyzer
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          YouTube Research Tool
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground">
          Personal Research Tool
        </div>
      </div>
    </aside>
  );
}
