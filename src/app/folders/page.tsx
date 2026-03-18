"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VideoCard } from "@/components/video-card";
import {
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

interface Folder {
  id: number;
  name: string;
  _count: { videos: number };
}

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

export default function FoldersPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderDetail | null>(
    null
  );
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());

  const loadFolders = useCallback(async () => {
    const res = await fetch("/api/folders");
    const data = await res.json();
    setFolders(data.folders || []);
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const loadFolder = async (id: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/folders/${id}`);
      const data = await res.json();
      setSelectedFolder(data.folder);
    } catch {
      setSelectedFolder(null);
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: newFolderName.trim() }),
    });
    setNewFolderName("");
    loadFolders();
  };

  const deleteFolder = async (id: number) => {
    if (!confirm("Delete this folder?")) return;
    await fetch(`/api/folders?id=${id}`, { method: "DELETE" });
    if (selectedFolder?.id === id) setSelectedFolder(null);
    loadFolders();
  };

  const removeVideo = async (videoId: string) => {
    if (!selectedFolder) return;
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "removeVideo",
        folderId: selectedFolder.id,
        videoId,
      }),
    });
    loadFolder(selectedFolder.id);
  };

  const toggleVideoSelect = (videoId: string) => {
    setSelectedVideos((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  // Folder detail view
  if (selectedFolder) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedFolder(null);
              setSelectedVideos(new Set());
            }}
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
          {selectedVideos.size > 0 && (
            <Badge className="ml-auto">{selectedVideos.size} selected</Badge>
          )}
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
                onSelect={toggleVideoSelect}
                selected={selectedVideos.has(video.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Folder list view
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Folders</h1>
        <p className="text-muted-foreground mt-1">
          Organize saved videos into collections for analysis and idea
          generation.
        </p>
      </div>

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
              className="cursor-pointer hover:border-primary/30 transition-colors group"
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
    </div>
  );
}
