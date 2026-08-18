"use client";

/**
 * Advanced: the machinery behind the four main screens. Nothing here is needed
 * to make a video — it is the quota budget, the collection ledger, the tracked
 * channels, the measured growth and the Codex research queue, kept visible
 * because they are what the rest of the app actually spends and records.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceRequired } from "@/components/workspace-required";
import { useWorkspace } from "@/hooks/use-workspace";
import { AgeNormalizedReading, GrowthReadings, GrowthRow, Provenance, ProvenanceLegend } from "@/components/evidence-panels";

interface QuotaPolicy {
  dailyBudget: number;
  manualReserve: number;
  searchCacheHours: number;
  snapshotThinAfterDays: number;
}

interface CollectionStatus {
  quota: {
    policy: QuotaPolicy;
    used: number;
    reserved: number;
    availableForAutomated: number;
    availableTotal: number;
    byEndpoint: Array<{ endpoint: string; units: number; requests: number }>;
  };
  trackedChannels: Array<{ id: number; channelId: string; priority: string; refreshSchedule: string; lastRefreshedAt: string | null }>;
  jobs: Array<{ id: number; kind: string; status: string; scope: string; error: string | null; createdAt: string; quotaUnits: number }>;
  searches: Array<{ id: number; query: string; collectedAt: string; expiresAt: string }>;
  growth: GrowthRow[];
}

interface ResearchJob {
  id: number;
  status: string;
  intent: string;
  createdAt: string;
  error: string | null;
  evidence: unknown[];
  ideas: unknown[];
}

const STATUS_STYLE: Record<string, string> = {
  completed: "text-emerald-400",
  running: "text-sky-400",
  blocked: "text-amber-400",
  failed: "text-destructive",
};

export default function AdvancedPage() {
  const { workspaceId, activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const [status, setStatus] = useState<CollectionStatus | null>(null);
  const [policyDraft, setPolicyDraft] = useState<QuotaPolicy | null>(null);
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [planningNotes, setPlanningNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const [statusRes, jobRes, planRes] = await Promise.all([
        fetch(`/api/collection?workspaceId=${workspaceId}`),
        fetch(`/api/research-jobs?workspaceId=${workspaceId}`),
        fetch(`/api/query-plans?workspaceId=${workspaceId}`),
      ]);
      const body = await statusRes.json();
      if (!statusRes.ok) throw new Error(body.error || "Could not load collection status");
      setStatus(body);
      setPolicyDraft((draft) => draft ?? body.quota.policy);
      if (jobRes.ok) setJobs((await jobRes.json()).jobs);
      if (planRes.ok) setPlanningNotes((await planRes.json()).profile?.planningNotes ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load collection status");
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(body: object, kind: string) {
    if (!workspaceId) return null;
    setBusy(kind);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The request failed");
      return data;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The request failed");
      return null;
    } finally {
      setBusy(null);
      load();
    }
  }

  async function savePlanningNotes() {
    if (!workspaceId) return;
    setBusy("notes");
    const res = await fetch("/api/query-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveProfile", workspaceId, planningNotes }),
    });
    const body = await res.json();
    if (!res.ok) toast.error(body.error || "Could not save the planning notes");
    else toast.success("Planning notes saved.");
    setBusy(null);
  }

  async function requeue(id: number) {
    const res = await fetch("/api/research-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume", workspaceId, id }),
    });
    const body = await res.json();
    if (!res.ok) toast.error(body.error || "Could not requeue the job");
    else {
      toast.success("Job returned to the queue");
      load();
    }
  }

  if (workspaceLoading) return null;
  if (workspaceId === null)
    return (
      <main className="mx-auto max-w-4xl p-8">
        <WorkspaceRequired action="see its collection settings" />
      </main>
    );

  const quota = status?.quota;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8 animate-fade-in-up">
      <header className="space-y-2 border-b pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Advanced · {activeWorkspace?.name}</p>
        <h1 className="text-3xl font-bold tracking-tight">Machinery</h1>
        <p className="text-muted-foreground">
          The quota budget, the cache, the collection ledger and the research queue. You do not need any of this to make a video.
        </p>
      </header>

      {/* ── Budget ─────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Collection budget and cache</CardTitle>
            <CardDescription>
              Automated jobs stop before touching the manual reserve. Unsettled reservations count against the budget, so two jobs cannot spend the
              same units.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => post({ action: "prune" }, "prune")}>
            <Trash2 className={`mr-2 h-4 w-4 ${busy === "prune" ? "animate-pulse" : ""}`} />
            Thin old snapshots
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <p>
              <span className="text-muted-foreground">Settled today</span>
              <br />
              <b>{quota?.used ?? "—"}</b> units
            </p>
            <p>
              <span className="text-muted-foreground">Reserved in flight</span>
              <br />
              <b>{quota?.reserved ?? "—"}</b> units
            </p>
            <p>
              <span className="text-muted-foreground">Automated remaining</span>
              <br />
              <b>{quota?.availableForAutomated ?? "—"}</b> units
            </p>
            <p>
              <span className="text-muted-foreground">Manual remaining</span>
              <br />
              <b>{quota?.availableTotal ?? "—"}</b> of {quota?.policy.dailyBudget ?? "—"} units
            </p>
          </div>

          {quota && quota.byEndpoint.length > 0 && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {quota.byEndpoint.map((row) => (
                <div key={row.endpoint} className="flex justify-between gap-4">
                  <span className="truncate">{row.endpoint}</span>
                  <span>
                    {row.units} units · {row.requests} request(s)
                  </span>
                </div>
              ))}
            </div>
          )}

          {policyDraft && (
            <div className="grid items-end gap-3 border-t pt-4 sm:grid-cols-5">
              {(
                [
                  ["dailyBudget", "Daily budget"],
                  ["manualReserve", "Manual reserve"],
                  ["searchCacheHours", "Search cache (h)"],
                  ["snapshotThinAfterDays", "Thin after (days)"],
                ] as const
              ).map(([field, label]) => (
                <div className="space-y-1" key={field}>
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input
                    type="number"
                    min={field === "manualReserve" ? 0 : 1}
                    value={policyDraft[field]}
                    onChange={(event) => setPolicyDraft({ ...policyDraft, [field]: Number(event.target.value) })}
                  />
                </div>
              ))}
              <Button
                variant="outline"
                disabled={busy !== null}
                onClick={() => post({ action: "updatePolicy", ...policyDraft }, "policy").then((data) => data && toast.success("Budget updated."))}
              >
                {busy === "policy" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save budget"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Tracked channels ───────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Tracked channels</CardTitle>
            <CardDescription>
              Refreshing reads the uploads playlist, never keyword search, and writes a timestamped snapshot of the channel and each recent upload.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || !status?.trackedChannels.length}
            onClick={() =>
              post({ action: "refresh" }, "refresh").then((data) => {
                if (data) {
                  const { channels, failures, blocked } = data.result;
                  toast.success(`Refresh ${data.status}: ${channels.length} channel(s) collected, ${failures.length} failed.${blocked ? ` ${blocked}` : ""}`);
                }
              })
            }
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
            Refresh all
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!status?.trackedChannels.length ? (
            <p className="text-sm text-muted-foreground">
              No channels tracked in {activeWorkspace?.name ?? "this workspace"}. Track one from a result card in Find references.
            </p>
          ) : (
            status.trackedChannels.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
                <code>{item.channelId}</code>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    {item.priority} · {item.refreshSchedule} ·{" "}
                    {item.lastRefreshedAt ? `refreshed ${new Date(item.lastRefreshedAt).toLocaleString()}` : "never refreshed"}
                  </span>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => post({ action: "refresh", trackedChannelId: item.id }, "refresh")}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Measured growth ────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Measured growth</CardTitle>
            <CardDescription>
              Differences between real observations of the same video. Nothing here divides lifetime views by video age, so a video observed once has
              no rate — it says so instead.
            </CardDescription>
          </div>
          <Provenance kind="calculated" />
        </CardHeader>
        <CardContent className="space-y-2">
          {!status?.growth.length ? (
            <p className="text-sm text-muted-foreground">Unavailable: track a channel and refresh it to record the first observations.</p>
          ) : (
            status.growth.map((row) => (
              <div key={row.videoId} className="space-y-1 rounded-md border p-3">
                <a className="font-mono text-xs hover:text-primary" href={`https://www.youtube.com/watch?v=${row.videoId}`} target="_blank" rel="noreferrer">
                  {row.videoId}
                </a>
                <GrowthReadings row={row} />
                <AgeNormalizedReading row={row} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Codex research queue ───────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Codex research queue</CardTitle>
          <CardDescription>
            Requests are created from the current video. They are worked locally by Codex — the browser never calls it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No research has been requested in this workspace.</p>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="space-y-1 rounded-md border p-3 text-sm">
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">
                      #{job.id} · <span className={STATUS_STYLE[job.status] ?? "text-muted-foreground"}>{job.status}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{job.intent}</p>
                  </div>
                  {job.status !== "completed" && (
                    <Button variant="outline" size="sm" onClick={() => requeue(job.id)}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      Requeue
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {job.evidence.length} sourced evidence item(s) · {job.ideas.length} generated idea(s)
                </p>
                {job.error && <p className="text-sm text-destructive">{job.error}</p>}
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            To work the queue: <code>npm run research:jobs -- list {workspaceId}</code>, then claim, inspect and complete the job.
          </p>
        </CardContent>
      </Card>

      {/* ── Collection ledger ──────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collection jobs</CardTitle>
          <CardDescription>What each run asked for, what it cost and what it could not collect.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!status?.jobs.length ? (
            <p className="text-sm text-muted-foreground">No collection has run in this workspace yet.</p>
          ) : (
            status.jobs.map((job) => (
              <div key={job.id} className="space-y-1 rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span>
                    <b>{job.kind}</b> <span className={STATUS_STYLE[job.status] ?? "text-muted-foreground"}>{job.status}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {job.quotaUnits} units · {new Date(job.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="overflow-x-auto whitespace-nowrap font-mono text-[11px] text-muted-foreground">{job.scope}</p>
                {job.error && <p className="text-xs text-destructive">{job.error}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {status && status.searches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stored searches</CardTitle>
            <CardDescription>Repeating one of these scopes before it expires costs no quota.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {status.searches.map((search) => (
              <div key={search.id} className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
                <span className="truncate">{search.query}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  collected {new Date(search.collectedAt).toLocaleString()} ·{" "}
                  {new Date(search.expiresAt) > new Date() ? `expires ${new Date(search.expiresAt).toLocaleString()}` : "expired"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Channel planning notes ─────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channel planning notes</CardTitle>
          <CardDescription>
            Free notes about this channel. They are stored next to the workspace, which remains the canonical channel identity; nothing generates
            searches from them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={6} value={planningNotes} onChange={(event) => setPlanningNotes(event.target.value)} placeholder="Expertise, sources, series, tone, topics to avoid…" />
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={savePlanningNotes}>
            {busy === "notes" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save notes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What the labels mean</CardTitle>
        </CardHeader>
        <CardContent>
          <ProvenanceLegend />
        </CardContent>
      </Card>
    </main>
  );
}
