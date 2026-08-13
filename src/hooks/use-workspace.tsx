"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface Workspace {
  id: number;
  name: string;
  concept: string;
  status: "planned" | "active" | "paused" | "archived";
  language: string;
  country: string;
  targetAudience: string;
  contentFormat: string;
  positioning: string;
  constraints: string;
  ownedYoutubeChannelId: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { folders: number; panels: number; ideaGenerations: number };
}

const STORAGE_KEY = "yta.activeWorkspaceId";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  /** null until a workspace is selected — callers must not fetch before then. */
  workspaceId: number | null;
  loading: boolean;
  error: string | null;
  selectWorkspace: (id: number) => void;
  refresh: () => Promise<Workspace[]>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/workspaces");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load workspaces");
      }
      const data = await res.json();
      const list: Workspace[] = data.workspaces || [];
      setWorkspaces(list);

      // Selection rule: keep the stored workspace if it still exists and is not
      // archived, otherwise fall back to the first non-archived one. If every
      // workspace is archived there is no active workspace and the UI says so
      // rather than quietly writing into an archived channel.
      setActiveId((current) => {
        const selectable = list.filter((w) => w.status !== "archived");
        const stored =
          current ??
          (typeof window !== "undefined"
            ? Number(window.localStorage.getItem(STORAGE_KEY)) || null
            : null);
        if (stored && selectable.some((w) => w.id === stored)) return stored;
        return selectable[0]?.id ?? null;
      });
      return list;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workspaces");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectWorkspace = useCallback((id: number) => {
    setActiveId(id);
    window.localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const value = useMemo<WorkspaceContextValue>(() => {
    const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? null;
    return {
      workspaces,
      activeWorkspace,
      workspaceId: activeWorkspace?.id ?? null,
      loading,
      error,
      selectWorkspace,
      refresh,
    };
  }, [workspaces, activeId, loading, error, selectWorkspace, refresh]);

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside a WorkspaceProvider");
  }
  return context;
}
