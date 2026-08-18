import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  discover,
  expandSeed,
  pruneSnapshots,
  quotaSummary,
  refreshTrackedChannels,
  trackedGrowth,
} from "@/lib/collection";

// ── A fake YouTube Data API ────────────────────────────
//
// Only `fetch` is stubbed, so the tests exercise the real pagination, batching,
// quota accounting and error handling of `src/lib/youtube.ts` rather than a
// mock of it. `world` is what that fake API currently serves.

interface FakeVideo {
  id: string;
  channelId: string;
  title: string;
  publishedAt: string;
  /** Omitted means YouTube withholds the count for this video. */
  views?: number;
  durationSeconds?: number;
}

const world = {
  channels: new Map<string, { title: string; uploadsPlaylistId: string; subscribers?: number; totalViews?: number; videoCount?: number }>(),
  playlists: new Map<string, string[]>(),
  videos: new Map<string, FakeVideo>(),
  searchResults: [] as string[],
  /** Endpoints that must answer with an HTTP error: "search", "videos", … */
  failing: new Set<string>(),
  calls: [] as Array<{ endpoint: string; url: URL }>,
};

function resetWorld() {
  world.channels.clear();
  world.playlists.clear();
  world.videos.clear();
  world.searchResults = [];
  world.failing.clear();
  world.calls = [];
}

function addChannel(channelId: string, videos: FakeVideo[]) {
  const playlistId = `UU${channelId.slice(2)}`;
  world.channels.set(channelId, {
    title: `Channel ${channelId}`,
    uploadsPlaylistId: playlistId,
    subscribers: 10_000,
    totalViews: 1_000_000,
    videoCount: videos.length,
  });
  world.playlists.set(playlistId, videos.map((video) => video.id));
  for (const video of videos) world.videos.set(video.id, video);
}

function videoItem(video: FakeVideo) {
  const seconds = video.durationSeconds ?? 600;
  return {
    id: video.id,
    snippet: {
      title: video.title,
      channelId: video.channelId,
      channelTitle: `Channel ${video.channelId}`,
      publishedAt: video.publishedAt,
      liveBroadcastContent: "none",
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${video.id}/hq.jpg` } },
    },
    statistics: video.views === undefined ? {} : { viewCount: String(video.views) },
    contentDetails: { duration: `PT${seconds}S` },
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

function errorResponse(message: string) {
  return { ok: false, json: async () => ({}), text: async () => message } as Response;
}

function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const endpoint = url.pathname.split("/").pop() ?? "";
  world.calls.push({ endpoint, url });

  if (world.failing.has(endpoint)) {
    return Promise.resolve(errorResponse(`${endpoint} is unavailable (403 quotaExceeded)`));
  }

  if (endpoint === "search") {
    const limit = Number(url.searchParams.get("maxResults") ?? "50");
    return Promise.resolve(
      jsonResponse({
        items: world.searchResults.slice(0, limit).map((id) => ({ id: { videoId: id } })),
      })
    );
  }

  if (endpoint === "videos") {
    const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
    expect(ids.length, "videos.list accepts at most 50 ids per request").toBeLessThanOrEqual(50);
    return Promise.resolve(
      jsonResponse({
        items: ids.flatMap((id) => {
          const video = world.videos.get(id);
          return video ? [videoItem(video)] : [];
        }),
      })
    );
  }

  if (endpoint === "channels") {
    const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
    return Promise.resolve(
      jsonResponse({
        items: ids.flatMap((id) => {
          const channel = world.channels.get(id);
          if (!channel) return [];
          return [
            {
              id,
              snippet: { title: channel.title },
              contentDetails: { relatedPlaylists: { uploads: channel.uploadsPlaylistId } },
              statistics: {
                subscriberCount: channel.subscribers === undefined ? undefined : String(channel.subscribers),
                hiddenSubscriberCount: channel.subscribers === undefined,
                viewCount: String(channel.totalViews ?? 0),
                videoCount: String(channel.videoCount ?? 0),
              },
            },
          ];
        }),
      })
    );
  }

  if (endpoint === "playlistItems") {
    const ids = world.playlists.get(url.searchParams.get("playlistId") ?? "") ?? [];
    const pageSize = Number(url.searchParams.get("maxResults") ?? "50");
    const offset = Number(url.searchParams.get("pageToken") ?? "0");
    const page = ids.slice(offset, offset + pageSize);
    const next = offset + pageSize;
    return Promise.resolve(
      jsonResponse({
        items: page.map((id) => ({ contentDetails: { videoId: id } })),
        nextPageToken: next < ids.length ? String(next) : undefined,
      })
    );
  }

  throw new Error(`Unexpected request to ${url.pathname}`);
}

// ── Fixtures ───────────────────────────────────────────

const BASE_TIME = Date.parse("2026-06-01T00:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function uploads(channelId: string, count: number, views: (i: number) => number | undefined) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${channelId.slice(-3)}vid${String(i).padStart(3, "0")}`,
    channelId,
    title: `${channelId} upload ${i}`,
    publishedAt: new Date(BASE_TIME - i * DAY).toISOString(),
    views: views(i),
  }));
}

