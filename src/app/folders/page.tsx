"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { VideoCard } from "@/components/video-card";
import {
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useFolders } from "@/hooks/use-folders";
import { useWorkspace } from "@/hooks/use-workspace";

interface FolderDetail {
  id: number;
  name: string;
  videos: {
    videoId: string;
    video: {
      id: string;
      title: string;
      channelName: string;
      channelId: string;
      views: number;
      likes: number;
      comments: number;
      duration: string;
      publishedAt: string;
      thumbnailUrl: string;
      description: string;
      outlierScore: number | null;
      viewsPerHour: number | null;
    };
  }[];
}

function FoldersView() {
  const { folders, refresh: loadFolders, workspaceId } = useFolders();
  const { activeWorkspace } = useWorkspace();
  const searchParams = useSearchParams();
  const [selectedFolder, setSelectedFolder] = useState<FolderDetail | null>(
    null
  );
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(false);

  const loadFolder = async (id: number) => {
    if (workspaceId === null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/folders/${id}?workspaceId=${workspaceId}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to open folder");
        setSelectedFolder(null);
        return;
      }
      setSelectedFolder(data.folder);
    } catch {
      setSelectedFolder(null);
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    if (workspaceId === null) {
      toast.error("Select a channel workspace first");
      return;
    }
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: newFolderName.trim(),
          workspaceId,
        }),
      });
      if (res.ok) {
        toast.success("Folder created");
        setNewFolderName("");
        loadFolders();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to create folder");
      }
    } catch {
      toast.error("Failed to create folder");
    }
  };

  const deleteFolder = async (id: number) => {
    if (workspaceId === null) return;
    if (!confirm("Delete this folder?")) return;
    try {
      const res = await fetch(`/api/folders?id=${id}&workspaceId=${workspaceId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Folder deleted");
        if (selectedFolder?.id === id) setSelectedFolder(null);
        loadFolders();
      } else {
        toast.error("Failed to delete folder");
      }
    } catch {
      toast.error("Failed to delete folder");
    }
  };

  const removeVideo = async (videoId: string) => {
    if (!selectedFolder || workspaceId === null) return;
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "removeVideo",
          folderId: selectedFolder.id,
          videoId,
          workspaceId,
        }),
      });
      if (res.ok) {
        toast.success("Video removed");
        loadFolder(selectedFolder.id);
      } else {
        toast.error("Failed to remove video");
      }
    } catch {
      toast.error("Failed to remove video");
    }
  };

  // The dashboard links to /folders?id=N, so that folder opens directly.
  // Only once per id — reopening after Back would trap the user in the detail view.
  const openedFromUrl = useRef<string | null>(null);
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || workspaceId === null || openedFromUrl.current === id) return;
    const parsedId = parseInt(id);
    if (Number.isNaN(parsedId)) return;
    openedFromUrl.current = id;
    loadFolder(parsedId);
    // loadFolder is recreated every render; the ref guard is what limits this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, workspaceId]);

  // Folder detail view
  if (selectedFolder) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6 animate-fade-in-up">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedFolder(null)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{selectedFolder.name}</h1>
            <p className="text-sm text-muted-foreground">
              {selectedFolder.videos.length} videos
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : selectedFolder.videos.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                No videos in this folder yet. Save videos from the Outlier
                Finder.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {selectedFolder.videos.map(({ video }) => (
              <VideoCard
                key={video.id}
                video={{
                  ...video,
                  channelSubscribers: null,
                  channelAverageViews: null,
                }}
                onRemove={removeVideo}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Folder list view
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Saved evidence</h1>
        <p className="text-muted-foreground mt-1">
          Organize saved videos into collections for later research and idea development.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {activeWorkspace
            ? `Workspace: ${activeWorkspace.name}`
            : "No channel workspace selected."}
        </p>
      </div>

      {/* Folders belong to a workspace, so without one there is nothing to list
          and nothing to create — saying "no folders yet" here would claim the
          workspaces are empty when they are only out of scope. */}
      {workspaceId === null ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">
              No channel workspace is selected, so no folders can be listed or
              created. Any folders you have belong to a workspace.
            </p>
            <Link
              href="/workspaces"
              className={buttonVariants({ variant: "outline" })}
            >
              Go to Channel Workspaces
            </Link>
          </CardContent>
        </Card>
      ) : (
      <>
      {/* Create folder */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input
              placeholder="New folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createFolder()}
              className="h-10"
            />
            <Button onClick={createFolder} className="h-10">
              <Plus className="h-4 w-4 mr-1" />
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Folder grid */}
      {folders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No folders yet. Create one to start organizing your research.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {folders.map((folder) => (
            <Card
              key={folder.id}
              className="cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 group"
              onClick={() => loadFolder(folder.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">{folder.name}</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFolder(folder.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {folder._count.videos} videos
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default function FoldersPage() {
  return (
    <Suspense fallback={null}>
      <FoldersView />
    </Suspense>
  );
}
