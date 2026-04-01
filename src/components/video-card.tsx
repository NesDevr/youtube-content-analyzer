"use client";

import { useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  ThumbsUp,
  MessageSquare,
  Users,
  ExternalLink,
  FolderPlus,
  Clock,
  MoreVertical,
  CheckSquare,
  Search,
} from "lucide-react";

interface VideoCardProps {
  video: {
    id: string;
    title: string;
    channelName: string;
    views: number;
    likes: number;
    comments: number;
    duration: string;
    publishedAt: string;
    thumbnailUrl: string;
    outlierScore: number | null;
    viewsPerHour: number | null;
    channelSubscribers: number | null;
    channelAverageViews: number | null;
    engagementRate?: number | null;
    viewsToSubsRatio?: number | null;
  };
  folders?: { id: number; name: string }[];
  onSaveToFolder?: (videoId: string, folderId: number) => void;
  onSelect?: (videoId: string) => void;
  selected?: boolean;
  onSearchSimilar?: (keyword: string) => void;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function formatDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;
  const h = match[1] || "";
  const m = match[2] || "0";
  const s = (match[3] || "0").padStart(2, "0");
  return h ? `${h}:${m.padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 365) return `${Math.floor(days / 365)}y ago`;
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return hours > 0 ? `${hours}h ago` : "just now";
}

function getEngagementBadge(rate: number | null | undefined) {
  if (rate == null || rate <= 0) return null;
  const color =
    rate >= 5
      ? "bg-green-500/20 text-green-400 border-green-500/30"
      : rate >= 2
        ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
        : "bg-muted text-muted-foreground";
  return <Badge className={color}>{rate}% eng.</Badge>;
}

function getViewsToSubsBadge(ratio: number | null | undefined) {
  if (ratio == null || ratio <= 0) return null;
  const display = ratio >= 100 ? `${Math.round(ratio)}:1` : `${ratio}:1`;
  return (
    <Badge variant="outline" className="text-xs">
      {display} v/s
    </Badge>
  );
}

function getOutlierBadge(score: number | null) {
  if (!score) return null;
  if (score >= 10)
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
        {score}x Outlier
      </Badge>
    );
  if (score >= 5)
    return (
      <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
        {score}x Outlier
      </Badge>
    );
  if (score >= 2)
    return (
      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
        {score}x
      </Badge>
    );
  return (
    <Badge variant="secondary">
      {score}x
    </Badge>
  );
}

import React from "react";

export const VideoCard = React.memo(function VideoCard({
  video,
  folders = [],
  onSaveToFolder,
  onSelect,
  selected,
  onSearchSimilar,
}: VideoCardProps) {
  const [thumbnailOpen, setThumbnailOpen] = useState(false);

  return (
    <Card className="overflow-hidden hover:ring-primary/25 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 group">
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <div
          className="relative flex-shrink-0 w-48 h-28 rounded-lg overflow-hidden bg-muted cursor-pointer group/thumb"
          onClick={() => setThumbnailOpen(true)}
        >
          {onSelect && (
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(video.id); }}
              className="absolute top-1 left-1 z-10 p-1 rounded bg-black/50 hover:bg-black/70 transition-colors"
            >
              <CheckSquare
                className={`h-4 w-4 ${selected ? "text-primary" : "text-white/70"}`}
              />
            </button>
          )}
          <Image
            src={video.thumbnailUrl}
            alt={video.title}
            fill
            sizes="192px"
            className="object-cover transition-transform duration-300 group-hover/thumb:scale-105"
          />
          <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/10 transition-colors" />
          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(video.duration)}
          </div>
        </div>

        <Dialog open={thumbnailOpen} onOpenChange={setThumbnailOpen}>
          <DialogContent className="sm:max-w-3xl p-2">
            <DialogTitle className="sr-only">{video.title}</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`}
              alt={video.title}
              className="w-full rounded-lg"
            />
            <p className="text-sm text-muted-foreground text-center px-2 pb-1">{video.title}</p>
          </DialogContent>
        </Dialog>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm line-clamp-2 leading-tight">
              {video.title}
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md h-8 w-8 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent hover:text-accent-foreground cursor-pointer">
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    window.open(
                      `https://www.youtube.com/watch?v=${video.id}`,
                      "_blank"
                    )
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View on YouTube
                </DropdownMenuItem>
                {folders.length > 0 && (
                  <>
                    {folders.map((folder) => (
                      <DropdownMenuItem
                        key={folder.id}
                        onClick={() =>
                          onSaveToFolder?.(video.id, folder.id)
                        }
                      >
                        <FolderPlus className="mr-2 h-4 w-4" />
                        Save to {folder.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {onSearchSimilar && (
                  <DropdownMenuItem
                    onClick={() => onSearchSimilar(video.title)}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Find Similar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className="text-xs text-muted-foreground mt-1">
            {video.channelName}
            {video.channelSubscribers != null && (
              <span className="ml-2">
                <Users className="inline h-3 w-3 mr-0.5" />
                {formatNumber(video.channelSubscribers)} subs
              </span>
            )}
          </p>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {formatNumber(video.views)}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" />
              {formatNumber(video.likes)}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {formatNumber(video.comments)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(video.publishedAt)}
            </span>
            {video.viewsPerHour != null && video.viewsPerHour > 0 && (
              <span className="text-green-500">
                {formatNumber(video.viewsPerHour)} views/hr
              </span>
            )}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {getOutlierBadge(video.outlierScore)}
            {getEngagementBadge(video.engagementRate)}
            {getViewsToSubsBadge(video.viewsToSubsRatio)}
            {video.channelAverageViews != null && (
              <span className="text-xs text-muted-foreground">
                Channel avg: {formatNumber(video.channelAverageViews)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
});