async function workspace(name: string) {
  const row = await prisma.channelWorkspace.create({ data: { name } });
  return row.id;
}

async function setPolicy(fields: Partial<{ dailyBudget: number; manualReserve: number; searchCacheHours: number; snapshotThinAfterDays: number }>) {
  await prisma.quotaPolicy.upsert({ where: { id: 1 }, create: { id: 1, ...fields }, update: fields });
}

function callsTo(endpoint: string) {
  return world.calls.filter((call) => call.endpoint === endpoint).length;
}

beforeEach(async () => {
  resetWorld();
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  await prisma.quotaEvent.deleteMany();
  await prisma.collectionJob.deleteMany();
  await prisma.discoverySearch.deleteMany();
  await prisma.videoSnapshot.deleteMany();
  await prisma.channelSnapshot.deleteMany();
  await prisma.trackedChannel.deleteMany();
  await prisma.channelWorkspace.deleteMany();
  await prisma.quotaPolicy.deleteMany();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Quota ──────────────────────────────────────────────

describe("quota ledger", () => {
  it("stops before the automated budget is exhausted and says why", async () => {
    const id = await workspace("Budget");
    await setPolicy({ dailyBudget: 150, manualReserve: 100 });

    await expect(discover(id, { query: "anything" })).rejects.toThrow(
      /Collection blocked[\s\S]*only 50 automated units remain[\s\S]*reserving 100 for manual/
    );
    expect(callsTo("search"), "no request may be sent once the budget blocks the job").toBe(0);

    const job = await prisma.collectionJob.findFirstOrThrow();
    expect(job.status).toBe("blocked");
    expect(job.error).toMatch(/Collection blocked/);
  });

  it("counts unsettled reservations so two jobs cannot both spend the same units", async () => {
    await setPolicy({ dailyBudget: 1_000, manualReserve: 200 });
    await prisma.quotaEvent.create({
      data: { endpoint: "search.list", expectedCost: 700, detail: "in flight", result: "pending" },
    });

    const summary = await quotaSummary();
    expect(summary.reserved).toBe(700);
    expect(summary.used).toBe(0);
    expect(summary.availableForAutomated).toBe(100);
    expect(summary.availableTotal).toBe(300);
  });

  it("charges a failed search the whole reservation instead of writing it off", async () => {
    const id = await workspace("Failing API");
    await setPolicy({ dailyBudget: 1_000, manualReserve: 200 });
    world.failing.add("search");

    await expect(discover(id, { query: "boom" })).rejects.toThrow(/quotaExceeded/);

    const event = await prisma.quotaEvent.findFirstOrThrow();
    expect(event.result).toBe("failed");
    expect(event.actualCost).toBe(event.expectedCost);
    expect(event.error).toMatch(/search failed/i);

    const summary = await quotaSummary();
    expect(summary.used).toBe(102);
    expect(summary.byEndpoint[0]).toMatchObject({ units: 102, requests: 1 });
  });
});

// ── Discovery ──────────────────────────────────────────

describe("discovery", () => {
  beforeEach(async () => {
    await setPolicy({ dailyBudget: 10_000, manualReserve: 200, searchCacheHours: 24 });
    addChannel("UCseedchannel0000000001", uploads("UCseedchannel0000000001", 3, () => 5_000));
    world.searchResults = ["dchvid000", "dchvid001"];
    world.videos.set("dchvid000", {
      id: "dchvid000",
      channelId: "UCseedchannel0000000001",
      title: "Seed one",
      publishedAt: new Date(BASE_TIME).toISOString(),
      views: 50_000,
    });
    world.videos.set("dchvid001", {
      id: "dchvid001",
      channelId: "UCseedchannel0000000001",
      title: "Seed two — view count withheld",
      publishedAt: new Date(BASE_TIME).toISOString(),
    });
  });

  it("spends one search, records the scope it used and snapshots what it saw", async () => {
    const id = await workspace("Discovery");
    const result = await discover(id, { query: "solo ai tools", region: "es", duration: "long", maxResults: 10 });

    expect(result.cached).toBe(false);
    expect(callsTo("search")).toBe(1);
    expect(result.payload.quotaUnits).toBe(102);

    // The request carries exactly the scope that is stored next to the results.
    const search = world.calls.find((call) => call.endpoint === "search")!.url;
    expect(search.searchParams.get("q")).toBe("solo ai tools");
    expect(search.searchParams.get("regionCode")).toBe("ES");
    expect(search.searchParams.get("videoDuration")).toBe("long");
    expect(search.searchParams.get("maxResults")).toBe("10");
    expect(result.payload.scope).toMatchObject({ query: "solo ai tools", region: "ES", duration: "long", maxResults: 10 });

    // A withheld view count stays unknown instead of becoming 0.
    expect(result.payload.seeds.map((seed) => seed.views)).toEqual([50_000, null]);

    const snapshots = await prisma.videoSnapshot.findMany({ orderBy: { videoId: "asc" } });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].publishedAt).not.toBeNull();
    expect(snapshots[1].views).toBeNull();

    const job = await prisma.collectionJob.findFirstOrThrow({ include: { quotaEvents: true } });
    expect(job.status).toBe("completed");
    expect(JSON.parse(job.scope)).toMatchObject({ region: "ES", duration: "long" });
    expect(job.quotaEvents[0].actualCost).toBe(102);
  });

  it("serves an identical scope from cache and re-searches a narrowed one", async () => {
    const id = await workspace("Cache");
    await discover(id, { query: "solo ai tools" });
    const second = await discover(id, { query: "Solo AI Tools" });

    expect(second.cached).toBe(true);
    expect(callsTo("search"), "an identical scope must not spend quota twice").toBe(1);

    await discover(id, { query: "solo ai tools", region: "mx" });
    expect(callsTo("search"), "a narrower scope is a different request").toBe(2);
  });

  it("re-searches once the documented cache period has passed", async () => {
    const id = await workspace("Expiry");
    await discover(id, { query: "solo ai tools" });
    await prisma.discoverySearch.updateMany({ data: { expiresAt: new Date(Date.now() - 1_000) } });

    const refreshed = await discover(id, { query: "solo ai tools" });
    expect(refreshed.cached).toBe(false);
    expect(callsTo("search")).toBe(2);
  });

  it("keeps one workspace's cached searches out of another's", async () => {
    const alpha = await workspace("Alpha");
    const beta = await workspace("Beta");
    await discover(alpha, { query: "solo ai tools" });
    const fromBeta = await discover(beta, { query: "solo ai tools" });

    expect(fromBeta.cached).toBe(false);
    expect(callsTo("search")).toBe(2);
  });
});

