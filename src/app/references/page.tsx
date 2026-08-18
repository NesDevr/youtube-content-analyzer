"use client";

/**
 * Find references: one question, a set of suggested searches you approve, the
 * price of running them, and the thumbnails that come back. Pasting a video or
 * channel link instead runs the outlier engine on it, so verification stays one
 * box away without a second page.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus, Search, X } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { WorkspaceRequired } from "@/components/workspace-required";
import {
  AnalyzeResponse,
  ComparablesTable,
  ComparisonGrid,
  EvidenceVideo,
  LegacyPanel,
  MeasuredEvidence,
  ObservationFields,
  ObservationForm,
  RawStatistics,
  RecentMedianPanel,
  ReferenceSaveForm,
  SiblingPanel,
  SiblingRow,
  ThumbnailViewer,
  VideoCard,
} from "@/components/evidence-panels";

interface DiscoveryScope {
  query: string;
  language: string;
  region: string;
  publishedAfter: string;
  publishedBefore: string;
  duration: string;
  maxResults: number;
}

interface DiscoveryPayload {
  scope: DiscoveryScope;
  seeds: Array<{
    id: string;
    title: string;
    channelId: string;
    channelName: string;
    channelSubscribers: number | null;
    views: number | null;
    durationSeconds: number;
    publishedAt: string;
    thumbnailUrl: string;
    format: string;
  }>;
  collectedAt: string;
  quotaUnits: number;
  unavailableVideoIds: string[];
  channelsWithoutStats: string[];
}

interface ExpansionResult {
  channel: { id: string; name: string; subscribers: number | null };
  collection: {
    uploadsScanned: number;
    uploadsRetrieved: number;
    unavailableUploads: number;
    scannedWholeChannel: boolean;
    quotaUnits: number;
    collectedAt: string;
  };
  siblings: SiblingRow[];
  uploadsScored: number;
  uploadsWithoutBaseline: number;
}

interface PlannedQuery {
  scope: DiscoveryScope;
  mechanism: string;
  cached: boolean;
  cacheExpiresAt: string | null;
  maxQuotaUnits: number;
}

interface DiscoverySetPlan {
  queries: PlannedQuery[];
  maxQuotaUnits: number;
  availableForAutomated: number;
  exceedsBudget: boolean;
}

interface EvidenceGroup {
  key: string;
  scope: DiscoveryScope;
  mechanism: string;
  cached: boolean;
  collectedAt: string;
  quotaUnits: number;
  note: string;
  videos: EvidenceVideo[];
  unavailableVideoIds: string[];
  channelsWithoutStats: string[];
  error: string | null;
}

/** A suggested or hand-written search, before anything is spent on it. */
interface Suggestion {
  key: string;
  query: string;
  purpose: string;
  mechanism: string;
  reason: string;
  language: string;
  region: string;
  selected: boolean;
}

type Busy = "suggest" | "price" | "run" | "analyze" | "expand" | "related" | null;

const FORMATS = ["all", "long-form", "short", "livestream"] as const;
const SORTS = ["views", "newest", "oldest"] as const;
const MAX_QUERIES = 6;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /(UC[\w-]{22})/;

