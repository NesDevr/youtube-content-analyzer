"use client";

/**
 * Presentation for the Opportunity Lab.
 *
 * Every panel here states where its numbers came from. The vocabulary is fixed
 * in `PROVENANCE` and used as a badge on each panel, so an API fact, a figure
 * this app calculated, an estimate and something the user typed can never be
 * read as the same kind of evidence.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  Maximize2,
  Network,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ── Provenance ─────────────────────────────────────────

export type ProvenanceKind = "api" | "calculated" | "estimate" | "manual" | "ai" | "legacy";

const PROVENANCE: Record<ProvenanceKind, { text: string; className: string }> = {
  api: { text: "YouTube API fact", className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  calculated: { text: "Calculated here", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  estimate: { text: "Estimate", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  manual: { text: "Manual observation", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  ai: { text: "AI assessment", className: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" },
  legacy: { text: "Legacy metric", className: "bg-muted text-muted-foreground" },
};

export function Provenance({ kind }: { kind: ProvenanceKind }) {
  const { text, className } = PROVENANCE[kind];
  return <Badge className={`shrink-0 text-[10px] font-medium ${className}`}>{text}</Badge>;
}

export function ProvenanceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Every panel is labelled by what produced it:</span>
      {(Object.keys(PROVENANCE) as ProvenanceKind[]).map((kind) => (
        <Provenance key={kind} kind={kind} />
      ))}
    </div>
  );
}

// ── Shared shapes ──────────────────────────────────────

export interface VelocityReading {
  viewChange: number;
  intervalHours: number;
  viewsPer24Hours: number;
  from: string;
  to: string;
}

export interface GrowthRow {
  videoId: string;
  channelId: string;
  latestViews: number | null;
  latestCollectedAt: string;
  snapshotCount: number;
  velocity: {
    daily: VelocityReading | null;
    dailyUnavailable: string;
    multiDay: VelocityReading | null;
    multiDayUnavailable: string;
  };
  ageNormalized: {
    status: string;
    ratio: number | null;
    sampleSize: number;
    explanation: string;
  } | null;
  ageNormalizedUnavailable: string;
}

export interface Comparable {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  durationSeconds: number;
  dayGapFromTarget: number;
}

export interface SiblingRow {
  id: string;
  title: string;
  views: number | null;
  ratio: number | null;
  sampleSize: number;
  explanation: string;
}

/** A video the user can look at, select and save, wherever it was found. */
export interface EvidenceVideo {
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  channelSubscribers?: number | null;
  views: number | null;
  publishedAt: string;
  thumbnailUrl: string;
  format: string;
  /** The scope it was found under; empty for a directly pasted video. */
  language?: string;
  region?: string;
  sourceQuery?: string;
}

export interface AnalyzeResponse {
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
  channel: { id: string; name: string; subscribers: number | null; uploadsPlaylistId: string };
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
  growth: GrowthRow | null;
  siblings: SiblingRow[];
  uploadsScored: number;
  uploadsWithoutBaseline: number;
  legacy: {
    metric: string;
    formulaVersion: string;
    ratio: number | null;
    channelLifetimeAverageViews: number | null;
    note: string;
  };
}

// ── Formatting ─────────────────────────────────────────

export function number(value: number | null | undefined) {
  return value === null || value === undefined ? "unavailable" : value.toLocaleString("en-US");
}