// ── Seed expansion and refreshes ───────────────────────

describe("uploads-based collection", () => {
  beforeEach(async () => {
    await setPolicy({ dailyBudget: 10_000, manualReserve: 200 });
  });

  it("pages through a long uploads playlist and batches the detail lookups", async () => {
    const id = await workspace("Pagination");
    addChannel("UCbigchannel00000000001", uploads("UCbigchannel00000000001", 120, (i) => 1_000 + i));

    const { result } = await expandSeed(id, "UCbigchannel00000000001");

    // 120 uploads: 3 playlistItems pages of 50 and 3 videos.list batches of 50.
    expect(callsTo("playlistItems")).toBe(3);
    expect(callsTo("videos")).toBe(3);
    expect(callsTo("search"), "expansion must never spend a search request").toBe(0);
    expect(result.collection.uploadsScanned).toBe(120);
    expect(result.collection.quotaUnits).toBe(7);
    expect(await prisma.videoSnapshot.count()).toBe(120);
  });

  it("ranks sibling uploads against the same baseline rules as a pasted video", async () => {
    const id = await workspace("Siblings");
    addChannel(
      "UCsibchannel00000000001",
      uploads("UCsibchannel00000000001", 12, (i) => (i === 3 ? 100_000 : 1_000))
    );

    const { result } = await expandSeed(id, "UCsibchannel00000000001");
    expect(result.siblings[0]).toMatchObject({ views: 100_000, ratio: 100 });
    expect(result.siblings[0].explanation).toContain("median views");
  });

  it("counts unscored uploads separately from the ones the top slice leaves out", async () => {
    const id = await workspace("Counts");
    // 14 long-form uploads all score; 2 Shorts have no comparable Short to
    // measure against. Only 10 siblings are shown, and that must not be
    // reported as 6 uploads having failed to score.
    addChannel("UCcountchannel000000001", [
      ...uploads("UCcountchannel000000001", 14, () => 1_000),
      ...uploads("UCcountchannel000000001", 2, () => 5_000).map((video, i) => ({
        ...video,
        id: `cntshort${i}`,
        durationSeconds: 30,
      })),
    ]);

    const { result } = await expandSeed(id, "UCcountchannel000000001");
    expect(result.collection.uploadsRetrieved).toBe(16);
    expect(result.siblings).toHaveLength(10);
    expect(result.uploadsScored).toBe(14);
    expect(result.uploadsWithoutBaseline).toBe(2);
  });

  it("reports a channel with no public uploads playlist instead of returning nothing", async () => {
    const id = await workspace("Missing channel");
    await expect(expandSeed(id, "UCdoesnotexist000000001")).rejects.toThrow(
      /no public uploads playlist/
    );
    const job = await prisma.collectionJob.findFirstOrThrow();
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/no public uploads playlist/);
  });

  it("bills a failed channel for the lookup it made, not the whole reservation", async () => {
    const id = await workspace("Partial spend");
    await expect(expandSeed(id, "UCghost000000000000001")).rejects.toThrow(/no public uploads playlist/);

    const event = await prisma.quotaEvent.findFirstOrThrow();
    expect(event.expectedCost).toBe(9);
    // Only channels.list was reached, so only its unit is charged.
    expect(event.actualCost).toBe(1);
    expect((await quotaSummary()).used).toBe(1);
  });

  it("bills the pages a mid-collection failure could have reached", async () => {
    const id = await workspace("Mid failure");
    addChannel("UChalfbroken000000001", uploads("UChalfbroken000000001", 60, () => 1_000));
    world.failing.add("videos");

    await expect(expandSeed(id, "UChalfbroken000000001")).rejects.toThrow(/videos is unavailable/);

    const event = await prisma.quotaEvent.findFirstOrThrow();
    // 1 channels.list + 2 playlistItems pages + 2 videos.list batches.
    expect(event.actualCost).toBe(5);
  });

  it("keeps refreshing the other channels when one of them fails", async () => {
    const id = await workspace("Refresh");
    addChannel("UCworking0000000000001", uploads("UCworking0000000000001", 4, () => 2_000));
    for (const channelId of ["UCworking0000000000001", "UCbroken00000000000001"]) {
      await prisma.trackedChannel.create({ data: { workspaceId: id, channelId, priority: "tier-1" } });
    }

    const run = await refreshTrackedChannels(id);
    expect(run.status).toBe("completed");
    expect(run.result.channels).toEqual([
      { channelId: "UCworking0000000000001", uploads: 4, snapshots: 4, quotaUnits: 3 },
    ]);
    expect(run.result.failures).toEqual([
      { channelId: "UCbroken00000000000001", error: expect.stringMatching(/no public uploads playlist/) },
    ]);

    const tracked = await prisma.trackedChannel.findMany({ orderBy: { channelId: "asc" } });
    expect(tracked.find((t) => t.channelId === "UCbroken00000000000001")!.lastRefreshedAt).toBeNull();
    expect(tracked.find((t) => t.channelId === "UCworking0000000000001")!.lastRefreshedAt).not.toBeNull();
    expect(await prisma.channelSnapshot.count()).toBe(1);
  });

  it("stops a refresh when the budget runs out and reports what it collected first", async () => {
    const id = await workspace("Budget stop");
    for (const suffix of ["1", "2", "3"]) {
      const channelId = `UCmany000000000000000${suffix}`;
      addChannel(channelId, uploads(channelId, 2, () => 500));
      await prisma.trackedChannel.create({ data: { workspaceId: id, channelId } });
    }
    // 13 automated units: enough to reserve 9 twice, because each channel
    // settles at the 3 units it actually spent, but not a third time.
    await setPolicy({ dailyBudget: 213, manualReserve: 200 });

    const run = await refreshTrackedChannels(id);
    expect(run.status).toBe("blocked");
    expect(run.result.channels).toHaveLength(2);
    expect(run.result.blocked).toMatch(/Collection blocked/);
    expect(callsTo("channels")).toBe(2);
  });

  it("refuses a refresh that names no tracked channel", async () => {
    const id = await workspace("Untracked");
    await expect(refreshTrackedChannels(id)).rejects.toThrow(/No tracked channels/);
  });
});

