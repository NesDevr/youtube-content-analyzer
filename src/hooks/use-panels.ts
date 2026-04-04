"use client";

import { useState, useEffect, useCallback } from "react";

export interface PanelFilters {
  maxSubscribers?: number | null;
  minViews?: number | null;
  minDuration?: number | null;
  maxDuration?: number | null;
  minEngagement?: number | null;
  datePreset?: string;
  language?: string;
  sortBy?: string;
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
  const [panels, setPanels] = useState<PanelSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/panels");
      if (!res.ok) throw new Error("Failed to load panels");
      const data = await res.json();
      setPanels(data.panels || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load panels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const deletePanel = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/panels?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete panel");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete panel");
    }
  }, [refresh]);

  return { panels, error, loading, refresh, deletePanel };
}
