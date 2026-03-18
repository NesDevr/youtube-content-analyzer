"use client";

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VideoCard } from "@/components/video-card";
import { Search, Loader2, Save, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useFolders } from "@/hooks/use-folders";
import type { VideoResult } from "@/types/video";

const DATE_PRESETS = [
  { label: "Any time", value: "" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 3 months", value: "3m" },
  { label: "Last year", value: "1y" },
  { label: "Last 2 years", value: "2y" },
];

function getDateRange(preset: string): { after?: string; before?: string } {
  if (!preset) return {};
  const now = new Date();
  const map: Record<string, number> = {
    "7d": 7,
    "30d": 30,
    "3m": 90,
    "1y": 365,
    "2y": 730,
  };
  const days = map[preset] || 0;
  if (!days) return {};
  const after = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { after: after.toISOString() };
}

export default function OutlierFinderPage() {
  const [keyword, setKeyword] = useState("");
  const [maxSubs, setMaxSubs] = useState("300000");
  const [minViews, setMinViews] = useState("");
  const [minDuration, setMinDuration] = useState("");
  const [maxDuration, setMaxDuration] = useState("");
  const [minEngagement, setMinEngagement] = useState("");
  const [datePreset, setDatePreset] = useState("");
  const [language, setLanguage] = useState("");
  const [sortBy, setSortBy] = useState("outlier_score");
  const [showFilters, setShowFilters] = useState(false);

  const [results, setResults] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { folders } = useFolders();
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());

  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError("");
    setResults([]);
    setSelectedVideos(new Set());

    const dateRange = getDateRange(datePreset);

    try {
      const res = await fetch("/api/youtube/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          maxSubscribers: maxSubs ? parseInt(maxSubs) : undefined,
          minViews: minViews ? parseInt(minViews) : undefined,
          minDuration: minDuration ? parseFloat(minDuration) : undefined,
          maxDuration: maxDuration ? parseFloat(maxDuration) : undefined,
          minEngagement: minEngagement ? parseFloat(minEngagement) : undefined,
          publishedAfter: dateRange.after,
          publishedBefore: dateRange.before,
          language: language || undefined,
          maxResults: 50,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResults(data.results || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [keyword, maxSubs, minViews, minDuration, maxDuration, minEngagement, datePreset, language]);

  const handleSaveToFolder = useCallback(async (videoId: string, folderId: number) => {
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addVideo",
          videoId,
          folderId,
        }),
      });
      if (res.ok) {
        toast.success("Video saved to folder");
      } else {
        toast.error("Failed to save video");
      }
    } catch {
      toast.error("Failed to save video");
    }
  }, []);

  const handleSavePanel = useCallback(async () => {
    const name = prompt("Panel name:");
    if (!name) return;
    try {
      const res = await fetch("/api/panels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name,
          keyword,
          filters: {
            maxSubscribers: maxSubs ? parseInt(maxSubs) : null,
            minViews: minViews ? parseInt(minViews) : null,
            minDuration: minDuration ? parseFloat(minDuration) : null,
            maxDuration: maxDuration ? parseFloat(maxDuration) : null,
            minEngagement: minEngagement ? parseFloat(minEngagement) : null,
            datePreset,
            language,
          },
        }),
      });
      if (res.ok) {
        toast.success("Panel saved");
      } else {
        toast.error("Failed to save panel");
      }
    } catch {
      toast.error("Failed to save panel");
    }
  }, [keyword, maxSubs, minViews, minDuration, maxDuration, minEngagement, datePreset, language]);

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      switch (sortBy) {
        case "views":
          return b.views - a.views;
        case "views_per_hour":
          return (b.viewsPerHour || 0) - (a.viewsPerHour || 0);
        case "engagement":
          return (b.engagementRate || 0) - (a.engagementRate || 0);
        case "newest":
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        default:
          return (b.outlierScore || 0) - (a.outlierScore || 0);
      }
    });
  }, [results, sortBy]);

  const toggleVideoSelect = useCallback((videoId: string) => {
    setSelectedVideos((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Outlier Finder</h1>
        <p className="text-muted-foreground mt-1">
          Find viral videos from small channels — videos that massively
          outperform their channel&apos;s average.
        </p>
      </div>

      {/* Search bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Enter a keyword or niche (e.g., stoicism, horror stories, AI tools)"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-11"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading} className="h-11 px-6">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </Button>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Max Subscribers
                </Label>
                <Input
                  type="number"
                  placeholder="300000"
                  value={maxSubs}
                  onChange={(e) => setMaxSubs(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Min Views
                </Label>
                <Input
                  type="number"
                  placeholder="Any"
                  value={minViews}
                  onChange={(e) => setMinViews(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Min Duration (min)
                </Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={minDuration}
                  onChange={(e) => setMinDuration(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Max Duration (min)
                </Label>
                <Input
                  type="number"
                  placeholder="Any"
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Min Engagement %
                </Label>
                <Input
                  type="number"
                  placeholder="Any"
                  step="0.1"
                  value={minEngagement}
                  onChange={(e) => setMinEngagement(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Published
                </Label>
                <Select value={datePreset} onValueChange={(v) => setDatePreset(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value || "any_time"}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Language
                </Label>
                <Select value={language} onValueChange={(v) => setLanguage(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any_lang">Any</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                    <SelectItem value="ko">Korean</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Sort By
                </Label>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v ?? "outlier_score")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outlier_score">Outlier Score</SelectItem>
                    <SelectItem value="views">Views</SelectItem>
                    <SelectItem value="views_per_hour">Views/Hour</SelectItem>
                    <SelectItem value="engagement">Engagement Rate</SelectItem>
                    <SelectItem value="newest">Newest First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions bar */}
      {results.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{results.length} results</Badge>
            {selectedVideos.size > 0 && (
              <Badge>{selectedVideos.size} selected</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSavePanel}>
              <Save className="h-4 w-4 mr-1" />
              Save as Panel
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Searching YouTube and calculating outlier scores...
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="space-y-3">
        {sortedResults.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            folders={folders}
            onSaveToFolder={handleSaveToFolder}
            onSelect={toggleVideoSelect}
            selected={selectedVideos.has(video.id)}
            onSearchSimilar={(title) => {
              setKeyword(title.split(" ").slice(0, 4).join(" "));
            }}
          />
        ))}
      </div>
    </div>
  );
}
