import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  planDiscoverySet,
  rankSiblings,
  relatedEvidence,
  runDiscoverySet,
  videoGrowth,
  MAX_SET_QUERIES,
} from "@/lib/collection";
import { GET as listReferences, POST as saveReferences } from "@/app/api/references/route";
import { GET as listObservations, POST as saveObservation } from "@/app/api/observations/route";

// ── A fake YouTube Data API ────────────────────────────
//
// As in the collection-engine tests, only `fetch` is stubbed: the quota ledger,
// the caching and the batching under test are the real ones.

interface FakeVideo {
  id: string;
  channelId: string;
  title: string;
  publishedAt: string;
  views?: number;
  durationSeconds?: number;
}

const world = {
  videos: new Map<string, FakeVideo>(),
  /** Results per query string, so a set of queries can return different videos. */
  searchResults: new Map<string, string[]>(),
  failing: new Set<string>(),
  searches: [] as URL[],
};

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const endpoint = url.pathname.split("/").pop() ?? "";

  if (world.failing.has(endpoint)) {
    return Promise.resolve({
      ok: false,
      json: async () => ({}),
      text: async () => `${endpoint} is unavailable (403 quotaExceeded)`,
    } as Response);
  }

  if (endpoint === "search") {
    world.searches.push(url);
    const ids = world.searchResults.get(url.searchParams.get("q") ?? "") ?? [];
    return Promise.resolve(jsonResponse({ items: ids.map((id) => ({ id: { videoId: id } })) }));
  }

  if (endpoint === "videos") {
    const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
    return Promise.resolve(
      jsonResponse({
        items: ids.flatMap((id) => {
          const video = world.videos.get(id);
          if (!video) return [];
          return [
            {
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
              contentDetails: { duration: `PT${video.durationSeconds ?? 600}S` },
            },
          ];
        }),
      })
    );
  }

  if (endpoint === "channels") {
    const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
    return Promise.resolve(
      jsonResponse({
        items: ids.map((id) => ({
          id,
          snippet: { title: `Channel ${id}` },
          contentDetails: { relatedPlaylists: { uploads: `UU${id.slice(2)}` } },
          statistics: { subscriberCount: "5000", viewCount: "100000", videoCount: "20" },
        })),
      })
    );
  }

  throw new Error(`Unexpected request to ${url.pathname}`);
}