// ── Measured growth ────────────────────────────────────

describe("growth from stored snapshots", () => {
  async function snapshot(videoId: string, hoursFromBase: number, views: number | null, publishedHoursBefore = 240) {
    const collectedAt = new Date(BASE_TIME + hoursFromBase * HOUR);
    await prisma.videoSnapshot.create({
      data: {
        videoId,
        channelId: "UCgrowth00000000000001",
        views,
        publishedAt: new Date(collectedAt.getTime() - publishedHoursBefore * HOUR),
        collectedAt,
      },
    });
  }

  let id: number;
  beforeEach(async () => {
    id = await workspace("Growth");
    await prisma.trackedChannel.create({
      data: { workspaceId: id, channelId: "UCgrowth00000000000001" },
    });
  });

  it("measures a daily and a multi-day change over the real intervals", async () => {
    await snapshot("growthvid01", 0, 1_000);
    await snapshot("growthvid01", 73, 5_000);
    await snapshot("growthvid01", 96, 5_920);

    const [row] = await trackedGrowth(id);
    expect(row.snapshotCount).toBe(3);
    expect(row.velocity.daily).toMatchObject({ intervalHours: 23, viewChange: 920, viewsPer24Hours: 960 });
    expect(row.velocity.multiDay).toMatchObject({ intervalHours: 96, viewChange: 4_920 });
  });

  it("says a single observation cannot support a measurement", async () => {
    await snapshot("growthvid02", 0, 1_000);

    const [row] = await trackedGrowth(id);
    expect(row.velocity.daily).toBeNull();
    expect(row.velocity.dailyUnavailable).toMatch(/two are required/);
    expect(row.velocity.multiDay).toBeNull();
  });

  it("reports irregular collection times honestly rather than filling the gap", async () => {
    await snapshot("growthvid03", 0, 1_000);
    await snapshot("growthvid03", 7, 1_400);

    const [row] = await trackedGrowth(id);
    expect(row.velocity.daily).toBeNull();
    expect(row.velocity.dailyUnavailable).toMatch(/closest is 7 h/);
    expect(row.velocity.multiDayUnavailable).toMatch(/span 7 h/);
  });

  it("withholds an age-normalized comparison until comparable observations exist", async () => {
    await snapshot("growthvid04", 0, 9_000, 240);
    await snapshot("growthvid04", 24, 9_500, 264);
    for (const i of [1, 2]) {
      await snapshot(`sibling0${i}`, 24, 1_000, 264);
    }

    const target = (await trackedGrowth(id)).find((row) => row.videoId === "growthvid04")!;
    expect(target.ageNormalized?.status).toBe("insufficient_comparables");
    expect(target.ageNormalized?.ratio).toBeNull();

    for (const i of [3, 4, 5]) {
      await snapshot(`sibling0${i}`, 24, 1_000, 264);
    }
    const withHistory = (await trackedGrowth(id)).find((row) => row.videoId === "growthvid04")!;
    expect(withHistory.ageNormalized?.status).toBe("ok");
    expect(withHistory.ageNormalized?.medianViewsAtComparableAge).toBe(1_000);
    expect(withHistory.ageNormalized?.ratio).toBe(9.5);
  });
});

