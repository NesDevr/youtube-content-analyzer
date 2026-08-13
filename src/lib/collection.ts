import { prisma } from "@/lib/prisma";
import {
  findOutliers,
  getChannelUploadsInfo,
  getUploadVideos,
  listPlaylistVideoIds,
  MAX_UPLOADS_SCANNED,
} from "@/lib/youtube";

const DAY_MS = 86_400_000;

export async function quotaSummary() {
  const policy = await prisma.quotaPolicy.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const usage = await prisma.quotaEvent.aggregate({
    where: { createdAt: { gte: start }, result: "success" },
    _sum: { actualCost: true },
  });
  const used = usage._sum.actualCost ?? 0;
  return { policy, used, availableForAutomated: Math.max(0, policy.dailyBudget - policy.manualReserve - used), availableTotal: Math.max(0, policy.dailyBudget - used) };
}

async function reserveQuota(jobId: number, endpoint: string, cost: number, detail: string) {
  const summary = await quotaSummary();
  if (cost > summary.availableForAutomated) {
    throw new Error(`Collection blocked: ${cost} quota units are needed, but only ${summary.availableForAutomated} automated units remain today after reserving ${summary.policy.manualReserve} for manual investigation.`);
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

/** Records an intentionally user-triggered request. Manual actions may spend
 * the reserve, but never exceed the full daily budget. */
export async function reserveManualQuota(endpoint: string, cost: number, detail: string) {
  const summary = await quotaSummary();
  if (cost > summary.availableTotal) {
    throw new Error(`Manual investigation blocked: ${cost} quota units are needed, but only ${summary.availableTotal} remain today.`);
  }
  return prisma.quotaEvent.create({
    data: { endpoint, expectedCost: cost, detail, result: "pending" },
  });
}

export async function settleManualQuota(eventId: number, actualCost: number, error?: string) {
  await settleQuota(eventId, actualCost, error);
}

function discoverScope(query: string, language: string, region: string) {
  return JSON.stringify({ query, language: language || "unspecified", region: region || "unspecified", duration: "long-form and Shorts as returned by YouTube search", source: "YouTube Data API search.list" });
}

export async function discover(workspaceId: number, query: string, language = "", region = "") {
  const normalized = `${query.trim().toLowerCase()}|${language.toLowerCase()}|${region.toLowerCase()}`;
  const cached = await prisma.discoverySearch.findUnique({ where: { workspaceId_queryKey: { workspaceId, queryKey: normalized } } });
  if (cached && cached.expiresAt > new Date()) {
    return { cached: true, job: null, result: JSON.parse(cached.result), scope: cached.scope };
  }
  const scope = discoverScope(query, language, region);
  const job = await prisma.collectionJob.create({ data: { workspaceId, kind: "discovery", status: "running", scope, startedAt: new Date() } });
  // The standard discovery path makes one search.list request (100 units) plus
  // batched videos.list and channels.list calls (1 unit each).
  let event: { id: number } | null = null;
  try {
    event = await reserveQuota(job.id, "search.list + videos.list + channels.list", 102, query);
    const results = await findOutliers({ keyword: query, language: language || undefined, maxResults: 50, excludeShorts: false });
    await settleQuota(event.id, 102);
    const policy = (await quotaSummary()).policy;
    const expiresAt = new Date(Date.now() + policy.searchCacheHours * 60 * 60 * 1000);
    const payload = { results, collectedAt: new Date().toISOString(), scope: JSON.parse(scope) };
    await prisma.discoverySearch.upsert({
      where: { workspaceId_queryKey: { workspaceId, queryKey: normalized } },
      create: { workspaceId, queryKey: normalized, query, language, region, scope, result: JSON.stringify(payload), expiresAt },
      update: { query, language, region, scope, result: JSON.stringify(payload), collectedAt: new Date(), expiresAt },
    });
    await prisma.collectionJob.update({ where: { id: job.id }, data: { status: "completed", result: JSON.stringify({ resultCount: results.length, cached: false }), completedAt: new Date() } });
    return { cached: false, job: { id: job.id }, result: payload, scope };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed";
    if (event) await settleQuota(event.id, 0, message);
    await prisma.collectionJob.update({ where: { id: job.id }, data: { status: message.startsWith("Collection blocked") ? "blocked" : "failed", error: message, completedAt: new Date() } });
    throw error;
  }
}

export async function refreshTrackedChannel(workspaceId: number, trackedChannelId?: number) {
  const tracks = await prisma.trackedChannel.findMany({ where: { workspaceId, ...(trackedChannelId ? { id: trackedChannelId } : {}) }, orderBy: { priority: "asc" } });
  if (!tracks.length) throw new Error("No tracked channels match this refresh request.");
  const scope = JSON.stringify({ trackedChannels: tracks.map((track) => track.channelId), maxUploadsPerChannel: MAX_UPLOADS_SCANNED, source: "YouTube Data API uploads playlist + videos.list" });
  const job = await prisma.collectionJob.create({ data: { workspaceId, kind: "refresh", status: "running", scope, startedAt: new Date() } });
  const completed: Array<{ channelId: string; uploads: number }> = [];
  try {
    for (const track of tracks) {
      // 1 channels.list + 4 playlistItems.list + 4 videos.list at most.
      const event = await reserveQuota(job.id, "channels.list + playlistItems.list + videos.list", 9, track.channelId);
      try {
        const channel = await getChannelUploadsInfo(track.channelId);
        if (!channel) throw new Error(`Channel ${track.channelId} has no public uploads playlist.`);
        const ids = await listPlaylistVideoIds(channel.uploadsPlaylistId, MAX_UPLOADS_SCANNED);
        const uploads = await getUploadVideos(ids);
        const now = new Date();
        await prisma.$transaction([
          prisma.channelSnapshot.create({ data: { trackedChannelId: track.id, channelId: channel.id, subscribers: channel.subscribers, totalViews: channel.totalViews, videoCount: channel.videoCount, collectedAt: now } }),
          ...uploads.videos.map((video) => prisma.videoSnapshot.create({ data: { videoId: video.id, channelId: channel.id, views: video.views, collectedAt: now } })),
          prisma.trackedChannel.update({ where: { id: track.id }, data: { lastRefreshedAt: now } }),
        ]);
        await settleQuota(event.id, 1 + Math.ceil(ids.length / 50) * 2);
        completed.push({ channelId: channel.id, uploads: uploads.videos.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Refresh failed";
        await settleQuota(event.id, 0, message);
        throw error;
      }
    }
    const result = { channels: completed, collectedAt: new Date().toISOString() };
    await prisma.collectionJob.update({ where: { id: job.id }, data: { status: "completed", result: JSON.stringify(result), completedAt: new Date() } });
    return { job: { id: job.id }, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    await prisma.collectionJob.update({ where: { id: job.id }, data: { status: message.startsWith("Collection blocked") ? "blocked" : "failed", error: message, completedAt: new Date() } });
    throw error;
  }
}

export function velocityFromSnapshots(snapshots: Array<{ views: number | null; collectedAt: Date }>) {
  if (snapshots.length < 2) return null;
  const [first, last] = [...snapshots].sort((a, b) => a.collectedAt.getTime() - b.collectedAt.getTime());
  if (first.views === null || last.views === null) return null;
  const intervalMs = last.collectedAt.getTime() - first.collectedAt.getTime();
  if (intervalMs < DAY_MS) return null;
  return { viewChange: last.views - first.views, intervalHours: Math.round((intervalMs / 3_600_000) * 100) / 100, viewsPer24Hours: Math.round(((last.views - first.views) / intervalMs) * DAY_MS * 100) / 100, from: first.collectedAt, to: last.collectedAt };
}
