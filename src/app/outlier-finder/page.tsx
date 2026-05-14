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
import { Search, Loader2, Save, SlidersHorizontal, Trash2, Play, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useFolders } from "@/hooks/use-folders";
import { usePanels } from "@/hooks/use-panels";
import type { PanelFilters } from "@/hooks/use-panels";
import type { VideoResult } from "@/types/video";

interface FilterPreset {
  label: string;
  description: string;
  maxSubs: string;
  minViews: string;
  minDuration: string;
  maxDuration: string;
  minEngagement: string;
  datePreset: string;
  language: string;
  sortBy: string;
}

const FILTER_PRESETS: FilterPreset[] = [
  {
    label: "Long-Form Outliers",
    description: "Viral long videos from small channels (EN, last year)",
    maxSubs: "200000",
    minViews: "100000",
    minDuration: "20",
    maxDuration: "",
    minEngagement: "",
    datePreset: "1y",
    language: "en",
    sortBy: "outlier_score",
  },
  {
    label: "Hidden Gems",
    description: "High engagement from tiny channels",
    maxSubs: "50000",
    minViews: "50000",
    minDuration: "",
    maxDuration: "",
    minEngagement: "5",
    datePreset: "1y",
    language: "",
    sortBy: "engagement",
  },
  {
    label: "Trending Now",
    description: "Videos blowing up in the last 7 days",
    maxSubs: "500000",
    minViews: "10000",
    minDuration: "",
    maxDuration: "",
    minEngagement: "",
    datePreset: "7d",
    language: "",
    sortBy: "views_per_hour",
  },
  {
    label: "Mid-Size Wins",
    description: "Solid performers from mid-size channels",
    maxSubs: "500000",
    minViews: "200000",
    minDuration: "8",
    maxDuration: "",
    minEngagement: "3",
    datePreset: "3m",
    language: "",
    sortBy: "outlier_score",
  },
  {
    label: "Shorts Outliers",
    description: "Viral short-form content under 4 min",
    maxSubs: "200000",
    minViews: "500000",
    minDuration: "",
    maxDuration: "4",
    minEngagement: "",
    datePreset: "3m",
    language: "",
    sortBy: "views",
  },
];

