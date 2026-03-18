"use client";

import { useState, useEffect, useCallback } from "react";

export interface PanelSummary {
  id: number;
  name: string;
  keyword: string;
  lastRefreshed: string | null;
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

  return { panels, error, loading, refresh };
}
