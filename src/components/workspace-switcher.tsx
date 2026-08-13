"use client";

import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown, Settings2, Tv } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  planned: "bg-sky-500",
  active: "bg-green-500",
  paused: "bg-amber-500",
  archived: "bg-muted-foreground",
};

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { workspaces, activeWorkspace, loading, error, selectWorkspace } =
    useWorkspace();

  const selectable = workspaces.filter((w) => w.status !== "archived");

  return (
    <div className="px-3 pt-3">
      <p className="px-3 pb-2 text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
        Channel workspace
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="w-full flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm text-left transition-colors hover:bg-accent cursor-pointer"
          data-testid="workspace-switcher"
        >
          <Tv className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="flex-1 min-w-0 truncate font-medium">
            {error
              ? "Workspaces unavailable"
              : loading
                ? "Loading…"
                : (activeWorkspace?.name ?? "No active workspace")}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {selectable.length === 0 && (
            <DropdownMenuItem disabled>
              No active workspaces — create one
            </DropdownMenuItem>
          )}
          {selectable.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => selectWorkspace(workspace.id)}
            >
              <span
                className={cn(
                  "mr-2 h-1.5 w-1.5 rounded-full",
                  STATUS_DOT[workspace.status] ?? "bg-muted-foreground"
                )}
              />
              <span className="flex-1 truncate">{workspace.name}</span>
              {activeWorkspace?.id === workspace.id && (
                <Check className="ml-2 h-3.5 w-3.5 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/workspaces")}>
            <Settings2 className="mr-2 h-4 w-4" />
            Manage workspaces
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p className="px-1 pt-2 text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}