const DATE_PRESETS = [
  { label: "Any time", value: "" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 3 months", value: "3m" },
  { label: "Last 6 months", value: "6m" },
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
    "6m": 180,
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
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = useCallback((preset: FilterPreset) => {
    setMaxSubs(preset.maxSubs);
    setMinViews(preset.minViews);
    setMinDuration(preset.minDuration);
    setMaxDuration(preset.maxDuration);
    setMinEngagement(preset.minEngagement);
    setDatePreset(preset.datePreset);
    setLanguage(preset.language);
    setSortBy(preset.sortBy);
    setActivePreset(preset.label);
    setShowFilters(true);
  }, []);

  const clearFilters = useCallback(() => {
    setMaxSubs("300000");
    setMinViews("");
    setMinDuration("");
    setMaxDuration("");
    setMinEngagement("");
    setDatePreset("");
    setLanguage("");
    setSortBy("outlier_score");
    setActivePreset(null);
  }, []);

  const [results, setResults] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { folders } = useFolders();
  const { panels, refresh: refreshPanels, deletePanel } = usePanels();
  const [showSavedSearches, setShowSavedSearches] = useState(false);
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
            sortBy,
          },
          results,
        }),
      });
      if (res.ok) {
        toast.success("Search saved");
        refreshPanels();
      } else {
        toast.error("Failed to save search");
      }
    } catch {
      toast.error("Failed to save search");
    }
  }, [keyword, maxSubs, minViews, minDuration, maxDuration, minEngagement, datePreset, language, sortBy, results, refreshPanels]);

  const loadPanel = useCallback((panelKeyword: string, filtersJson: string, resultsJson: string) => {
    try {
      const f: PanelFilters = JSON.parse(filtersJson);
      setKeyword(panelKeyword);
      setMaxSubs(f.maxSubscribers ? String(f.maxSubscribers) : "");
      setMinViews(f.minViews ? String(f.minViews) : "");
      setMinDuration(f.minDuration ? String(f.minDuration) : "");
      setMaxDuration(f.maxDuration ? String(f.maxDuration) : "");
      setMinEngagement(f.minEngagement ? String(f.minEngagement) : "");
      setDatePreset(f.datePreset || "");
      setLanguage(f.language || "");
      setSortBy(f.sortBy || "outlier_score");
      setShowFilters(true);
      setActivePreset(null);
      const savedResults = JSON.parse(resultsJson || "[]");
      setResults(savedResults);
      setSelectedVideos(new Set());
    } catch {
      setKeyword(panelKeyword);
    }
  }, []);

  const [refreshingPanelId, setRefreshingPanelId] = useState<number | null>(null);

  const handleDeletePanel = useCallback(async (id: number) => {
    await deletePanel(id);
    toast.success("Saved search deleted");
  }, [deletePanel]);

  const handleRefreshPanel = useCallback(async (id: number) => {
    setRefreshingPanelId(id);
    try {
      const res = await fetch("/api/panels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", id }),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.panel;
        const savedResults = JSON.parse(updated.results || "[]");
        setResults(savedResults);
        setSelectedVideos(new Set());
        // Restore filters from the panel
        const f: PanelFilters = JSON.parse(updated.filters || "{}");
        setKeyword(updated.keyword);
        setMaxSubs(f.maxSubscribers ? String(f.maxSubscribers) : "");
        setMinViews(f.minViews ? String(f.minViews) : "");
        setMinDuration(f.minDuration ? String(f.minDuration) : "");
        setMaxDuration(f.maxDuration ? String(f.maxDuration) : "");
        setMinEngagement(f.minEngagement ? String(f.minEngagement) : "");
        setDatePreset(f.datePreset || "");
        setLanguage(f.language || "");
        setSortBy(f.sortBy || "outlier_score");
        setShowFilters(true);
        setActivePreset(null);
        await refreshPanels();
        toast.success("Search refreshed");
      } else {
        toast.error("Failed to refresh search");
      }
    } catch {
      toast.error("Failed to refresh search");
    } finally {
      setRefreshingPanelId(null);
    }
  }, [refreshPanels]);

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
    <div className="p-8 max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Outlier Finder</h1>
        <p className="text-muted-foreground mt-1">
          Find viral videos from small channels — videos that massively
          outperform their channel&apos;s average.
        </p>
      </div>

      {/* Search bar */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px brand-gradient" />
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

          {/* Filter Presets */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Presets:</span>
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 cursor-pointer border ${
                  activePreset === preset.label
                    ? "bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/10"
                    : "bg-muted/50 text-muted-foreground border-transparent hover:bg-accent hover:text-accent-foreground hover:border-border"
                }`}
                title={preset.description}
              >
                {preset.label}
              </button>
            ))}
            {activePreset && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
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
                <Select
                  value={language || "any_lang"}
                  onValueChange={(v) => setLanguage(!v || v === "any_lang" ? "" : v)}
                >
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

      {/* Saved Searches */}
      {panels.length > 0 && (
        <div>
          <button
            onClick={() => setShowSavedSearches(!showSavedSearches)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Save className="h-4 w-4" />
            Saved Searches ({panels.length})
            {showSavedSearches ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showSavedSearches && (
            <div className="flex flex-wrap gap-2 mt-3">
              {panels.map((panel) => {
                const resultCount = JSON.parse(panel.results || "[]").length;
                return (
                  <div
                    key={panel.id}
                    className="group flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    <button
                      onClick={() => loadPanel(panel.keyword, panel.filters, panel.results)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Play className="h-3 w-3 text-primary" />
                      <span className="font-medium">{panel.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {resultCount} videos
                      </span>
                    </button>
                    <button
                      onClick={() => handleRefreshPanel(panel.id)}
                      disabled={refreshingPanelId === panel.id}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary cursor-pointer disabled:opacity-50"
                      title="Refresh results"
                    >
                      <RefreshCw className={`h-3 w-3 ${refreshingPanelId === panel.id ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      onClick={() => handleDeletePanel(panel.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
              Save Search
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
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="absolute inset-0 h-8 w-8 rounded-full bg-primary/20 animate-ping" />
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Searching YouTube and calculating outlier scores...
          </p>
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