/** A routing hint only: the server re-parses what it is sent and rejects what it cannot read. */
function detectEntry(input: string): { kind: "video" | "channel" | "topic"; value: string } {
  const trimmed = input.trim();
  const channel = trimmed.match(CHANNEL_ID);
  if (channel && (trimmed === channel[1] || /youtube\.com\/channel\//i.test(trimmed))) {
    return { kind: "channel", value: channel[1] };
  }
  if (VIDEO_ID.test(trimmed)) return { kind: "video", value: trimmed };
  if (/^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(trimmed)) {
    return { kind: "video", value: trimmed };
  }
  return { kind: "topic", value: trimmed };
}

function toEvidenceVideos(payload: DiscoveryPayload): EvidenceVideo[] {
  return payload.seeds.map((seed) => ({
    id: seed.id,
    title: seed.title,
    channelId: seed.channelId,
    channelName: seed.channelName,
    channelSubscribers: seed.channelSubscribers,
    views: seed.views,
    publishedAt: seed.publishedAt,
    thumbnailUrl: seed.thumbnailUrl,
    format: seed.format,
    language: payload.scope.language,
    region: payload.scope.region,
    sourceQuery: payload.scope.query,
  }));
}

function FindReferences() {
  const { workspaceId, activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const searchParams = useSearchParams();

  const [question, setQuestion] = useState(() => searchParams.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [plan, setPlan] = useState<DiscoverySetPlan | null>(null);
  const [groups, setGroups] = useState<EvidenceGroup[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [expansion, setExpansion] = useState<ExpansionResult | null>(null);
  const [observations, setObservations] = useState<Array<{ id: number; createdAt: string } & ObservationFields>>([]);

  const [selected, setSelected] = useState<EvidenceVideo[]>([]);
  const [enlarged, setEnlarged] = useState<EvidenceVideo | null>(null);
  const [formatFilter, setFormatFilter] = useState<(typeof FORMATS)[number]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("views");

  // Scope. Defaults come from the workspace, and stay out of the way until opened.
  const [language, setLanguage] = useState("");
  const [region, setRegion] = useState("");
  const [maxResults, setMaxResults] = useState(25);
  const [publishedAfter, setPublishedAfter] = useState("");

  const [references, setReferences] = useState<{
    uses: string[];
    workspaces: Array<{ id: number; name: string }>;
    collections: Array<{ id: number; name: string; question: string; items: Array<{ id: number; use: string }> }>;
  } | null>(null);

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const disabled = !workspaceId || busy !== null;

  useEffect(() => {
    setLanguage(activeWorkspace?.language ?? "");
    setRegion(activeWorkspace?.country ?? "");
  }, [activeWorkspace]);

  const loadReferences = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch(`/api/references?workspaceId=${workspaceId}`);
    const body = await res.json();
    if (res.ok) setReferences(body);
  }, [workspaceId]);

  useEffect(() => {
    setSuggestions([]);
    setPlan(null);
    setGroups([]);
    setSelected([]);
    setAnalysis(null);
    setExpansion(null);
    loadReferences();
  }, [workspaceId, loadReferences]);

  async function post(body: object, kind: Exclude<Busy, null>) {
    if (!workspaceId) return null;
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The request failed");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const approved = useMemo(() => suggestions.filter((row) => row.selected && row.query.trim()), [suggestions]);

  const queries = useCallback(
    () =>
      approved.slice(0, MAX_QUERIES).map((row) => ({
        query: row.query.trim(),
        language: row.language,
        region: row.region,
        mechanism: row.mechanism,
        maxResults,
        ...(publishedAfter ? { publishedAfter: new Date(publishedAfter).toISOString() } : {}),
      })),
    [approved, maxResults, publishedAfter]
  );

  // ── Suggest, price, run ──────────────────────────────

  async function suggest() {
    if (!workspaceId) return;
    setBusy("suggest");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/query-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", workspaceId, question: question.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not suggest searches");
      setSuggestions(
        body.plan.queries.map((row: { id: number; query: string; purpose: string; mechanism: string; generationReason: string; language: string; region: string }) => ({
          key: String(row.id),
          query: row.query,
          purpose: row.purpose,
          mechanism: row.mechanism,
          reason: row.generationReason,
          language: row.language || language,
          region: row.region || region,
          selected: true,
        }))
      );
      setPlan(null);
      setNotice("Nothing has been spent yet. Edit or uncheck any search, then price the set.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suggest searches");
    } finally {
      setBusy(null);
    }
  }

  async function price() {
    const set = queries();
    if (!set.length) return;
    const data = await post({ action: "planSet", queries: set }, "price");
    if (data) setPlan(data.plan);
  }

  async function run() {
    const set = queries();
    if (!set.length) return;
    const data = await post({ action: "discoverSet", queries: set }, "run");
    if (!data) return;
    const stamp = Date.now();
    const collected: EvidenceGroup[] = data.results.map(
      (
        row: { query: PlannedQuery; payload: DiscoveryPayload | null; cached: boolean; error: string | null },
        index: number
      ) => ({
        key: `set-${stamp}-${index}`,
        scope: row.query.scope,
        mechanism: row.query.mechanism,
        cached: row.cached,
        collectedAt: row.payload?.collectedAt ?? "",
        quotaUnits: row.payload && !row.cached ? row.payload.quotaUnits : 0,
        note: "",
        videos: row.payload ? toEvidenceVideos(row.payload) : [],
        unavailableVideoIds: row.payload?.unavailableVideoIds ?? [],
        channelsWithoutStats: row.payload?.channelsWithoutStats ?? [],
        error: row.error,
      })
    );
    setGroups((current) => [...collected, ...current]);
    setPlan(null);
    setNotice(
      `${data.spentQuotaUnits} quota units spent across ${collected.length} search(es).` + (data.blocked ? ` ${data.blocked}` : "")
    );
  }

  // ── Verification entry points ────────────────────────

  const loadObservations = useCallback(
    async (entityId: string) => {
      if (!workspaceId) return;
      const res = await fetch(`/api/observations?workspaceId=${workspaceId}&entityId=${entityId}`);
      const body = await res.json();
      if (res.ok) setObservations(body.observations);
    },
    [workspaceId]
  );

  async function analyzeVideo(url: string) {
    if (!workspaceId) return;
    setBusy("analyze");
    setError("");
    setNotice("");
    setAnalysis(null);
    try {
      const res = await fetch("/api/outlier/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, workspaceId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Analysis failed");
      setAnalysis(body);
      setExpansion(null);
      await loadObservations(body.target.id);
      setNotice(`Analyzed for ${body.collection.estimatedQuotaUnits} quota units — no keyword search was used.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(null);
    }
  }

  async function expandChannel(channelId: string) {
    const data = await post({ action: "expand", channelId }, "expand");
    if (!data) return;
    setExpansion(data.result);
    setAnalysis(null);
    await loadObservations(channelId);
    setNotice(`Read the uploads playlist for ${data.result.collection.quotaUnits} quota units — no keyword search was used.`);
  }

  async function findRelated() {
    if (!analysis) return;
    const data = await post(
      { action: "related", query: analysis.target.title, excludeChannelId: analysis.target.channelId, language, region, maxResults },
      "related"
    );
    if (!data) return;
    const payload = data.payload as DiscoveryPayload;
    setGroups((current) => [
      {
        key: `related-${Date.now()}`,
        scope: payload.scope,
        mechanism: "same idea, another channel",
        cached: data.cached,
        collectedAt: payload.collectedAt,
        quotaUnits: data.cached ? 0 : payload.quotaUnits,
        note: `${data.excludedSameChannel} result(s) from the original channel were removed, so what remains is evidence from independent channels.`,
        videos: toEvidenceVideos(payload),
        unavailableVideoIds: payload.unavailableVideoIds,
        channelsWithoutStats: payload.channelsWithoutStats,
        error: null,
      },
      ...current,
    ]);
  }

  function runEntry() {
    const detected = detectEntry(question);
    if (!detected.value) return;
    if (detected.kind === "video") return analyzeVideo(detected.value);
    if (detected.kind === "channel") return expandChannel(detected.value);
    return suggest();
  }

  // ── Selection and saving ─────────────────────────────

  function toggleSelected(video: EvidenceVideo) {
    setSelected((current) =>
      current.some((item) => item.id === video.id) ? current.filter((item) => item.id !== video.id) : [...current, video]
    );
  }

  async function saveReferences(input: { name: string; question: string; use: string; workspaceIds: number[] }) {
    const res = await fetch("/api/references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceIds: input.workspaceIds,
        name: input.name,
        question: input.question || question,
        items: selected.map((video) => ({
          videoId: video.id,
          title: video.title,
          channelId: video.channelId,
          channelName: video.channelName,
          thumbnailUrl: video.thumbnailUrl,
          views: video.views,
          publishedAt: video.publishedAt,
          format: video.format,
          language: video.language,
          region: video.region,
          sourceQuery: video.sourceQuery,
          use: input.use,
        })),
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Could not save the reference set");
    await loadReferences();
    return body.saved
      .map((row: { workspaceName: string; added: number; alreadyPresent: number }) => `${row.workspaceName}: ${row.added} added, ${row.alreadyPresent} already there`)
      .join(" · ");
  }

  async function saveObservation(entityType: "video" | "channel", entityId: string, fields: ObservationFields) {
    const res = await fetch("/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, entityType, entityId, ...fields }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Could not save the observation");
    await loadObservations(entityId);
  }

  const visibleGroups = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        visible: group.videos
          .filter((video) => formatFilter === "all" || video.format === formatFilter)
          .sort((a, b) => {
            if (sort === "views") return (b.views ?? -1) - (a.views ?? -1);
            const left = new Date(a.publishedAt).getTime();
            const right = new Date(b.publishedAt).getTime();
            return sort === "newest" ? right - left : left - right;
          }),
      })),
    [groups, formatFilter, sort]
  );

  if (workspaceLoading) return null;
  if (workspaceId === null)
    return (
      <main className="mx-auto max-w-4xl p-8">
        <WorkspaceRequired action="search for references" />
      </main>
    );

  const detected = detectEntry(question);
  const actionLabel =
    detected.kind === "video" ? "Analyze this video" : detected.kind === "channel" ? "Read this channel" : "Suggest searches";

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8 animate-fade-in-up">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Find references</p>
        <h1 className="text-3xl font-bold tracking-tight">What do you want to find?</h1>
      </header>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex gap-2">
            <Input
              className="h-11 text-base"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && question.trim() && runEntry()}
              placeholder="e.g. the real cost of opening a coffee shop — or paste a YouTube link"
            />
            <Button className="h-11" disabled={disabled || !question.trim()} onClick={runEntry}>
              {busy === "suggest" || busy === "analyze" || busy === "expand" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  {actionLabel}
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {detected.kind === "topic"
              ? "Suggesting searches costs nothing. You approve them and see the price before anything runs."
              : "This reads the video or channel directly through the uploads playlist — no keyword search is used."}
          </p>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">Search scope</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Language</Label>
                <Input value={language} onChange={(e) => setLanguage(e.target.value)} maxLength={10} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Region</Label>
                <Input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={10} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Published after</Label>
                <Input type="date" value={publishedAfter} onChange={(e) => setPublishedAfter(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Results per search</Label>
                <Input type="number" min={1} max={50} value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Defaults come from {activeWorkspace?.name}. Each result keeps the scope it was found under.
            </p>
          </details>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive" data-testid="lab-error">
            {error}
          </CardContent>
        </Card>
      )}
      {notice && (
        <Card className="border-primary/40">
          <CardContent className="pt-6 text-sm text-muted-foreground">{notice}</CardContent>
        </Card>
      )}

      {/* ── Suggested searches ─────────────────────── */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suggested searches</CardTitle>
            <CardDescription>
              Built from your question only. Edit the wording, uncheck what you do not want, then price the set.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.map((row, index) => (
              <div key={row.key} className="flex items-start gap-3">
                <input
                  aria-label={`Approve search ${index + 1}`}
                  type="checkbox"
                  className="mt-3"
                  checked={row.selected}
                  onChange={(event) =>
                    setSuggestions(suggestions.map((item) => (item.key === row.key ? { ...item, selected: event.target.checked } : item)))
                  }
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    value={row.query}
                    aria-label={`Search ${index + 1}`}
                    onChange={(event) =>
                      setSuggestions(suggestions.map((item) => (item.key === row.key ? { ...item, query: event.target.value } : item)))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {row.purpose}
                    {row.mechanism && ` · ${row.mechanism}`} · {row.reason}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setSuggestions(suggestions.filter((item) => item.key !== row.key))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={suggestions.length >= MAX_QUERIES}
                onClick={() =>
                  setSuggestions([
                    ...suggestions,
                    { key: `manual-${Date.now()}`, query: "", purpose: "your own search", mechanism: "", reason: "Written by you", language, region, selected: true },
                  ])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add a search
              </Button>
              <Button size="sm" variant="outline" disabled={disabled || !approved.length} onClick={price}>
                {busy === "price" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Show the cost"}
              </Button>
              <Button size="sm" disabled={disabled || !plan || plan.exceedsBudget} onClick={run}>
                {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run approved searches"}
              </Button>
              {approved.length > MAX_QUERIES && (
                <span className="text-xs text-amber-400">Only the first {MAX_QUERIES} approved searches run in one job.</span>
              )}
            </div>

            {plan && (
              <div className="space-y-1 rounded-md border p-3 text-sm">
                <p>
                  At most <b>{plan.maxQuotaUnits}</b> quota units, of {plan.availableForAutomated} available today.
                  {plan.exceedsBudget && <span className="text-amber-400"> This set does not fit — remove a search or raise the budget in Advanced.</span>}
                </p>
                {plan.queries.map((query, index) => (
                  <p key={index} className="text-xs text-muted-foreground">
                    <b className="text-foreground">{query.scope.query}</b> ·{" "}
                    {query.cached ? "already stored, 0 units" : `${query.maxQuotaUnits} units`}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Verification of one video or channel ───── */}
      {analysis && (
        <>
          <RawStatistics
            target={analysis.target}
            channel={analysis.channel}
            onEnlarge={() =>
              setEnlarged({
                id: analysis.target.id,
                title: analysis.target.title,
                channelId: analysis.target.channelId,
                channelName: analysis.target.channelName,
                views: analysis.target.views,
                publishedAt: analysis.target.publishedAt,
                thumbnailUrl: analysis.target.thumbnailUrl,
                format: analysis.target.format,
              })
            }
          />
          <RecentMedianPanel recentMedian={analysis.recentMedian} collection={analysis.collection} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={disabled} onClick={findRelated}>
              {busy === "related" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find the same idea on other channels"}
            </Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => expandChannel(analysis.target.channelId)}>
              Read this channel
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAnalysis(null)}>
              Close
            </Button>
          </div>
          <details className="space-y-4 rounded-md border p-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">Every input behind this reading</summary>
            <div className="mt-4 space-y-4">
              <SiblingPanel
                siblings={analysis.siblings}
                scored={analysis.uploadsScored}
                withoutBaseline={analysis.uploadsWithoutBaseline}
                title={`Sibling outliers on ${analysis.channel.name}`}
                description="Other uploads on the same channel, scored against their own comparable uploads."
              />
              <MeasuredEvidence growth={analysis.growth} />
              <ComparablesTable comparables={analysis.recentMedian.comparables} />
              <LegacyPanel legacy={analysis.legacy} />
              <ObservationForm
                entityLabel={analysis.target.title}
                saved={observations}
                onSave={(fields) => saveObservation("video", analysis.target.id, fields)}
              />
            </div>
          </details>
        </>
      )}

      {expansion && (
        <>
          <SiblingPanel
            siblings={expansion.siblings}
            scored={expansion.uploadsScored}
            withoutBaseline={expansion.uploadsWithoutBaseline}
            title={`Sibling outliers · ${expansion.channel.name}`}
            description={`${expansion.collection.uploadsRetrieved} of ${expansion.collection.uploadsScanned} recent uploads read for ${expansion.collection.quotaUnits} quota units. ${
              expansion.collection.scannedWholeChannel
                ? "The whole channel was scanned."
                : "Only the most recent uploads were scanned, so older siblings are not represented."
            }`}
          />
          <details className="rounded-md border p-4">
            <summary className="cursor-pointer text-sm text-muted-foreground">Record what you saw</summary>
            <div className="mt-4">
              <ObservationForm
                entityLabel={expansion.channel.name}
                saved={observations}
                onSave={(fields) => saveObservation("channel", expansion.channel.id, fields)}
              />
            </div>
          </details>
          <Button size="sm" variant="ghost" onClick={() => setExpansion(null)}>
            Close
          </Button>
        </>
      )}

      {/* ── Results ────────────────────────────────── */}
      {groups.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Results</CardTitle>
              <CardDescription>Select the ones worth keeping; a selection can span several searches.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setGroups([])}>
              Clear results
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Format</Label>
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={formatFilter}
                  onChange={(event) => setFormatFilter(event.target.value as (typeof FORMATS)[number])}
                >
                  {FORMATS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Sort by</Label>
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as (typeof SORTS)[number])}
                >
                  {SORTS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {visibleGroups.map((group) => (
              <div key={group.key} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {group.scope.query}
                    {group.mechanism && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {group.mechanism}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {group.visible.length} result(s) · {group.cached ? "already stored, no quota spent" : `${group.quotaUnits} quota units`}
                    {group.scope.language && ` · ${group.scope.language}`}
                    {group.scope.region && ` · ${group.scope.region}`}
                  </p>
                </div>
                {group.note && <p className="text-xs text-muted-foreground">{group.note}</p>}
                {group.error && <p className="text-xs text-destructive">{group.error}</p>}
                {(group.unavailableVideoIds.length > 0 || group.channelsWithoutStats.length > 0) && (
                  <p className="text-xs text-amber-300">
                    {group.unavailableVideoIds.length} result(s) were not retrievable and {group.channelsWithoutStats.length} channel(s) returned no
                    statistics.
                  </p>
                )}
                {group.visible.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {group.videos.length === 0 ? "This search returned no usable results." : "Every result was filtered out by the controls above."}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {group.visible.map((video) => (
                      <VideoCard
                        key={`${group.key}-${video.id}`}
                        video={video}
                        selected={selected.some((item) => item.id === video.id)}
                        disabled={disabled}
                        onToggle={() => toggleSelected(video)}
                        onEnlarge={() => setEnlarged(video)}
                        onExpand={() => expandChannel(video.channelId)}
                        onInspect={() => analyzeVideo(video.id)}
                        onTrack={() =>
                          post({ action: "track", channelId: video.channelId, priority: "tier-2", refreshSchedule: "weekly" }, "run").then(
                            (data) => data && setNotice(`Tracking ${video.channelName}. Refresh it from Advanced.`)
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Keep the useful ones ───────────────────── */}
      {selected.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Keep these {selected.length} reference(s)</CardTitle>
              <CardDescription>Saved sets appear in the library, with what each one was kept as evidence of.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <ComparisonGrid videos={selected} onEnlarge={setEnlarged} onRemove={(id) => setSelected(selected.filter((item) => item.id !== id))} />
            {references && (
              <ReferenceSaveForm
                uses={references.uses}
                workspaces={references.workspaces.filter((workspace) => workspace.id === workspaceId)}
                activeWorkspaceId={workspaceId}
                count={selected.length}
                onSave={saveReferences}
              />
            )}
          </CardContent>
        </Card>
      )}

      <ThumbnailViewer video={enlarged} onClose={() => setEnlarged(null)} />
    </main>
  );
}

export default function FindReferencesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <FindReferences />
    </Suspense>
  );
}