// ── Retention ──────────────────────────────────────────

describe("snapshot retention", () => {
  it("thins old intra-day readings while keeping the first, the last and each day's shape", async () => {
    await workspace("Retention");
    await setPolicy({ dailyBudget: 1_000, manualReserve: 200, snapshotThinAfterDays: 30 });
    const now = new Date(BASE_TIME);

    // Day −100: four readings. Day −99: three. Plus one from yesterday.
    const old: Array<[number, number]> = [
      [100 * 24, 100], [100 * 24 - 3, 110], [100 * 24 - 6, 120], [100 * 24 - 9, 130],
      [99 * 24, 200], [99 * 24 - 4, 210], [99 * 24 - 8, 220],
      [24, 900],
    ];
    await prisma.videoSnapshot.createMany({
      data: old.map(([hoursAgo, views]) => ({
        videoId: "retainvid01",
        channelId: "UCretain000000000000001",
        views,
        collectedAt: new Date(now.getTime() - hoursAgo * HOUR),
      })),
    });

    const report = await pruneSnapshots(now);
    expect(report.thinAfterDays).toBe(30);

    const kept = await prisma.videoSnapshot.findMany({ orderBy: { collectedAt: "asc" } });
    // Oldest reading (first observation), the last reading of each old day, and
    // everything inside the retention window.
    expect(kept.map((row) => row.views)).toEqual([100, 130, 220, 900]);
    expect(report.deleted).toBe(4);
  });

  it("leaves recent snapshots alone", async () => {
    await workspace("Recent");
    await setPolicy({ snapshotThinAfterDays: 90 });
    const now = new Date(BASE_TIME);
    await prisma.videoSnapshot.createMany({
      data: [1, 2, 3, 4].map((hoursAgo) => ({
        videoId: "recentvid01",
        channelId: "UCrecent000000000000001",
        views: 100,
        collectedAt: new Date(now.getTime() - hoursAgo * HOUR),
      })),
    });

    const report = await pruneSnapshots(now);
    expect(report.deleted).toBe(0);
    expect(await prisma.videoSnapshot.count()).toBe(4);
  });
});
