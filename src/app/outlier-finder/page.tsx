"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useWorkspace } from "@/hooks/use-workspace";
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
  /** Only the Shorts preset opts back into Shorts; everything else excludes them. */
  excludeShorts: boolean;
}

// Preset descriptions state the filter values, not a promise about the results.
const FILTER_PRESETS: FilterPreset[] = [
  {
    label: "Long-Form, Small Channels",
    description:
      "20+ min, 100k+ views, channels under 200k subs, English, past year",
    maxSubs: "200000",
    minViews: "100000",
    minDuration: "20",
    maxDuration: "",
    minEngagement: "",
    datePreset: "1y",
    language: "en",
    excludeShorts: true,
    sortBy: "outlier_score",
  },
  {
    label: "High Engagement, Tiny Channels",
    description: "5%+ engagement, 50k+ views, channels under 50k subs, past year",
    maxSubs: "50000",
    minViews: "50000",
    minDuration: "",
    maxDuration: "",
    minEngagement: "5",
    datePreset: "1y",
    language: "",
    excludeShorts: true,
    sortBy: "engagement",
  },
  {
    label: "Published This Week",
    description: "Past 7 days, 10k+ views, under 500k subs, sorted by views/hour",
    maxSubs: "500000",
    minViews: "10000",
    minDuration: "",
    maxDuration: "",
    minEngagement: "",
    datePreset: "7d",
    language: "",
    excludeShorts: true,
    sortBy: "views_per_hour",
  },
  {
    label: "Mid-Size Channels",
    description: "8+ min, 200k+ views, 3%+ engagement, under 500k subs, past 3 months",
    maxSubs: "500000",
    minViews: "200000",
    minDuration: "8",
    maxDuration: "",
    minEngagement: "3",
    datePreset: "3m",
    language: "",
    excludeShorts: true,
    sortBy: "outlier_score",
  },
  {
    label: "Shorts (opt-in)",
    description:
      "The only preset that keeps Shorts: under 4 min, 500k+ views, under 200k subs",
    maxSubs: "200000",
    minViews: "500000",
    minDuration: "",
    maxDuration: "4",
    minEngagement: "",
    datePreset: "3m",
    language: "",
    excludeShorts: false,
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

// Base UI's <SelectValue> shows the raw value unless the root is given the
// items, which is why these lists are the single source for both the popup
// entries and the label on the closed trigger.
const DATE_PRESET_ITEMS = DATE_PRESETS.map((p) => ({
  value: p.value || "any_time",
  label: p.label,
}));

const LANGUAGE_ITEMS = [
  { value: "any_lang", label: "Any" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "hi", label: "Hindi" },
];

const SORT_ITEMS = [
  { value: "outlier_score", label: "Legacy lifetime-average score" },
  { value: "views", label: "Views" },
  { value: "views_per_hour", label: "Views/Hour" },
  { value: "engagement", label: "Engagement Rate" },
  { value: "newest", label: "Newest First" },
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
  // Shorts are off by default: this tool is for long-form research.
  const [excludeShorts, setExcludeShorts] = useState(true);
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
    setExcludeShorts(preset.excludeShorts);
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
    setExcludeShorts(true);
    setActivePreset(null);
  }, []);

  const [results, setResults] = useState<VideoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { workspaceId, activeWorkspace } = useWorkspace();
  const { folders } = useFolders();
  const { panels, refresh: refreshPanels, deletePanel } = usePanels();
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  // Distinguishes "nothing searched yet" from "searched and found nothing".
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (overrideKeyword?: string) => {
    const term = (overrideKeyword ?? keyword).trim();
    if (!term) return;
    setLoading(true);
    setError("");
    setResults([]);
    setSearched(true);

    const dateRange = getDateRange(datePreset);

    try {
      const res = await fetch("/api/youtube/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: term,
          maxSubscribers: maxSubs ? parseInt(maxSubs) : undefined,
          minViews: minViews ? parseInt(minViews) : undefined,
          minDuration: minDuration ? parseFloat(minDuration) : undefined,
          maxDuration: maxDuration ? parseFloat(maxDuration) : undefined,
          minEngagement: minEngagement ? parseFloat(minEngagement) : undefined,
          publishedAfter: dateRange.after,
          publishedBefore: dateRange.before,
          language: language || undefined,
          excludeShorts,
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
  }, [keyword, maxSubs, minViews, minDuration, maxDuration, minEngagement, datePreset, language, excludeShorts]);

  const handleSaveToFolder = useCallback(async (videoId: string, folderId: number) => {
    if (workspaceId === null) {
      toast.error("Select a channel workspace first");
      return;
    }
    // Search results only exist in memory, so send the whole video with the
    // request — the API persists it before linking it to the folder.
    const video = results.find((v) => v.id === videoId);
    if (!video) {
      toast.error("Video is no longer in the current results");
      return;
    }
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addVideo",
          videoId,
          folderId,
          workspaceId,
          video: {
            id: video.id,
            title: video.title,
            channelId: video.channelId,
            channelName: video.channelName,
            views: video.views,
            likes: video.likes,
            comments: video.comments,
            duration: video.duration,
            publishedAt: video.publishedAt,
            thumbnailUrl: video.thumbnailUrl,
            description: video.description,
            outlierScore: video.outlierScore,
            viewsPerHour: video.viewsPerHour,
          },
        }),
      });
      if (res.ok) {
        toast.success("Video saved to folder");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save video");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save video");
    }
  }, [results, workspaceId]);

  const handleSavePanel = useCallback(async () => {
    if (workspaceId === null) {
      toast.error("Select a channel workspace first");
      return;
    }
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
          workspaceId,
          filters: {
            maxSubscribers: maxSubs ? parseInt(maxSubs) : null,
            minViews: minViews ? parseInt(minViews) : null,
            minDuration: minDuration ? parseFloat(minDuration) : null,
            maxDuration: maxDuration ? parseFloat(maxDuration) : null,
            minEngagement: minEngagement ? parseFloat(minEngagement) : null,
            datePreset,
            language,
            sortBy,
            excludeShorts,
          },
          results,
        }),
      });
      if (res.ok) {
        toast.success("Search saved");
        refreshPanels();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save search");
      }
    } catch {
      toast.error("Failed to save search");
    }
  }, [keyword, maxSubs, minViews, minDuration, maxDuration, minEngagement, datePreset, language, sortBy, excludeShorts, results, refreshPanels, workspaceId]);

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
      setExcludeShorts(f.excludeShorts !== false);
      setShowFilters(true);
      setActivePreset(null);
      const savedResults = JSON.parse(resultsJson || "[]");
      setResults(savedResults);
      setSearched(true);
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
    if (workspaceId === null) {
      toast.error("Select a channel workspace first");
      return;
    }
    setRefreshingPanelId(id);
    try {
      const res = await fetch("/api/panels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh", id, workspaceId }),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.panel;
        const savedResults = JSON.parse(updated.results || "[]");
        setResults(savedResults);
        setSearched(true);
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
        setExcludeShorts(f.excludeShorts !== false);
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
  }, [refreshPanels, workspaceId]);

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      switch (sortBy) {
        case "views":
          return b.views - a.views;
        case "views_per_hour":
          return (b.viewsPerHour ?? -1) - (a.viewsPerHour ?? -1);
        case "engagement":
          return (b.engagementRate ?? -1) - (a.engagementRate ?? -1);
        case "newest":
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        default:
          // Unmeasurable videos sort last instead of tying with a real 0.
          return (b.outlierScore ?? -1) - (a.outlierScore ?? -1);
      }
    });
  }, [results, sortBy]);

  // "Find Similar" re-runs the search on the first few words of a title rather
  // than only dropping them into the box and leaving the user to press Search.
  const handleSearchSimilar = useCallback(
    (title: string) => {
      const term = title.split(" ").slice(0, 4).join(" ");
      setKeyword(term);
      handleSearch(term);
    },
    [handleSearch]
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Outlier Finder</h1>
        <p className="text-muted-foreground mt-1">
          Keyword discovery ranked by the legacy lifetime-average score. That
          score mixes Shorts, long-form and livestreams — use{" "}
          <Link href="/references" className="text-primary hover:underline">
            Find references
          </Link>{" "}
          to get a video&apos;s real recent-median baseline.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {activeWorkspace
            ? `Saving to workspace: ${activeWorkspace.name}`
            : "No channel workspace selected — saving is disabled."}
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
            <Button onClick={() => handleSearch()} disabled={loading} className="h-11 px-6">
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
                <Select
                  items={DATE_PRESET_ITEMS}
                  value={datePreset}
                  onValueChange={(v) => setDatePreset(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_PRESET_ITEMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
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
                  items={LANGUAGE_ITEMS}
                  value={language || "any_lang"}
                  onValueChange={(v) => setLanguage(!v || v === "any_lang" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_ITEMS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <Checkbox
                    checked={excludeShorts}
                    onCheckedChange={(checked) => setExcludeShorts(checked === true)}
                  />
                  <span>
                    Exclude Shorts
                    <span className="block text-[11px] text-muted-foreground">
                      asks YouTube for 4 min+ only
                    </span>
                  </span>
                </label>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Sort By
                </Label>
                <Select
                  items={SORT_ITEMS}
                  value={sortBy}
                  onValueChange={(v) => setSortBy(v ?? "outlier_score")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_ITEMS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
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
            Searching YouTube and computing legacy scores...
          </p>
        </div>
      )}

      {/* Empty state — a filtered-out search looked identical to a blank page */}
      {searched && !loading && !error && results.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="text-muted-foreground">
              No videos matched. Either the keyword returned nothing on YouTube,
              or every result was removed by the current filters — the search
              response does not say which.
            </p>
            <p className="text-xs text-muted-foreground">
              Raise Max Subscribers, lower Min Views or Min Engagement, widen
              Published
              {excludeShorts ? ", or untick Exclude Shorts" : ""}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <div className="space-y-3">
        {sortedResults.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            folders={folders}
            onSaveToFolder={handleSaveToFolder}
            onSearchSimilar={handleSearchSimilar}
          />
        ))}
      </div>
    </div>
  );
}
