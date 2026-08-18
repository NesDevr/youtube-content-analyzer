import { prisma } from "@/lib/prisma";
import {
  collectSeeds,
  getChannelUploadsInfo,
  getUploadVideos,
  listPlaylistVideoIds,
  MAX_UPLOADS_SCANNED,
  SEARCH_LIST_COST,
  type DiscoveryScope,
  type SeedVideo,
} from "@/lib/youtube";
import {
  ageNormalizedComparison,
  computeRecentMedianOutlier,
  measureVelocity,
  type AgeNormalizedResult,
  type AgeObservation,
  type UploadVideo,
  type VelocityReport,
} from "@/lib/metrics/outlier";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ── Quota ledger ───────────────────────────────────────

/**
 * Everything spent, reserved and still available today.
 *
 * A reservation that has not settled yet counts against the budget at its
 * expected cost. Counting only settled successes would let two jobs started
 * seconds apart each see the full remaining budget and together overshoot it.
 */
export async function quotaSummary() {
  const policy = await prisma.quotaPolicy.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const events = await prisma.quotaEvent.findMany({
    where: { createdAt: { gte: start } },
    select: { endpoint: true, expectedCost: true, actualCost: true, result: true },
  });

  let settled = 0;
  let reserved = 0;
  const byEndpoint = new Map<string, { units: number; requests: number }>();
  for (const event of events) {
    const units = event.result === "pending" ? event.expectedCost : event.actualCost ?? 0;
    if (event.result === "pending") reserved += units;
    else settled += units;
    const row = byEndpoint.get(event.endpoint) ?? { units: 0, requests: 0 };
    byEndpoint.set(event.endpoint, { units: row.units + units, requests: row.requests + 1 });
  }

  const committed = settled + reserved;
  return {
    policy,
    used: settled,
    reserved,
    committed,
    availableForAutomated: Math.max(
      0,
      policy.dailyBudget - policy.manualReserve - committed
    ),
    availableTotal: Math.max(0, policy.dailyBudget - committed),
    byEndpoint: [...byEndpoint.entries()]
      .map(([endpoint, row]) => ({ endpoint, ...row }))
      .sort((a, b) => b.units - a.units),
  };
}

/** Thrown when the budget, not YouTube, stopped the work. */
export class QuotaBlockedError extends Error {}

async function reserveQuota(jobId: number | null, endpoint: string, cost: number, detail: string) {
  const summary = await quotaSummary();
  const available = jobId === null ? summary.availableTotal : summary.availableForAutomated;
  if (cost > available) {
    throw new QuotaBlockedError(
      jobId === null
        ? `Manual investigation blocked: ${cost} quota units are needed, but only ${available} of today's ${summary.policy.dailyBudget}-unit budget remain.`
        : `Collection blocked: ${cost} quota units are needed, but only ${available} automated units remain today after reserving ${summary.policy.manualReserve} for manual investigation.`
    );
  }
  return prisma.quotaEvent.create({
    data: { jobId, endpoint, expectedCost: cost, detail, result: "pending" },
  });
}

async function settleQuota(id: number, actualCost: number, error?: string) {
  await prisma.quotaEvent.update({
    where: { id },
    data: { actualCost, result: error ? "failed" : "success", error: error ?? null },
  });
}

/**
 * Settles a reservation whose work failed part-way, billing it for the calls it
 * got as far as making — `CollectionCallError` carries that figure, and
 * anything else is billed the whole reservation. A failed request is still
 * charged by YouTube, so writing a failure off as free would let the next job
 * overshoot the real daily limit.
 */
async function settleFailure(id: number, expectedCost: number, error: unknown, message: string) {
  await settleQuota(
    id,
    error instanceof CollectionCallError ? error.unitsAttempted : expectedCost,
    message
  );
}

/** An API failure that knows how much quota had been spent when it happened. */
class CollectionCallError extends Error {
  constructor(message: string, readonly unitsAttempted: number) {
    super(message);
  }
}