export function shortDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** A reading always states the interval it was measured over. */
function readingText(reading: VelocityReading) {
  return `${reading.viewChange >= 0 ? "+" : ""}${reading.viewChange.toLocaleString()} views over ${reading.intervalHours} h · ${reading.viewsPer24Hours.toLocaleString()}/24 h`;
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
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-2xl font-bold ${className}`}>
      {ratio}×
    </span>
  );
}

// ── Video evidence ─────────────────────────────────────

export function RawStatistics({
  target,
  channel,
  onEnlarge,
}: {
  target: AnalyzeResponse["target"];
  channel: AnalyzeResponse["channel"];
  onEnlarge: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Raw statistics</CardTitle>
          <CardDescription>Exactly what videos.list and channels.list returned. Nothing here is derived.</CardDescription>
        </div>
        <Provenance kind="api" />
      </CardHeader>
      <CardContent className="flex gap-4">
        <button type="button" onClick={onEnlarge} className="group relative shrink-0" title="Enlarge thumbnail">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={target.thumbnailUrl} alt={target.title} className="w-48 rounded-lg" />
          <span className="absolute inset-0 hidden items-center justify-center rounded-lg bg-black/50 group-hover:flex">
            <Maximize2 className="h-5 w-5 text-white" />
          </span>
        </button>
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{target.title}</p>
          <p className="text-sm text-muted-foreground">
            {target.channelName}
            {channel.subscribers === null
              ? " · subscriber count hidden by the channel"
              : ` · ${number(channel.subscribers)} subscribers`}
          </p>
          <p className="text-sm text-muted-foreground">
            {number(target.views)} views · {number(target.likes)} likes · {number(target.comments)} comments
          </p>
          <p className="text-sm text-muted-foreground">
            Published {shortDate(target.publishedAt)} · {duration(target.durationSeconds)} ·{" "}
            <Badge variant="outline">{target.format}</Badge>
          </p>
          <a
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            href={`https://www.youtube.com/watch?v=${target.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Open on YouTube <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export function RecentMedianPanel({
  recentMedian: rm,
  collection,
}: {
  recentMedian: AnalyzeResponse["recentMedian"];
  collection: AnalyzeResponse["collection"];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Recent-median performance</CardTitle>
          <CardDescription>This video against the median of comparable recent uploads on its own channel.</CardDescription>
        </div>
        <Provenance kind="calculated" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {rm.status === "ok" && rm.ratio !== null ? (
            <span data-testid="recent-median-ratio">{ratioBadge(rm.ratio)}</span>
          ) : (
            <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-400" data-testid="recent-median-status">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {rm.status === "insufficient_sample"
                ? "Insufficient data"
                : rm.status === "zero_baseline"
                  ? "Baseline is zero"
                  : "Target views unavailable"}
            </Badge>
          )}
          <div className="text-sm text-muted-foreground">{rm.explanation}</div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Metric</dt>
            <dd className="font-mono text-xs">{rm.metric}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Formula version</dt>
            <dd className="font-mono text-xs">{rm.formulaVersion}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Baseline median views</dt>
            <dd>{number(rm.baselineMedianViews)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Sample size and confidence</dt>
            <dd>
              {rm.sampleSize} of max {rm.maxSampleSize} · {rm.sampleSize >= rm.minSampleSize
                ? `at or above the ${rm.minSampleSize} required`
                : `below the ${rm.minSampleSize} required, so no ratio is shown`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Comparison window</dt>
            <dd>±{rm.comparisonWindowDays} days</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Format compared</dt>
            <dd>{rm.format}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Sample date range</dt>
            <dd>{rm.windowStart ? `${shortDate(rm.windowStart)} → ${shortDate(rm.windowEnd)}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Collected at</dt>
            <dd>{new Date(rm.collectedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Views hidden by YouTube</dt>
            <dd>{rm.excludedUnavailable} in-window upload(s)</dd>
          </div>
        </dl>

        {collection.baselineWindowTruncated && (
          <p className="text-xs text-amber-400">
            Only the {collection.maxUploadsScanned} most recent uploads were scanned, and the ±
            {rm.comparisonWindowDays} day window reaches further back than that. Older comparable uploads may exist
            that this baseline does not include.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function GrowthReadings({ row }: { row: GrowthRow | null }) {
  if (!row) {
    return (
      <p className="text-sm text-muted-foreground">
        Unavailable — this video has been observed once. A rate needs two observations, so analyze or refresh it again
        later.
      </p>
    );
  }
  return (
    <div className="space-y-1 text-sm">
      <p className="text-muted-foreground">
        {number(row.latestViews)} views at the latest of {row.snapshotCount} observation(s) ·{" "}
        {new Date(row.latestCollectedAt).toLocaleString()}
      </p>
      <p className="flex items-start gap-2 text-xs">
        <Clock className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
        <span className="shrink-0 text-muted-foreground">24 h:</span>
        {row.velocity.daily ? (
          <span>{readingText(row.velocity.daily)}</span>
        ) : (
          <span className="text-muted-foreground">Unavailable — {row.velocity.dailyUnavailable}</span>
        )}
      </p>
      <p className="flex items-start gap-2 text-xs">
        <Clock className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
        <span className="shrink-0 text-muted-foreground">Multi-day:</span>
        {row.velocity.multiDay ? (
          <span>{readingText(row.velocity.multiDay)}</span>
        ) : (
          <span className="text-muted-foreground">Unavailable — {row.velocity.multiDayUnavailable}</span>
        )}
      </p>
    </div>
  );
}

export function AgeNormalizedReading({ row }: { row: GrowthRow | null }) {
  if (!row) {
    return (
      <p className="text-sm text-muted-foreground">
        Unavailable — no stored observation of this video to compare at a matching age.
      </p>
    );
  }
  const reading = row.ageNormalized;
  return (
    <p className="text-sm">
      {reading?.status === "ok" ? (
        <>
          <b>{reading.ratio}×</b> <span className="text-muted-foreground">— {reading.explanation}</span>
        </>
      ) : (
        <span className="text-muted-foreground">
          Unavailable — {reading?.explanation ?? row.ageNormalizedUnavailable}
        </span>
      )}
    </p>
  );
}

export function MeasuredEvidence({ growth }: { growth: GrowthRow | null }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Measured velocity</CardTitle>
            <CardDescription>Differences between real observations, never lifetime views ÷ age.</CardDescription>
          </div>
          <Provenance kind="calculated" />
        </CardHeader>
        <CardContent>
          <GrowthReadings row={growth} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Age-normalized evidence</CardTitle>
            <CardDescription>Against sibling uploads observed at a comparable age.</CardDescription>
          </div>
          <Provenance kind="calculated" />
        </CardHeader>
        <CardContent>
          <AgeNormalizedReading row={growth} />
        </CardContent>
      </Card>
    </div>
  );
}

export function ComparablesTable({ comparables }: { comparables: Comparable[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Comparable uploads behind the baseline ({comparables.length})</CardTitle>
          <CardDescription>The exact videos whose median the ratio was divided by.</CardDescription>
        </div>
        <Provenance kind="api" />
      </CardHeader>
      <CardContent>
        {comparables.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comparable uploads were found, so no baseline exists.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Published</th>
                  <th className="py-2 pr-3 font-medium">Title</th>
                  <th className="py-2 pr-3 text-right font-medium">Views</th>
                  <th className="py-2 pr-3 text-right font-medium">Length</th>
                  <th className="py-2 text-right font-medium">Gap</th>
                </tr>
              </thead>
              <tbody>
                {comparables.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{shortDate(row.publishedAt)}</td>
                    <td className="max-w-md truncate py-2 pr-3">
                      <a
                        className="hover:text-primary"
                        href={`https://www.youtube.com/watch?v=${row.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.title}
                      </a>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{number(row.views)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {duration(row.durationSeconds)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{row.dayGapFromTarget}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SiblingPanel({
  siblings,
  scored,
  withoutBaseline,
  title,
  description,
}: {
  siblings: SiblingRow[];
  scored: number;
  withoutBaseline: number;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>
            {description} {scored} upload(s) scored, of which the {siblings.length} highest are shown;{" "}
            {withoutBaseline} had too few comparable uploads of their format to score.
          </CardDescription>
        </div>
        <Provenance kind="calculated" />
      </CardHeader>
      <CardContent className="space-y-2">
        {siblings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Unavailable: no upload on this channel has enough comparable uploads to produce a baseline.
          </p>
        ) : (
          siblings.map((sibling) => (
            <div key={sibling.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-4">
                <a
                  className="min-w-0 truncate font-medium hover:text-primary"
                  href={`https://www.youtube.com/watch?v=${sibling.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {sibling.title}
                </a>
                <Badge variant="secondary">{sibling.ratio}× recent median</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{sibling.explanation}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function LegacyPanel({ legacy }: { legacy: AnalyzeResponse["legacy"] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Legacy score, for comparison</CardTitle>
        <Provenance kind="legacy" />
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">
            {legacy.ratio === null ? "unavailable" : `${legacy.ratio}×`}
          </span>{" "}
          against a lifetime channel average of {number(legacy.channelLifetimeAverageViews)} views.
        </p>
        <p className="font-mono text-xs">{legacy.formulaVersion}</p>
        <p>{legacy.note}</p>
      </CardContent>
    </Card>
  );
}

// ── Discovery cards, enlargement and comparison ────────

export function VideoCard({
  video,
  selected,
  onToggle,
  onEnlarge,
  onExpand,
  onTrack,
  onInspect,
  disabled,
}: {
  video: EvidenceVideo;
  selected: boolean;
  onToggle: () => void;
  onEnlarge: () => void;
  onExpand: () => void;
  onTrack: () => void;
  onInspect: () => void;
  disabled: boolean;
}) {
  return (
    <div className={`overflow-hidden rounded-lg border ${selected ? "border-primary" : ""}`}>
      <div className="relative">
        <button type="button" onClick={onEnlarge} className="group block w-full" title="Enlarge thumbnail">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={video.thumbnailUrl} alt={video.title} className="aspect-video w-full object-cover" />
          <span className="absolute inset-0 hidden items-center justify-center bg-black/50 group-hover:flex">
            <Maximize2 className="h-6 w-6 text-white" />
          </span>
        </button>
        <label className="absolute left-2 top-2 flex items-center gap-2 rounded-md bg-background/90 px-2 py-1 text-xs">
          <Checkbox checked={selected} onCheckedChange={onToggle} />
          Select
        </label>
        <Badge variant="secondary" className="absolute right-2 top-2 text-[10px]">
          {video.format}
        </Badge>
      </div>
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 text-sm font-medium" title={video.title}>
          {video.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {video.channelName} · {number(video.views)} views · {shortDate(video.publishedAt)}
          {video.channelSubscribers !== undefined && ` · ${number(video.channelSubscribers)} subscribers`}
        </p>
        <p className="text-xs text-muted-foreground">
          Found by{" "}
          {video.sourceQuery ? (
            <>
              <span className="text-foreground">“{video.sourceQuery}”</span>
              {video.language ? ` · ${video.language}` : ""}
              {video.region ? ` · ${video.region}` : ""}
            </>
          ) : (
            "direct lookup"
          )}
          . No outlier ratio is claimed until this video is inspected.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={disabled} onClick={onInspect}>
            Inspect
          </Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={onExpand}>
            <Network className="mr-1 h-3.5 w-3.5" />
            Channel
          </Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={onTrack}>
            <Target className="mr-1 h-3.5 w-3.5" />
            Track
          </Button>
          <a
            className="inline-flex h-8 items-center rounded-md border border-input px-3 text-xs font-medium hover:bg-accent"
            href={`https://www.youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            YouTube
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Enlarges one thumbnail over the page. It is a dialog rather than a route so
 * the discovery results, the selection and the scroll position are all still
 * there when it closes.
 */
export function ThumbnailViewer({ video, onClose }: { video: EvidenceVideo | null; onClose: () => void }) {
  return (
    <Dialog open={video !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        {video && (
          <div className="space-y-3">
            <DialogTitle className="pr-8 text-sm">{video.title}</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={video.thumbnailUrl} alt={video.title} className="w-full rounded-lg" />
            <p className="text-xs text-muted-foreground">
              {video.channelName} · {number(video.views)} views · {shortDate(video.publishedAt)} · {video.format}
            </p>
            <a
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Open the source video in a new tab <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ComparisonGrid({
  videos,
  onRemove,
  onEnlarge,
}: {
  videos: EvidenceVideo[];
  onRemove: (id: string) => void;
  onEnlarge: (video: EvidenceVideo) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {videos.map((video) => (
        <div key={video.id} className="space-y-2 rounded-lg border p-2">
          <button type="button" onClick={() => onEnlarge(video)} className="block w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={video.thumbnailUrl} alt={video.title} className="aspect-video w-full rounded object-cover" />
          </button>
          <p className="line-clamp-3 text-xs font-medium">{video.title}</p>
          <p className="text-[11px] text-muted-foreground">
            {video.channelName} · {number(video.views)} views · {shortDate(video.publishedAt)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {video.sourceQuery ? `“${video.sourceQuery}”` : "direct lookup"}
            {video.language ? ` · ${video.language}` : ""}
            {video.region ? ` · ${video.region}` : ""}
          </p>
          <Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={() => onRemove(video.id)}>
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

// ── Manual observations ────────────────────────────────

export interface ObservationFields {
  topic: string;
  viewerPromise: string;
  titleThumbnail: string;
  formatNotes: string;
  productionStyle: string;
  notes: string;
}

const OBSERVATION_FIELDS: Array<[keyof ObservationFields, string, string]> = [
  ["topic", "Topic", "What the video is actually about"],
  ["viewerPromise", "Promise", "What the viewer is promised in return for their time"],
  ["titleThumbnail", "Title and thumbnail", "The mechanism the packaging uses"],
  ["formatNotes", "Format", "How the video is structured"],
  ["productionStyle", "Production style", "How it is shot, edited and voiced"],
  ["notes", "Anything else", "Notes that do not fit the fields above"],
];

const EMPTY_OBSERVATION: ObservationFields = {
  topic: "",
  viewerPromise: "",
  titleThumbnail: "",
  formatNotes: "",
  productionStyle: "",
  notes: "",
};

export function ObservationForm({
  entityLabel,
  onSave,
  saved,
}: {
  entityLabel: string;
  onSave: (fields: ObservationFields) => Promise<void>;
  saved: Array<{ id: number; createdAt: string } & ObservationFields>;
}) {
  const [fields, setFields] = useState<ObservationFields>(EMPTY_OBSERVATION);
  const [state, setState] = useState("");
  const filled = Object.values(fields).some((value) => value.trim());

  async function save() {
    setState("Saving…");
    try {
      await onSave(fields);
      setFields(EMPTY_OBSERVATION);
      setState("Saved as a manual observation.");
    } catch (error) {
      setState(error instanceof Error ? error.message : "Could not save the observation");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Manual observations · {entityLabel}</CardTitle>
          <CardDescription>
            What you saw with your own eyes. This is qualitative evidence recorded next to the measurements, never
            mixed into them.
          </CardDescription>
        </div>
        <Provenance kind="manual" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          {OBSERVATION_FIELDS.map(([field, label, placeholder]) => (
            <div className="space-y-1" key={field}>
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Textarea
                rows={2}
                value={fields[field]}
                placeholder={placeholder}
                onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" disabled={!filled || state === "Saving…"} onClick={save}>
            Save observation
          </Button>
          {state && <span className="text-xs text-muted-foreground">{state}</span>}
        </div>

        {saved.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            {saved.map((observation) => (
              <div key={observation.id} className="rounded-md border p-3 text-xs">
                <p className="text-muted-foreground">{new Date(observation.createdAt).toLocaleString()}</p>
                {OBSERVATION_FIELDS.map(([field, label]) =>
                  observation[field] ? (
                    <p key={field}>
                      <span className="text-muted-foreground">{label}: </span>
                      {observation[field]}
                    </p>
                  ) : null
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Saving a reference set ─────────────────────────────

export function ReferenceSaveForm({
  uses,
  workspaces,
  activeWorkspaceId,
  count,
  onSave,
}: {
  uses: string[];
  workspaces: Array<{ id: number; name: string }>;
  activeWorkspaceId: number | null;
  count: number;
  onSave: (input: { name: string; question: string; use: string; workspaceIds: number[] }) => Promise<string>;
}) {
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [use, setUse] = useState(uses[0] ?? "topic");
  const [targets, setTargets] = useState<number[]>(() => (activeWorkspaceId ? [activeWorkspaceId] : []));
  const [state, setState] = useState("");

  async function save() {
    setState("Saving…");
    try {
      setState(await onSave({ name: name.trim(), question: question.trim(), use, workspaceIds: targets }));
    } catch (error) {
      setState(error instanceof Error ? error.message : "Could not save the reference set");
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Collection name</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Curiosity hooks" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Research question</Label>
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What this set is meant to answer"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Keep these as evidence about</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={use}
            onChange={(event) => setUse(event.target.value)}
          >
            {uses.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Save into</Label>
        <div className="flex flex-wrap gap-3">
          {workspaces.map((workspace) => (
            <label key={workspace.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={targets.includes(workspace.id)}
                onCheckedChange={() =>
                  setTargets((current) =>
                    current.includes(workspace.id)
                      ? current.filter((id) => id !== workspace.id)
                      : [...current, workspace.id]
                  )
                }
              />
              {workspace.name}
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={!name.trim() || !targets.length || count === 0 || state === "Saving…"}
          onClick={save}
        >
          Save {count} reference(s)
        </Button>
        {state && <span className="text-xs text-muted-foreground">{state}</span>}
      </div>
    </div>
  );
}
