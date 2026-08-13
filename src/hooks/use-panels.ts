"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "./use-workspace";

export interface PanelFilters {
  maxSubscribers?: number | null;
  minViews?: number | null;
  minDuration?: number | null;
  maxDuration?: number | null;
  minEngagement?: number | null;
  datePreset?: string;
  language?: string;
  sortBy?: string;
  excludeShorts?: boolean;
}

export interface PanelSummary {
  id: number;
  name: string;
  keyword: string;
  filters: string;
  results: string;
  lastRefreshed: string | null;
  createdAt: string;
}

export function usePanels() {
  const { workspaceId } = useWorkspace();
  const [panels, setPanels] = useState<PanelSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // No workspace selected yet — nothing to scope the request to.
    if (workspaceId === null) {
      setPanels([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const res = await fetch(`/api/panels?workspaceId=${workspaceId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load panels");
      }
      const data = await res.json();
      setPanels(data.panels || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load panels");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const deletePanel = useCallback(async (id: number) => {
    if (workspaceId === null) return;
    try {
      const res = await fetch(
        `/api/panels?id=${id}&workspaceId=${workspaceId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete panel");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete panel");
    }
  }, [refresh, workspaceId]);

  return { panels, error, loading, refresh, deletePanel, workspaceId };
}