/** A user-triggered lookup. It may spend the manual reserve, never more than the day's budget. */
export async function reserveManualQuota(endpoint: string, cost: number, detail: string) {
  return reserveQuota(null, endpoint, cost, detail);
}

export async function settleManualQuota(eventId: number, actualCost: number, error?: string) {
  await settleQuota(eventId, actualCost, error);
}

// ── Snapshots ──────────────────────────────────────────

interface SnapshotInput {
  id: string;
  views: number | null;
  publishedAt: Date;
}

/**
 * Records what each video was measured at, right now. Every collection path
 * writes these — discovery, seed expansion and tracked refreshes — because a
 * second observation of the same video is what makes growth measurable at all.
 */
export async function recordVideoSnapshots(
  channelVideos: Array<{ channelId: string; videos: SnapshotInput[] }>,
  collectedAt: Date
) {
  const rows = channelVideos.flatMap(({ channelId, videos }) =>
    videos.map((video) => ({
      videoId: video.id,
      channelId,
      views: video.views,
      publishedAt: video.publishedAt,
      collectedAt,
    }))
  );
  if (rows.length) await prisma.videoSnapshot.createMany({ data: rows });
  return rows.length;
}

// ── Discovery ──────────────────────────────────────────

export interface DiscoveryRequest {
  query: string;
  language?: string;
  region?: string;
  publishedAfter?: string;
  publishedBefore?: string;
  duration?: DiscoveryScope["duration"];
  maxResults?: number;
}

/** Normalizes a request into the scope that is stored, displayed and cached. */
export function discoveryScope(request: DiscoveryRequest): DiscoveryScope {
  return {
    query: request.query.trim(),
    language: (request.language ?? "").trim().toLowerCase(),
    region: (request.region ?? "").trim().toUpperCase(),
    publishedAfter: (request.publishedAfter ?? "").trim(),
    publishedBefore: (request.publishedBefore ?? "").trim(),
    duration: request.duration ?? "any",
    maxResults: request.maxResults ?? 25,
  };
}

/**
 * The cache key covers the whole scope, not just the words typed. Narrowing a
 * search to one country or one month is a different request to YouTube and must
 * not be served from the wider search's cached results.
 */
export function discoveryCacheKey(scope: DiscoveryScope): string {
  return JSON.stringify({ ...scope, query: scope.query.toLowerCase() });
}

export interface DiscoveryPayload {
  scope: DiscoveryScope;
  seeds: SeedVideo[];
  collectedAt: string;
  quotaUnits: number;
  unavailableVideoIds: string[];
  channelsWithoutStats: string[];
}

/**
 * What one uncached discovery query is allowed to cost: one `search.list` plus
 * one batched `videos.list` and one batched `channels.list`. 25–50 results never
 * need a second page of either, so this is both the reservation and the figure
 * quoted to the user before a multi-query job runs.
 */
export const DISCOVERY_MAX_COST = SEARCH_LIST_COST + 2;

