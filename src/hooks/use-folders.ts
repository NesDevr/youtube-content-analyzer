"use client";

import { useState, useEffect, useCallback } from "react";
import type { Folder } from "@/types/video";
import { useWorkspace } from "./use-workspace";

export function useFolders() {
  const { workspaceId } = useWorkspace();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // No workspace selected yet — nothing to scope the request to.
    if (workspaceId === null) {
      setFolders([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const res = await fetch(`/api/folders?workspaceId=${workspaceId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load folders");
      }
      const data = await res.json();
      setFolders(data.folders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load folders");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { folders, error, loading, refresh, workspaceId };
}
