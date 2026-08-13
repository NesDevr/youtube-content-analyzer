"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FlaskConical, Loader2, AlertTriangle } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";

type EvidenceSource = "youtube-api" | "calculated" | "legacy";

const SOURCE_LABEL: Record<EvidenceSource, { text: string; className: string }> = {
  "youtube-api": {
    text: "YouTube API",
    className: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
  calculated: {
    text: "Calculated",
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
  legacy: {
    text: "Legacy metric",
    className: "bg-muted text-muted-foreground",
  },
};

function SourceTag({ source }: { source: EvidenceSource }) {
  const { text, className } = SOURCE_LABEL[source];
  return (
    <Badge className={`text-[10px] font-medium ${className}`}>{text}</Badge>
  );
}

interface Comparable {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  durationSeconds: number;
  dayGapFromTarget: number;
}

interface AnalyzeResponse {
  target: {
    id: string;
    title: string;
    channelId: string;
    channelName: string;
    thumbnailUrl: string;
    publishedAt: string;
    views: number | null;
    likes: number | null;
    comments: number | null;
    durationSeconds: number;
    format: string;
  };
  channel: {
    id: string;
    name: string;
    subscribers: number | null;
    uploadsPlaylistId: string;
  };
  collection: {
    uploadsScanned: number;
    uploadsRetrieved: number;
    unavailableUploads: number;
    scannedWholeChannel: boolean;
    maxUploadsScanned: number;
    oldestUploadScanned: string | null;
    baselineWindowTruncated: boolean;
    estimatedQuotaUnits: number;
  };
  recentMedian: {
    metric: string;
    formulaVersion: string;
    status: string;
    ratio: number | null;
    baselineMedianViews: number | null;
    targetViews: number | null;
    format: string;
    sampleSize: number;
    minSampleSize: number;
    maxSampleSize: number;
    comparisonWindowDays: number;
    windowStart: string;
    windowEnd: string;
    comparables: Comparable[];
    excludedUnavailable: number;
    explanation: string;
    collectedAt: string;
  };
  legacy: {
    metric: string;
    formulaVersion: string;
    ratio: number | null;
    channelLifetimeAverageViews: number | null;
    note: string;
  };
}

function formatNumber(n: number | null): string {
  if (n === null) return "unavailable";
  return n.toLocaleString("en-US");
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function ratioBadge(ratio: number) {
  const className =
    ratio >= 5
      ? "bg-red-500/20 text-red-400 border-red-500/30"
      : ratio >= 2
        ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
        : ratio >= 1
          ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-2xl font-bold ${className}`}
    >
      {ratio}×
    </span>
  );
}

function OutlierLab() {
  const searchParams = useSearchParams();
  // Prefilled from "Check real baseline" on a video card. Deliberately not
  // auto-run: an analysis costs quota, so the user presses Analyze.
  const [url, setUrl] = useState(() => searchParams.get("v") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [observation, setObservation] = useState("");
  const [observationState, setObservationState] = useState("");
  const { workspaceId, loading: workspaceLoading } = useWorkspace();

  const analyze = useCallback(async () => {
    if (!url.trim() || !workspaceId) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch("/api/outlier/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), workspaceId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Analysis failed");
        return;
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [url, workspaceId]);

  const rm = data?.recentMedian;

  const saveObservation = useCallback(async () => {
    if (!data || !workspaceId || !observation.trim()) return;
    setObservationState("Saving…");
    try {
      const res = await fetch("/api/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          entityType: "video",
          entityId: data.target.id,
          topic: data.target.title,
          notes: observation.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not save observation");
      setObservation("");
      setObservationState("Saved as manual observation.");
    } catch (e) {
      setObservationState(e instanceof Error ? e.message : "Could not save observation");
    }
  }, [data, observation, workspaceId]);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Outlier Lab</h1>
        <p className="text-muted-foreground mt-1">
          Compares one video with the median of its channel&apos;s comparable
          recent uploads, and shows every video used to build that baseline.
        </p>
      </div>

      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px brand-gradient" />
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input
              placeholder="Paste a YouTube video URL or id"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              className="h-11"
            />
            <Button onClick={analyze} disabled={loading || !workspaceId} className="h-11 px-6">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FlaskConical className="h-4 w-4 mr-2" />
              )}
              Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {!workspaceLoading && !workspaceId && (
        <p className="text-sm text-amber-400">
          Select or create an active channel workspace before analyzing. Every result is saved with its workspace.
        </p>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm" data-testid="analyze-error">
              {error}
            </p>
          </CardContent>
        </Card>
      )}

      {data && rm && (
        <>
          {/* Target — raw API facts only */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">The video</CardTitle>
              <SourceTag source="youtube-api" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.target.thumbnailUrl}
                  alt={data.target.title}
                  className="w-48 rounded-lg flex-shrink-0"
                />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{data.target.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {data.target.channelName}
                    {data.channel.subscribers !== null &&
                      ` · ${formatNumber(data.channel.subscribers)} subscribers`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatNumber(data.target.views)} views ·{" "}
                    {formatNumber(data.target.likes)} likes ·{" "}
                    {formatNumber(data.target.comments)} comments
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Published {formatDate(data.target.publishedAt)} ·{" "}
                    {formatDuration(data.target.durationSeconds)} ·{" "}
                    <Badge variant="outline">{data.target.format}</Badge>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent-median result */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">
                Recent-median performance
              </CardTitle>
              <SourceTag source="calculated" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                {rm.status === "ok" && rm.ratio !== null ? (
                  <span data-testid="recent-median-ratio">
                    {ratioBadge(rm.ratio)}
                  </span>
                ) : (
                  <Badge
                    className="bg-amber-500/15 text-amber-400 border-amber-500/30"
                    data-testid="recent-median-status"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {rm.status === "insufficient_sample"
                      ? "Insufficient data"
                      : rm.status === "zero_baseline"
                        ? "Baseline is zero"
                        : "Target views unavailable"}
                  </Badge>
                )}
                <div className="text-sm text-muted-foreground">
                  {rm.explanation}
                </div>
              </div>

              <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Metric</dt>
                  <dd className="font-mono text-xs">{rm.metric}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Formula version
                  </dt>
                  <dd className="font-mono text-xs">{rm.formulaVersion}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Baseline median views
                  </dt>
                  <dd>{formatNumber(rm.baselineMedianViews)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Sample size</dt>
                  <dd>
                    {rm.sampleSize} of max {rm.maxSampleSize} (min{" "}
                    {rm.minSampleSize} required)
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Comparison window
                  </dt>
                  <dd>±{rm.comparisonWindowDays} days</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Format compared</dt>
                  <dd>{rm.format}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Sample date range
                  </dt>
                  <dd>
                    {rm.windowStart
                      ? `${formatDate(rm.windowStart)} → ${formatDate(rm.windowEnd)}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Collected at</dt>
                  <dd>{new Date(rm.collectedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Views hidden by YouTube
                  </dt>
                  <dd>{rm.excludedUnavailable} in-window upload(s)</dd>
                </div>
              </dl>

              {data.collection.baselineWindowTruncated && (
                <p className="text-xs text-amber-400">
                  Only the {data.collection.maxUploadsScanned} most recent uploads
                  were scanned, and the ±{rm.comparisonWindowDays} day window
                  reaches further back than that. Older comparable uploads may
                  exist that this baseline does not include.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Comparable uploads */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">
                Comparable uploads used as the baseline ({rm.comparables.length})
              </CardTitle>
              <SourceTag source="youtube-api" />
            </CardHeader>
            <CardContent>
              {rm.comparables.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No comparable uploads were found, so no baseline exists.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2 pr-3 font-medium">Published</th>
                        <th className="py-2 pr-3 font-medium">Title</th>
                        <th className="py-2 pr-3 font-medium text-right">Views</th>
                        <th className="py-2 pr-3 font-medium text-right">Length</th>
                        <th className="py-2 font-medium text-right">Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rm.comparables.map((c) => (
                        <tr key={c.id} className="border-b border-border/50">
                          <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                            {formatDate(c.publishedAt)}
                          </td>
                          <td className="py-2 pr-3 max-w-md truncate">
                            <a
                              className="hover:text-primary"
                              href={`https://www.youtube.com/watch?v=${c.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {c.title}
                            </a>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatNumber(c.views)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                            {formatDuration(c.durationSeconds)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {c.dayGapFromTarget}d
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Collection + legacy */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Collection</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1 text-muted-foreground">
                <p>
                  Scanned {data.collection.uploadsScanned} upload ids from the
                  channel&apos;s uploads playlist
                  {data.collection.scannedWholeChannel
                    ? " (the whole channel)"
                    : ` (capped at ${data.collection.maxUploadsScanned})`}
                  .
                </p>
                <p>
                  {data.collection.uploadsRetrieved} returned full metadata;{" "}
                  {data.collection.unavailableUploads} were unavailable.
                </p>
                <p>
                  Oldest upload scanned:{" "}
                  {data.collection.oldestUploadScanned
                    ? formatDate(data.collection.oldestUploadScanned)
                    : "—"}
                </p>
                <p>
                  Estimated cost: {data.collection.estimatedQuotaUnits} quota
                  units. No search.list was used.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">
                  Legacy score, for comparison
                </CardTitle>
                <SourceTag source="legacy" />
              </CardHeader>
              <CardContent className="text-sm space-y-1 text-muted-foreground">
                <p>
                  <span className="text-foreground font-medium">
                    {data.legacy.ratio === null
                      ? "unavailable"
                      : `${data.legacy.ratio}×`}
                  </span>{" "}
                  against a lifetime channel average of{" "}
                  {formatNumber(data.legacy.channelLifetimeAverageViews)} views.
                </p>
                <p className="font-mono text-xs">{data.legacy.formulaVersion}</p>
                <p>{data.legacy.note}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">Manual observation</CardTitle>
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">Manual observation</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Record what you saw in the title, thumbnail, promise, format, or production style. This is qualitative evidence, not a measured YouTube fact.</p>
              <Textarea value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Example: The thumbnail makes a specific before/after promise; the first 30 seconds prove it with a screen recording." />
              <div className="flex items-center gap-3"><Button size="sm" variant="outline" disabled={!observation.trim() || observationState === "Saving…"} onClick={saveObservation}>Save observation</Button>{observationState && <span className="text-xs text-muted-foreground">{observationState}</span>}</div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function OutlierLabPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <OutlierLab />
    </Suspense>
  );
}