const BASE_TIME = Date.parse("2026-06-01T00:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BASE = "http://localhost/api";

function addSearch(query: string, videos: FakeVideo[]) {
  world.searchResults.set(
    query,
    videos.map((video) => video.id)
  );
  for (const video of videos) world.videos.set(video.id, video);
}

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function workspace(name: string, status = "active") {
  const row = await prisma.channelWorkspace.create({ data: { name, status } });
  return row.id;
}

async function setPolicy(fields: Partial<{ dailyBudget: number; manualReserve: number; searchCacheHours: number }>) {
  await prisma.quotaPolicy.upsert({ where: { id: 1 }, create: { id: 1, ...fields }, update: fields });
}

beforeEach(async () => {
  world.videos.clear();
  world.searchResults.clear();
  world.failing.clear();
  world.searches = [];
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  await prisma.referenceItem.deleteMany();
  await prisma.referenceCollection.deleteMany();
  await prisma.manualObservation.deleteMany();
  await prisma.quotaEvent.deleteMany();
  await prisma.collectionJob.deleteMany();
  await prisma.discoverySearch.deleteMany();
  await prisma.videoSnapshot.deleteMany();
  await prisma.channelWorkspace.deleteMany();
  await prisma.quotaPolicy.deleteMany();
  await setPolicy({ dailyBudget: 10_000, manualReserve: 200, searchCacheHours: 24 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Bounded query sets ─────────────────────────────────

describe("bounded query sets", () => {
  const spanish = {
    id: "essetvid001",
    channelId: "UCspanishchannel00000001",
    title: "Cómo empezar sin dinero",
    publishedAt: new Date(BASE_TIME).toISOString(),
    views: 90_000,
  };
  const english = {
    id: "ensetvid001",
    channelId: "UCenglishchannel00000001",
    title: "How I started with nothing",
    publishedAt: new Date(BASE_TIME).toISOString(),
    views: 40_000,
  };

  beforeEach(() => {
    addSearch("empezar sin dinero", [spanish]);
    addSearch("started with nothing", [english]);
  });

  it("prices every query at its worst case before anything is spent", async () => {
    const id = await workspace("Planning");
    const plan = await planDiscoverySet(id, [
      { query: "empezar sin dinero", language: "es", region: "MX", mechanism: "money anxiety" },
      { query: "started with nothing", language: "en", region: "US", mechanism: "money anxiety" },
    ]);

    expect(plan.maxQuotaUnits).toBe(204);
    expect(plan.queries.map((query) => query.maxQuotaUnits)).toEqual([102, 102]);
    expect(plan.queries[0].mechanism).toBe("money anxiety");
    expect(plan.exceedsBudget).toBe(false);
    expect(world.searches, "pricing must not send a request").toHaveLength(0);
  });

  it("prices a scope that is already stored at zero and flags a set that does not fit", async () => {
    const id = await workspace("Cached planning");
    await runDiscoverySet(id, [{ query: "empezar sin dinero", language: "es" }]);
    await setPolicy({ dailyBudget: 400, manualReserve: 200 });

    const plan = await planDiscoverySet(id, [
      { query: "empezar sin dinero", language: "es" },
      { query: "started with nothing", language: "en" },
    ]);

    expect(plan.queries[0]).toMatchObject({ cached: true, maxQuotaUnits: 0 });
    expect(plan.queries[0].cacheExpiresAt).not.toBeNull();
    expect(plan.maxQuotaUnits).toBe(102);
    // 400 budget − 200 manual reserve − 102 already settled = 98 automated units.
    expect(plan.availableForAutomated).toBe(98);
    expect(plan.exceedsBudget).toBe(true);
  });

  it("refuses a set larger than the bound", async () => {
    const id = await workspace("Too many");
    const queries = Array.from({ length: MAX_SET_QUERIES + 1 }, (_, i) => ({ query: `q${i}` }));
    await expect(planDiscoverySet(id, queries)).rejects.toThrow(/limited to 6 queries/);
  });

  it("keeps each query's language and region on its own results", async () => {
    const id = await workspace("Bilingual");
    const run = await runDiscoverySet(id, [
      { query: "empezar sin dinero", language: "es", region: "MX", mechanism: "money anxiety" },
      { query: "started with nothing", language: "en", region: "US", mechanism: "money anxiety" },
    ]);

    expect(run.spentQuotaUnits).toBe(204);
    expect(run.blocked).toBeNull();
    expect(world.searches.map((url) => url.searchParams.get("relevanceLanguage"))).toEqual(["es", "en"]);
    expect(world.searches.map((url) => url.searchParams.get("regionCode"))).toEqual(["MX", "US"]);

    const [first, second] = run.results;
    expect(first.payload!.scope).toMatchObject({ language: "es", region: "MX" });
    expect(first.payload!.seeds[0].id).toBe(spanish.id);
    expect(second.payload!.scope).toMatchObject({ language: "en", region: "US" });
    expect(second.payload!.seeds[0].id).toBe(english.id);
    // Two niches, one job: the results never merge into a single scope.
    expect(first.payload!.seeds[0].channelId).not.toBe(second.payload!.seeds[0].channelId);
  });

  it("stops the set when the budget runs out and says which queries never ran", async () => {
    const id = await workspace("Budget stop");
    await setPolicy({ dailyBudget: 350, manualReserve: 100 });

    const run = await runDiscoverySet(id, [
      { query: "empezar sin dinero" },
      { query: "started with nothing" },
      { query: "empezar sin dinero", region: "AR" },
      { query: "started with nothing", region: "AR" },
    ]);

    expect(run.results[0].payload).not.toBeNull();
    expect(run.results[1].payload).not.toBeNull();
    expect(run.blocked).toMatch(/Collection blocked/);
    // The query that hit the wall reports the wall; the ones behind it say they
    // never ran rather than looking like empty results.
    expect(run.results[2].payload).toBeNull();
    expect(run.results[2].error).toMatch(/Collection blocked/);
    expect(run.results[3].error).toBe("Not run — the budget stopped the set.");
    expect(world.searches, "a blocked query sends no request").toHaveLength(2);
  });

  it("carries on with the rest of the set when one query fails", async () => {
    const id = await workspace("Partial failure");
    world.failing.add("videos");

    const run = await runDiscoverySet(id, [{ query: "empezar sin dinero" }, { query: "started with nothing" }]);

    expect(run.results.every((row) => row.error !== null)).toBe(true);
    expect(world.searches, "the second query still ran").toHaveLength(2);
    const events = await prisma.quotaEvent.findMany();
    expect(events.every((event) => event.result === "failed")).toBe(true);
    expect(events.every((event) => event.actualCost === 102)).toBe(true);
  });
});

// ── Related evidence ───────────────────────────────────

describe("related evidence", () => {
  it("removes the studied channel and reports how many results that dropped", async () => {
    const id = await workspace("Related");
    addSearch("the same idea", [
      {
        id: "ownvid00001",
        channelId: "UCstudiedchannel00000001",
        title: "The same idea, by the same channel",
        publishedAt: new Date(BASE_TIME).toISOString(),
        views: 10_000,
      },
      {
        id: "othvid00001",
        channelId: "UCotherchannel000000001",
        title: "The same idea, someone else",
        publishedAt: new Date(BASE_TIME).toISOString(),
        views: 20_000,
      },
    ]);

    const result = await relatedEvidence(id, {
      query: "the same idea",
      excludeChannelId: "UCstudiedchannel00000001",
    });

    expect(result.excludedSameChannel).toBe(1);
    expect(result.payload.seeds.map((seed) => seed.channelId)).toEqual(["UCotherchannel000000001"]);
  });
});

// ── Growth for an untracked video ──────────────────────

describe("growth for a video nobody tracks", () => {
  it("measures the interval between two analyses of the same video", async () => {
    await prisma.videoSnapshot.createMany({
      data: [
        {
          videoId: "solo0000001",
          channelId: "UCuntrackedchannel000001",
          views: 10_000,
          publishedAt: new Date(BASE_TIME - 10 * DAY),
          collectedAt: new Date(BASE_TIME),
        },
        {
          videoId: "solo0000001",
          channelId: "UCuntrackedchannel000001",
          views: 16_000,
          publishedAt: new Date(BASE_TIME - 10 * DAY),
          collectedAt: new Date(BASE_TIME + 26 * HOUR),
        },
      ],
    });

    const growth = await videoGrowth("solo0000001");
    expect(growth).not.toBeNull();
    expect(growth!.snapshotCount).toBe(2);
    expect(growth!.velocity.daily).toMatchObject({ viewChange: 6_000, intervalHours: 26 });
    expect(growth!.velocity.multiDay, "26 hours is not a multi-day span").toBeNull();
  });

  it("returns nothing for a video that has never been observed", async () => {
    expect(await videoGrowth("neverseen01")).toBeNull();
  });
});

// ── Sibling ranking ────────────────────────────────────

describe("sibling ranking", () => {
  it("leaves the analyzed video out of its own sibling list", async () => {
    const videos = Array.from({ length: 12 }, (_, i) => ({
      id: `sib${String(i).padStart(8, "0")}`,
      title: `Upload ${i}`,
      publishedAt: new Date(BASE_TIME - i * DAY),
      views: i === 0 ? 500_000 : 10_000,
      durationSeconds: 600,
      liveBroadcastContent: "none" as const,
      hasLiveStreamingDetails: false,
    }));

    const ranked = rankSiblings(videos, new Date(BASE_TIME), "sib00000000");
    expect(ranked.siblings.some((sibling) => sibling.id === "sib00000000")).toBe(false);
    expect(ranked.uploadsScored).toBeGreaterThan(0);
    expect(ranked.uploadsScored + ranked.uploadsWithoutBaseline).toBe(videos.length);
  });
});

// ── Saving evidence ────────────────────────────────────

describe("saving evidence", () => {
  const item = {
    videoId: "refvid00001",
    title: "A reference",
    channelId: "UCrefchannel00000000001",
    channelName: "Channel UCrefchannel00000000001",
    thumbnailUrl: "https://i.ytimg.com/vi/refvid00001/hq.jpg",
    views: 12_345,
    publishedAt: new Date(BASE_TIME).toISOString(),
    format: "long-form",
    language: "es",
    region: "MX",
    sourceQuery: "empezar sin dinero",
  };

  it("saves one selection into several workspaces at once", async () => {
    const first = await workspace("Salsa");
    const second = await workspace("Tools");

    const res = await saveReferences(
      post(`${BASE}/references`, {
        workspaceIds: [first, second],
        name: "Curiosity hooks",
        question: "which hook travels?",
        items: [{ ...item, use: "thumbnail" }],
      })
    );
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.saved.map((row: { added: number }) => row.added)).toEqual([1, 1]);

    const listed = await listReferences(new NextRequest(`${BASE}/references?workspaceId=${first}`));
    const listing = await listed.json();
    expect(listing.collections).toHaveLength(1);
    expect(listing.collections[0].items[0]).toMatchObject({
      use: "thumbnail",
      language: "es",
      region: "MX",
      sourceQuery: "empezar sin dinero",
    });
    expect(listing.uses).toContain("production");
  });

  it("keeps the same video once per reason and adds it again for a different one", async () => {
    const id = await workspace("Dedupe");
    const save = (use: string) =>
      saveReferences(
        post(`${BASE}/references`, {
          workspaceIds: [id],
          name: "Set",
          items: [{ ...item, use }],
        })
      );

    expect((await (await save("thumbnail")).json()).saved[0].added).toBe(1);
    expect((await (await save("thumbnail")).json()).saved[0]).toMatchObject({ added: 0, alreadyPresent: 1 });
    expect((await (await save("title")).json()).saved[0].added).toBe(1);

    const items = await prisma.referenceItem.findMany();
    expect(items.map((row) => row.use).sort()).toEqual(["thumbnail", "title"]);
  });

  it("refuses to save into an archived workspace", async () => {
    const archived = await workspace("Archived", "archived");
    const res = await saveReferences(
      post(`${BASE}/references`, {
        workspaceIds: [archived],
        name: "Set",
        items: [{ ...item, use: "topic" }],
      })
    );
    expect(res.status).toBe(404);
    expect(await prisma.referenceCollection.count()).toBe(0);
  });

  it("keeps a manual observation separate from every measurement", async () => {
    const id = await workspace("Observations");
    const res = await saveObservation(
      post(`${BASE}/observations`, {
        workspaceId: id,
        entityType: "video",
        entityId: "refvid00001",
        topic: "Starting with no budget",
        viewerPromise: "A first result in a week",
        productionStyle: "Phone camera, no music",
      })
    );
    expect(res.status).toBe(200);

    const listed = await listObservations(
      new NextRequest(`${BASE}/observations?workspaceId=${id}&entityId=refvid00001`)
    );
    const body = await listed.json();
    expect(body.observations).toHaveLength(1);
    expect(body.observations[0]).toMatchObject({
      topic: "Starting with no budget",
      viewerPromise: "A first result in a week",
      productionStyle: "Phone camera, no music",
      titleThumbnail: "",
    });

    const other = await workspace("Other");
    const otherListing = await (
      await listObservations(new NextRequest(`${BASE}/observations?workspaceId=${other}`))
    ).json();
    expect(otherListing.observations, "observations belong to one workspace").toHaveLength(0);
  });
});
