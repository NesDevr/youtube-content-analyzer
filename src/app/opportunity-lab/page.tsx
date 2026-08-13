"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, FlaskConical, Loader2, RefreshCw, Search, Target } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { VideoResult } from "@/types/video";

type CollectionStatus = { quota: { policy: { dailyBudget: number; manualReserve: number; searchCacheHours: number }; used: number; availableForAutomated: number }; trackedChannels: Array<{ id: number; channelId: string; priority: string; refreshSchedule: string; lastRefreshedAt: string | null }>; jobs: Array<{ id: number; kind: string; status: string; createdAt: string; error: string | null }>; velocity: Array<{ videoId: string; measurement: { viewChange: number; intervalHours: number; viewsPer24Hours: number } | null }> };

function channelIdFromInput(input: string) {
  const value = input.trim();
  const match = value.match(/(?:youtube\.com\/channel\/)?(UC[\w-]{22})/i);
  return match?.[1] ?? null;
}

export default function OpportunityLabPage() {
  const { workspaceId, activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("");
  const [results, setResults] = useState<VideoResult[]>([]);
  const [scope, setScope] = useState("");
  const [status, setStatus] = useState<CollectionStatus | null>(null);
  const [busy, setBusy] = useState<"discover" | "track" | "refresh" | null>(null);
  const [error, setError] = useState("");

  async function loadStatus() {
    if (!workspaceId) return;
    const res = await fetch(`/api/collection?workspaceId=${workspaceId}`);
    const body = await res.json();
    if (res.ok) setStatus(body); else setError(body.error || "Could not load collection status");
  }
  useEffect(() => { loadStatus(); }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function action(body: object, kind: "discover" | "track" | "refresh") {
    if (!workspaceId) return;
    setBusy(kind); setError("");
    try {
      const res = await fetch("/api/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Collection failed");
      if (kind === "discover") { setResults(data.result.results); setScope(JSON.stringify(data.result.scope)); }
      if (kind === "track") setChannel("");
      await loadStatus();
    } catch (e) { setError(e instanceof Error ? e.message : "Collection failed"); }
    finally { setBusy(null); }
  }

  const trackId = channelIdFromInput(channel);
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8 animate-fade-in-up">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Evidence workbench</p>
        <h1 className="text-3xl font-bold tracking-tight">Opportunity Lab</h1>
        <p className="text-muted-foreground">Discover a limited set of seeds, track the channels worth revisiting, then inspect a video&apos;s transparent baseline. Nothing here claims private YouTube metrics.</p>
      </header>

      {!workspaceLoading && !workspaceId && <Card className="border-amber-500/40"><CardContent className="flex gap-2 pt-6 text-sm text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" />Select or create a non-archived channel workspace first.</CardContent></Card>}
      {error && <Card className="border-destructive"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><CardTitle className="text-base">Discover topic seeds</CardTitle></div><CardDescription>Uses YouTube search once, then caches the identical scope for {status?.quota.policy.searchCacheHours ?? 24} hours.</CardDescription></CardHeader>
          <CardContent className="flex gap-2"><Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && query.trim() && action({ action: "discover", query }, "discover")} placeholder="e.g. practical AI for solo businesses" /><Button disabled={!workspaceId || !query.trim() || busy !== null} onClick={() => action({ action: "discover", query }, "discover")}>{busy === "discover" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Discover"}</Button></CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /><CardTitle className="text-base">Track a known channel</CardTitle></div><CardDescription>Accepts a UC channel ID or a /channel/ URL. Refreshing uses the uploads playlist, never keyword search.</CardDescription></CardHeader>
          <CardContent className="flex gap-2"><Input value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="UC… or youtube.com/channel/UC…" /><Button disabled={!workspaceId || !trackId || busy !== null} onClick={() => action({ action: "track", channelId: trackId, priority: "tier-2", refreshSchedule: "weekly" }, "track")}>{busy === "track" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Track"}</Button></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-base">Collection budget</CardTitle><CardDescription>Costs are recorded per collection request. Automated jobs stop before consuming the manual reserve.</CardDescription></div><Button size="sm" variant="outline" disabled={!workspaceId || busy !== null} onClick={() => action({ action: "refresh" }, "refresh")}><RefreshCw className={`mr-2 h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />Refresh tracked</Button></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3"><p><span className="text-muted-foreground">Used today</span><br /><b>{status?.quota.used ?? "—"}</b> units</p><p><span className="text-muted-foreground">Automated remaining</span><br /><b>{status?.quota.availableForAutomated ?? "—"}</b> units</p><p><span className="text-muted-foreground">Manual reserve</span><br /><b>{status?.quota.policy.manualReserve ?? "—"}</b> of {status?.quota.policy.dailyBudget ?? "—"} units</p></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Observed growth</CardTitle><CardDescription>Calculated only from two or more public snapshots at least 24 hours apart. It never substitutes lifetime views divided by video age.</CardDescription></CardHeader>
        <CardContent>{!status?.velocity.length ? <p className="text-sm text-muted-foreground">Unavailable: refresh a tracked channel at least twice, with 24 hours between observations.</p> : <div className="space-y-2">{status.velocity.slice(0, 10).map(({ videoId, measurement }) => <div className="flex items-center justify-between rounded-md border p-3 text-sm" key={videoId}><code>{videoId}</code><span className="text-muted-foreground">{measurement ? `${measurement.viewChange.toLocaleString()} views over ${measurement.intervalHours}h · ${measurement.viewsPer24Hours.toLocaleString()} views/24h` : "Unavailable: fewer than two snapshots at least 24h apart."}</span></div>)}</div>}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tracked channels</CardTitle><CardDescription>Priority and schedule are stored per workspace; refreshes create timestamped channel and video snapshots.</CardDescription></CardHeader>
        <CardContent>{!status?.trackedChannels.length ? <p className="text-sm text-muted-foreground">No channels tracked in {activeWorkspace?.name ?? "this workspace"}.</p> : <div className="space-y-2">{status.trackedChannels.map((item) => <div key={item.id} className="flex items-center justify-between rounded-md border p-3 text-sm"><code>{item.channelId}</code><span className="text-muted-foreground">{item.priority} · {item.refreshSchedule} · {item.lastRefreshedAt ? `refreshed ${new Date(item.lastRefreshedAt).toLocaleDateString()}` : "not refreshed"}</span></div>)}</div>}</CardContent>
      </Card>

      {results.length > 0 && <Card>
        <CardHeader><div className="flex items-center justify-between gap-4"><div><CardTitle className="text-base">Discovery results <Badge variant="outline" className="ml-2">YouTube API</Badge></CardTitle><CardDescription>{scope ? "Scope, language, region, duration and collection time are stored with this search." : ""}</CardDescription></div><Badge variant="secondary">{results.length} videos</Badge></div></CardHeader>
        <CardContent className="space-y-2">{results.map((video) => <div key={video.id} className="flex items-center justify-between gap-4 rounded-md border p-3"><div className="min-w-0"><a className="font-medium hover:text-primary" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">{video.title}</a><p className="truncate text-sm text-muted-foreground">{video.channelName} · {video.views.toLocaleString()} views · legacy lifetime-average ratio: {video.outlierScore === null ? "unavailable" : `${video.outlierScore}×`}</p></div><Link className="inline-flex h-8 items-center rounded-md border border-input px-3 text-xs font-medium hover:bg-accent" href={`/outlier-lab?v=${video.id}`}><FlaskConical className="mr-1 h-3.5 w-3.5" />Inspect</Link></div>)}</CardContent>
      </Card>}
    </div>
  );
}