export async function discover(workspaceId: number, request: DiscoveryRequest) {
  const scope = discoveryScope(request);
  const queryKey = discoveryCacheKey(scope);

  const cached = await prisma.discoverySearch.findUnique({
    where: { workspaceId_queryKey: { workspaceId, queryKey } },
  });
  if (cached && cached.expiresAt > new Date()) {
    return {
      cached: true,
      jobId: null,
      payload: JSON.parse(cached.result) as DiscoveryPayload,
      expiresAt: cached.expiresAt.toISOString(),
    };
  }

  const job = await prisma.collectionJob.create({
    data: {
      workspaceId,
      kind: "discovery",
      status: "running",
      scope: JSON.stringify(scope),
      startedAt: new Date(),
    },
  });

  const expectedCost = DISCOVERY_MAX_COST;
  let event: { id: number } | null = null;
  try {
    event = await reserveQuota(job.id, "search.list + videos.list + channels.list", expectedCost, scope.query);
    const collected = await collectSeeds(scope);
    await settleQuota(event.id, collected.quotaUnits);

    const collectedAt = new Date();
    const byChannel = new Map<string, SnapshotInput[]>();
    for (const seed of collected.seeds) {
      const list = byChannel.get(seed.channelId) ?? [];
      list.push({ id: seed.id, views: seed.views, publishedAt: new Date(seed.publishedAt) });
      byChannel.set(seed.channelId, list);
    }
    await recordVideoSnapshots(
      [...byChannel.entries()].map(([channelId, videos]) => ({ channelId, videos })),
      collectedAt
    );

    const payload: DiscoveryPayload = {
      scope,
      seeds: collected.seeds,
      collectedAt: collectedAt.toISOString(),
      quotaUnits: collected.quotaUnits,
      unavailableVideoIds: collected.unavailableVideoIds,
      channelsWithoutStats: collected.channelsWithoutStats,
    };

    const { policy } = await quotaSummary();
    const expiresAt = new Date(Date.now() + policy.searchCacheHours * HOUR_MS);
    const stored = {
      workspaceId,
      queryKey,
      query: scope.query,
      region: scope.region,
      language: scope.language,
      scope: JSON.stringify(scope),
      result: JSON.stringify(payload),
      expiresAt,
    };
    await prisma.discoverySearch.upsert({
      where: { workspaceId_queryKey: { workspaceId, queryKey } },
      create: stored,
      update: { ...stored, collectedAt },
    });

    await prisma.collectionJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        result: JSON.stringify({
          seeds: collected.seeds.length,
          quotaUnits: collected.quotaUnits,
          unavailableVideoIds: collected.unavailableVideoIds,
          channelsWithoutStats: collected.channelsWithoutStats,
          cacheExpiresAt: expiresAt.toISOString(),
        }),
        completedAt: new Date(),
      },
    });

    return { cached: false, jobId: job.id, payload, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed";
    if (event) await settleFailure(event.id, expectedCost, error, message);
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: {
        status: error instanceof QuotaBlockedError ? "blocked" : "failed",
        error: message,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

// ── Bounded query sets for one research question ───────

/**
 * The most queries one research question may run in a single job.
 *
 * A bound is what separates a research set from an open crawl: six uncached
 * queries is 612 quota units, over half a default day's budget, and the user is
 * shown that figure before the job starts.
 */
export const MAX_SET_QUERIES = 6;

export interface SetQueryRequest extends DiscoveryRequest {
  /** Why this query is in the set — the mechanism or angle it is meant to surface. */
  mechanism?: string;
}

export interface PlannedQuery {
  scope: DiscoveryScope;
  mechanism: string;
  /** True when an unexpired stored copy of this exact scope exists. */
  cached: boolean;
  cacheExpiresAt: string | null;
  /** 0 for a cached scope, `DISCOVERY_MAX_COST` for one that must be collected. */
  maxQuotaUnits: number;
}

export interface DiscoverySetPlan {
  queries: PlannedQuery[];
  maxQuotaUnits: number;
  availableForAutomated: number;
  /** True when the whole set cannot be afforded, so the user can trim it first. */
  exceedsBudget: boolean;
}

/**
 * Prices a query set without spending anything.
 *
 * Every query is priced at its worst case, and a scope already held in the cache
 * is priced at zero, so the figure shown before the job is the most it can cost
 * rather than an average that could be exceeded.
 */
export async function planDiscoverySet(
  workspaceId: number,
  requests: SetQueryRequest[]
): Promise<DiscoverySetPlan> {
  if (!requests.length) throw new Error("A discovery set needs at least one query.");
  if (requests.length > MAX_SET_QUERIES) {
    throw new Error(
      `A discovery set is limited to ${MAX_SET_QUERIES} queries; ${requests.length} were requested.`
    );
  }

  const now = new Date();
  const queries: PlannedQuery[] = [];
  for (const request of requests) {
    const scope = discoveryScope(request);
    const cached = await prisma.discoverySearch.findUnique({
      where: { workspaceId_queryKey: { workspaceId, queryKey: discoveryCacheKey(scope) } },
      select: { expiresAt: true },
    });
    const usable = cached !== null && cached.expiresAt > now;
    queries.push({
      scope,
      mechanism: (request.mechanism ?? "").trim(),
      cached: usable,
      cacheExpiresAt: usable ? cached.expiresAt.toISOString() : null,
      maxQuotaUnits: usable ? 0 : DISCOVERY_MAX_COST,
    });
  }

  const maxQuotaUnits = queries.reduce((sum, query) => sum + query.maxQuotaUnits, 0);
  const { availableForAutomated } = await quotaSummary();
  return {
    queries,
    maxQuotaUnits,
    availableForAutomated,
    exceedsBudget: maxQuotaUnits > availableForAutomated,
  };
}

export interface DiscoverySetResult {
  query: PlannedQuery;
  payload: DiscoveryPayload | null;
  cached: boolean;
  error: string | null;
}

/**
 * Runs a planned set, one query at a time.
 *
 * Each query keeps its own scope on its own results, so a Spanish query and an
 * English one in the same set stay distinguishable afterwards. A query that
 * fails does not cancel the rest; running out of budget does, because the
 * remaining queries cannot be collected.
 */
export async function runDiscoverySet(workspaceId: number, requests: SetQueryRequest[]) {
  const plan = await planDiscoverySet(workspaceId, requests);
  const results: DiscoverySetResult[] = [];
  let blocked: string | null = null;

  for (const query of plan.queries) {
    if (blocked) {
      results.push({ query, payload: null, cached: false, error: "Not run — the budget stopped the set." });
      continue;
    }
    try {
      const outcome = await discover(workspaceId, { ...query.scope });
      results.push({ query, payload: outcome.payload, cached: outcome.cached, error: null });
    } catch (error) {
      if (error instanceof QuotaBlockedError) {
        blocked = error.message;
        results.push({ query, payload: null, cached: false, error: error.message });
        continue;
      }
      results.push({
        query,
        payload: null,
        cached: false,
        error: error instanceof Error ? error.message : "Discovery failed",
      });
    }
  }

  return {
    plan,
    results,
    spentQuotaUnits: results.reduce(
      (sum, row) => sum + (row.payload && !row.cached ? row.payload.quotaUnits : 0),
      0
    ),
    blocked,
  };
}

// ── Related evidence from independent channels ─────────

/**
 * Looks for the same idea working on channels other than the one being studied.
 *
 * A sibling upload proves a video beat its own channel; an independent channel
 * is what separates a repeatable topic from one creator's audience. The target
 * channel is removed from the results after collection, and how many results
 * that removed is reported rather than quietly closing the gap.
 */
export async function relatedEvidence(
  workspaceId: number,
  request: DiscoveryRequest & { excludeChannelId: string }
) {
  const { cached, payload, expiresAt } = await discover(workspaceId, request);
  const independent = payload.seeds.filter((seed) => seed.channelId !== request.excludeChannelId);
  return {
    cached,
    expiresAt,
    excludedChannelId: request.excludeChannelId,
    excludedSameChannel: payload.seeds.length - independent.length,
    payload: { ...payload, seeds: independent },
  };
}

// ── Reading a channel's recent uploads ─────────────────

/** Worst-case pages for one channel: 200 uploads, 50 per request. */
const MAX_UPLOAD_PAGES = Math.ceil(MAX_UPLOADS_SCANNED / 50);
/** 1 channels.list + up to 4 playlistItems.list + up to 4 videos.list. */
export const UPLOADS_COLLECTION_COST = 1 + MAX_UPLOAD_PAGES * 2;

/** One pasted video: the uploads collection above plus its own videos.list. */
export const ANALYSIS_MAX_COST = UPLOADS_COLLECTION_COST + 1;

/**
 * The one path that turns a channel id into its recent uploads. Expansion and
 * tracked refreshes both take it, so they page, cost and fail identically.
 *
 * Each failure reports the quota spent up to that point: a channel that does
 * not resolve costs the 1 unit of the lookup, not the 9 the caller reserved.
 */
async function collectChannelUploads(channelId: string) {
  let attempted = 1; // channels.list
  const channel = await getChannelUploadsInfo(channelId).catch((error: Error) => {
    throw new CollectionCallError(error.message, attempted);
  });
  if (!channel) {
    throw new CollectionCallError(
      `Channel ${channelId} has no public uploads playlist.`,
      attempted
    );
  }

  attempted += MAX_UPLOAD_PAGES;
  const ids = await listPlaylistVideoIds(channel.uploadsPlaylistId, MAX_UPLOADS_SCANNED).catch(
    (error: Error) => {
      throw new CollectionCallError(error.message, attempted);
    }
  );

  const pages = Math.ceil(ids.length / 50);
  attempted = 1 + pages * 2;
  const { videos, missingIds } = await getUploadVideos(ids).catch((error: Error) => {
    throw new CollectionCallError(error.message, attempted);
  });

  return { channel, ids, videos, missingIds, quotaUnits: 1 + pages * 2 };
}

// ── Seed expansion (uploads playlist, no search.list) ──

/**
 * Expands one promising seed into its channel's recent uploads.
 *
 * Enumerating the uploads playlist costs 1 unit per 50 videos against the 100
 * units of a keyword search, so a seed is always expanded this way rather than
 * by searching for more of the same. Each upload is scored against the same
 * baseline rules as a pasted video, which is what makes a sibling outlier
 * comparable with the seed that led here.
 */
/** How many of the highest-scoring siblings an expansion returns. */
export const SIBLINGS_SHOWN = 10;

/**
 * Scores every upload of a channel against the same baseline rules a pasted
 * video gets, and returns the highest. Both the expansion job and a single-video
 * analysis rank siblings this way, so the two never disagree about which upload
 * on a channel is the outlier.
 */
export function rankSiblings(videos: UploadVideo[], collectedAt: Date, excludeVideoId?: string) {
  const scored = videos
    .map((video) => ({ video, outlier: computeRecentMedianOutlier(video, videos, { now: collectedAt }) }))
    .filter((row) => row.outlier.status === "ok")
    .sort((a, b) => (b.outlier.ratio ?? 0) - (a.outlier.ratio ?? 0));

  const siblings = scored
    .filter((row) => row.video.id !== excludeVideoId)
    .slice(0, SIBLINGS_SHOWN)
    .map((row) => ({
      id: row.video.id,
      title: row.video.title,
      publishedAt: row.video.publishedAt.toISOString(),
      views: row.video.views,
      format: row.outlier.format,
      ratio: row.outlier.ratio,
      baselineMedianViews: row.outlier.baselineMedianViews,
      sampleSize: row.outlier.sampleSize,
      explanation: row.outlier.explanation,
    }));

  return {
    siblings,
    /** Uploads that produced a ratio, of which `siblings` is the top slice. */
    uploadsScored: scored.length,
    /** Uploads with too few comparable uploads of their format to score. */
    uploadsWithoutBaseline: videos.length - scored.length,
  };
}

export async function expandSeed(workspaceId: number, channelId: string) {
  const scope = {
    channelId,
    source: "YouTube Data API uploads playlist + videos.list",
    maxUploadsScanned: MAX_UPLOADS_SCANNED,
    search: "none — expansion never spends a search.list request",
  };
  const job = await prisma.collectionJob.create({
    data: { workspaceId, kind: "expand", status: "running", scope: JSON.stringify(scope), startedAt: new Date() },
  });

  const expectedCost = UPLOADS_COLLECTION_COST;
  let event: { id: number } | null = null;
  try {
    event = await reserveQuota(job.id, "channels.list + playlistItems.list + videos.list", expectedCost, channelId);
    const { channel, ids, videos, missingIds, quotaUnits: actualCost } =
      await collectChannelUploads(channelId);
    await settleQuota(event.id, actualCost);

    const collectedAt = new Date();
    await recordVideoSnapshots(
      [{ channelId: channel.id, videos: videos.map((video) => ({ id: video.id, views: video.views, publishedAt: video.publishedAt })) }],
      collectedAt
    );

    const result = {
      channel: { id: channel.id, name: channel.name, subscribers: channel.subscribers },
      collection: {
        uploadsScanned: ids.length,
        uploadsRetrieved: videos.length,
        unavailableUploads: missingIds.length,
        scannedWholeChannel: ids.length < MAX_UPLOADS_SCANNED,
        quotaUnits: actualCost,
        collectedAt: collectedAt.toISOString(),
      },
      ...rankSiblings(videos, collectedAt),
    };

    await prisma.collectionJob.update({
      where: { id: job.id },
      data: { status: "completed", result: JSON.stringify(result), completedAt: new Date() },
    });
    return { jobId: job.id, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seed expansion failed";
    if (event) await settleFailure(event.id, expectedCost, error, message);
    await prisma.collectionJob.update({
      where: { id: job.id },
      data: {
        status: error instanceof QuotaBlockedError ? "blocked" : "failed",
        error: message,
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

// ── Tracked-channel refresh ────────────────────────────

/**
 * Refreshes tracked channels one at a time, recording a timestamped snapshot
 * for the channel and each of its recent uploads.
 *
 * A channel that fails does not abandon the ones after it: the failure is kept
 * in the job result so the run reports exactly what was and was not collected.
 * Running out of quota does stop the run, because continuing cannot work.
 */
export async function refreshTrackedChannels(workspaceId: number, trackedChannelId?: number) {
  const tracks = await prisma.trackedChannel.findMany({
    where: { workspaceId, ...(trackedChannelId ? { id: trackedChannelId } : {}) },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (!tracks.length) throw new Error("No tracked channels match this refresh request.");

  const scope = {
    trackedChannels: tracks.map((track) => track.channelId),
    maxUploadsPerChannel: MAX_UPLOADS_SCANNED,
    source: "YouTube Data API uploads playlist + videos.list",
    search: "none — refreshes never spend a search.list request",
  };
  const job = await prisma.collectionJob.create({
    data: { workspaceId, kind: "refresh", status: "running", scope: JSON.stringify(scope), startedAt: new Date() },
  });

  const collected: Array<{ channelId: string; uploads: number; snapshots: number; quotaUnits: number }> = [];
  const failures: Array<{ channelId: string; error: string }> = [];
  let blocked: string | null = null;

  for (const track of tracks) {
    const expectedCost = UPLOADS_COLLECTION_COST;
    let event: { id: number } | null = null;
    try {
      event = await reserveQuota(job.id, "channels.list + playlistItems.list + videos.list", expectedCost, track.channelId);
    } catch (error) {
      blocked = error instanceof Error ? error.message : "Collection blocked";
      break;
    }
    try {
      const { channel, videos, quotaUnits: actualCost } = await collectChannelUploads(track.channelId);
      const now = new Date();

      await prisma.channelSnapshot.create({
        data: {
          trackedChannelId: track.id,
          channelId: channel.id,
          subscribers: channel.subscribers,
          totalViews: channel.totalViews,
          videoCount: channel.videoCount,
          collectedAt: now,
        },
      });
      const snapshots = await recordVideoSnapshots(
        [{ channelId: channel.id, videos: videos.map((video) => ({ id: video.id, views: video.views, publishedAt: video.publishedAt })) }],
        now
      );
      await prisma.trackedChannel.update({ where: { id: track.id }, data: { lastRefreshedAt: now } });
      await settleQuota(event.id, actualCost);
      collected.push({ channelId: channel.id, uploads: videos.length, snapshots, quotaUnits: actualCost });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed";
      await settleFailure(event.id, expectedCost, error, message);
      failures.push({ channelId: track.channelId, error: message });
    }
  }

  const result = {
    channels: collected,
    failures,
    requested: tracks.length,
    collectedAt: new Date().toISOString(),
    quotaUnits: collected.reduce((sum, row) => sum + row.quotaUnits, 0),
    blocked,
  };
  const status = blocked
    ? "blocked"
    : failures.length === tracks.length
      ? "failed"
      : "completed";
  await prisma.collectionJob.update({
    where: { id: job.id },
    data: {
      status,
      result: JSON.stringify(result),
      error: blocked ?? (failures.length ? `${failures.length} of ${tracks.length} channels failed.` : null),
      completedAt: new Date(),
    },
  });

  if (blocked && !collected.length) throw new QuotaBlockedError(blocked);
  return { jobId: job.id, status, result };
}

// ── Measured growth from stored snapshots ──────────────

export interface TrackedVideoGrowth {
  videoId: string;
  channelId: string;
  latestViews: number | null;
  latestCollectedAt: string;
  snapshotCount: number;
  velocity: VelocityReport;
  ageNormalized: AgeNormalizedResult | null;
  ageNormalizedUnavailable: string;
}

type StoredSnapshot = {
  videoId: string;
  channelId: string;
  views: number | null;
  publishedAt: Date | null;
  collectedAt: Date;
};

/**
 * Turns stored observations into measured growth. Nothing is estimated from a
 * video's age here; a video with a single observation reports why it has no
 * measurement yet.
 */
function buildGrowthRows(snapshots: StoredSnapshot[]): TrackedVideoGrowth[] {
  const byVideo = new Map<string, typeof snapshots>();
  for (const snapshot of snapshots) {
    const list = byVideo.get(snapshot.videoId) ?? [];
    list.push(snapshot);
    byVideo.set(snapshot.videoId, list);
  }

  // Every stored reading of any video, as an age/views pair, is the pool the
  // age-normalized comparison draws its comparables from.
  const observationsByChannel = new Map<string, AgeObservation[]>();
  for (const snapshot of snapshots) {
    if (snapshot.publishedAt === null || snapshot.views === null) continue;
    const ageHours = (snapshot.collectedAt.getTime() - snapshot.publishedAt.getTime()) / HOUR_MS;
    if (ageHours <= 0) continue;
    const list = observationsByChannel.get(snapshot.channelId) ?? [];
    list.push({ videoId: snapshot.videoId, ageHours: Math.round(ageHours * 10) / 10, views: snapshot.views });
    observationsByChannel.set(snapshot.channelId, list);
  }

  const rows: TrackedVideoGrowth[] = [];
  for (const [videoId, points] of byVideo) {
    const latest = points[points.length - 1];
    const velocity = measureVelocity(points.map((point) => ({ views: point.views, collectedAt: point.collectedAt })));

    let ageNormalized: AgeNormalizedResult | null = null;
    let ageNormalizedUnavailable = "";
    if (latest.publishedAt === null || latest.views === null) {
      ageNormalizedUnavailable =
        "No publish date or view count was stored with the latest observation of this video.";
    } else {
      const ageHours = (latest.collectedAt.getTime() - latest.publishedAt.getTime()) / HOUR_MS;
      ageNormalized = ageNormalizedComparison(
        { videoId, ageHours, views: latest.views },
        observationsByChannel.get(latest.channelId) ?? []
      );
    }

    rows.push({
      videoId,
      channelId: latest.channelId,
      latestViews: latest.views,
      latestCollectedAt: latest.collectedAt.toISOString(),
      snapshotCount: points.length,
      velocity,
      ageNormalized,
      ageNormalizedUnavailable,
    });
  }

  return rows.sort((a, b) => {
    const rate = (row: TrackedVideoGrowth) =>
      row.velocity.daily?.viewsPer24Hours ?? row.velocity.multiDay?.viewsPer24Hours ?? -1;
    return rate(b) - rate(a) || b.snapshotCount - a.snapshotCount;
  });
}

/** Growth for the videos of a workspace's tracked channels. */
export async function trackedGrowth(workspaceId: number, limit = 25): Promise<TrackedVideoGrowth[]> {
  const tracks = await prisma.trackedChannel.findMany({
    where: { workspaceId },
    select: { channelId: true },
  });
  if (!tracks.length) return [];

  const snapshots = await prisma.videoSnapshot.findMany({
    where: { channelId: { in: tracks.map((track) => track.channelId) } },
    orderBy: { collectedAt: "asc" },
  });
  return buildGrowthRows(snapshots).slice(0, limit);
}

/**
 * Growth for one video, whether or not its channel is tracked. Every path that
 * collects a channel writes snapshots, so a video analyzed twice has a measured
 * interval even if nobody ever pressed Track.
 *
 * The comparables for the age-normalized reading come from the same channel, so
 * the whole channel's stored observations are loaded, not just this video's.
 */
export async function videoGrowth(videoId: string): Promise<TrackedVideoGrowth | null> {
  const own = await prisma.videoSnapshot.findFirst({
    where: { videoId },
    orderBy: { collectedAt: "desc" },
    select: { channelId: true },
  });
  if (!own) return null;

  const snapshots = await prisma.videoSnapshot.findMany({
    where: { channelId: own.channelId },
    orderBy: { collectedAt: "asc" },
  });
  return buildGrowthRows(snapshots).find((row) => row.videoId === videoId) ?? null;
}

// ── Retention ──────────────────────────────────────────

/**
 * Thins old snapshots to one per video per day.
 *
 * Backtesting needs the shape of a video's history, not every reading of it, so
 * old intra-day duplicates go. A video's first and last observation are always
 * kept — those two are what proves the interval a measurement was taken over —
 * and nothing newer than the configured age is touched at all.
 */
export async function pruneSnapshots(now = new Date()) {
  const { policy } = await quotaSummary();
  const cutoff = new Date(now.getTime() - policy.snapshotThinAfterDays * DAY_MS);

  const snapshots = await prisma.videoSnapshot.findMany({
    orderBy: { collectedAt: "asc" },
    select: { id: true, videoId: true, collectedAt: true },
  });

  const byVideo = new Map<string, typeof snapshots>();
  for (const snapshot of snapshots) {
    const list = byVideo.get(snapshot.videoId) ?? [];
    list.push(snapshot);
    byVideo.set(snapshot.videoId, list);
  }

  const removable: number[] = [];
  for (const points of byVideo.values()) {
    const protectedIds = new Set([points[0].id, points[points.length - 1].id]);
    const lastOfDay = new Map<string, number>();
    for (const point of points) {
      if (point.collectedAt >= cutoff) continue;
      lastOfDay.set(point.collectedAt.toISOString().slice(0, 10), point.id);
    }
    const keep = new Set([...protectedIds, ...lastOfDay.values()]);
    for (const point of points) {
      if (point.collectedAt < cutoff && !keep.has(point.id)) removable.push(point.id);
    }
  }

  if (removable.length) {
    await prisma.videoSnapshot.deleteMany({ where: { id: { in: removable } } });
  }
  return {
    deleted: removable.length,
    inspected: snapshots.length,
    remaining: snapshots.length - removable.length,
    thinAfterDays: policy.snapshotThinAfterDays,
    cutoff: cutoff.toISOString(),
  };
}
