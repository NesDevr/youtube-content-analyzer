import { YOUTUBE_API_KEY } from "./env";
import type { VideoResult, SearchFilters } from "@/types/video";
import {
  classifyFormat,
  legacyLifetimeAverageRatio,
  type UploadVideo,
  type VideoFormat,
} from "./metrics/outlier";

export type { VideoResult, SearchFilters };

const API_KEY = YOUTUBE_API_KEY;
const BASE_URL = "https://www.googleapis.com/youtube/v3";
const MAX_SEARCH_VARIANTS = 6;

// ── Helpers ────────────────────────────────────────────

export function parseDuration(iso: string): number {
  // PT1H2M3S → seconds
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0");
  const m = parseInt(match[2] || "0");
  const s = parseInt(match[3] || "0");
  return h * 3600 + m * 60 + s;
}

function durationMinutes(iso: string): number {
  return parseDuration(iso) / 60;
}

function hasNonEnglishTextSignals(video: VideoResult): boolean {
  const text = `${video.title} ${video.channelName} ${video.description}`;
  const nonLatinScript =
    /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0B00-\u0B7F\u0B80-\u0D7F\u0E00-\u0E7F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\u0600-\u06FF\u0400-\u04FF]/u;
  const nonEnglishLanguageLabel =
    /\b(hindi|telugu|tamil|kannada|malayalam|bengali|marathi|gujarati|punjabi|urdu|spanish|portuguese|french|german|japanese|korean)\b/i;
  const transliteratedHindiMarker =
    /\b(aahat|amavas|bhoot|bhootiya|bhutiya|chhalava|chudail|daak|deyyam|ghar|jinn|kahani|kahaniya|masaan|nazar|pishachini|shaapit|yakshini)\b/i;
  return (
    nonLatinScript.test(text) ||
    nonEnglishLanguageLabel.test(text) ||
    transliteratedHindiMarker.test(text)
  );
}

// ── API Calls ──────────────────────────────────────────

async function getSearchQuery(filters: SearchFilters, expandKeyword: boolean): Promise<string> {
  if (!expandKeyword) return filters.keyword;

  const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(filters.keyword)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) {
    throw new Error(`YouTube autocomplete failed: ${await res.text()}`);
  }

  const text = await res.text();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("YouTube autocomplete returned an unexpected response");
  }

  const data = JSON.parse(match[0]);
  const suggestions = (data[1] || []).map((item: [string]) => item[0]);
  const variants = [filters.keyword, ...suggestions]
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const uniqueVariants = [...new Map(
    variants.map((keyword) => [keyword.toLowerCase(), keyword])
  ).values()];

  return uniqueVariants.slice(0, MAX_SEARCH_VARIANTS).join("|");
}

/** The only duration control `search.list` has: one bucket per request. */
type DurationBucket = "short" | "medium" | "long";

/**
 * Which `videoDuration` buckets to ask YouTube for.
 *
 * `search.list` has no "no Shorts" switch and accepts a single bucket per
 * request — `short` (< 4 min), `medium` (4–20 min) or `long` (> 20 min) — so
 * excluding Shorts at the request means running the search once per remaining
 * bucket. Two consequences, both deliberate:
 *
 * - The cut is YouTube's 4 minutes, not the 180 seconds of `classifyFormat`, so
 *   3–4 minute long-form uploads never come back. `applyPostFilters` still runs
 *   the canonical rule on whatever does.
 * - No result slot is spent on a Short, so fewer pages are needed; the page
 *   budget in `findOutliers` is split across the buckets rather than added to.
 */
function searchDurationBuckets(filters: SearchFilters): (DurationBucket | null)[] {
  // An explicit duration filter already pins the bucket.
  if (filters.minDuration && filters.minDuration >= 20) return ["long"];
  if (filters.maxDuration && filters.maxDuration <= 4) return ["short"];
  if (filters.videoType && filters.videoType !== "any") return [filters.videoType];
  if (filters.excludeShorts === false) return [null];
  if (filters.maxDuration && filters.maxDuration <= 20) return ["medium"];
  return ["medium", "long"];
}

function buildSearchParams(
  filters: SearchFilters,
  query: string,
  bucket: DurationBucket | null
): URLSearchParams {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    order: "relevance",
    maxResults: "50",
    key: API_KEY,
  });

  if (filters.publishedAfter) params.set("publishedAfter", filters.publishedAfter);
  if (filters.publishedBefore) params.set("publishedBefore", filters.publishedBefore);
  if (filters.language) params.set("relevanceLanguage", filters.language);
  if (bucket) params.set("videoDuration", bucket);

  return params;
}

// Returns true if the filters include criteria that YouTube API can't handle
// (subscribers, engagement, exact duration ranges) — meaning we'll lose results
// to post-filtering and should fetch extra pages. Excluding Shorts is no longer
// one of them: `searchDurationBuckets` keeps them out of the response entirely.
function hasHeavyPostFilters(filters: SearchFilters): boolean {
  return !!(filters.maxSubscribers || filters.minViews || filters.minEngagement ||
    (filters.minDuration && filters.minDuration > 0) ||
    (filters.maxDuration && filters.maxDuration > 0));
}

export async function searchVideos(
  filters: SearchFilters,
  maxPages: number = 1,
  expandKeyword: boolean = false
): Promise<string[]> {
  const query = await getSearchQuery(filters, expandKeyword);
  const buckets = searchDurationBuckets(filters);
  // `maxPages` is the whole budget for this search: one `search.list` call costs
  // 100 quota units, so asking for two buckets must not double the bill.
  const pagesPerBucket = Math.max(1, Math.floor(maxPages / buckets.length));
  // An expanded `a|b|c` query can return the same video on more than one page,
  // and the buckets can overlap at their edges, which would otherwise inflate
  // the result count and duplicate React keys.
  const seen = new Set<string>();
  const allIds: string[] = [];

  for (const bucket of buckets) {
    const params = buildSearchParams(filters, query, bucket);

    for (let page = 0; page < pagesPerBucket; page++) {
      const res = await fetch(`${BASE_URL}/search?${params}`);
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`YouTube search failed: ${err}`);
      }
      const data = await res.json();
      for (const item of data.items || []) {
        const id = item.id?.videoId;
        if (id && !seen.has(id)) {
          seen.add(id);
          allIds.push(id);
        }
      }

      // If there's a next page token, set it for the next iteration
      if (data.nextPageToken) {
        params.set("pageToken", data.nextPageToken);
      } else {
        break; // No more results in this bucket
      }
    }
  }

  return allIds;
}

/** The `videos.list` fields this codebase reads, whatever `part` was requested. */
interface VideoListItem {
  id: string;
  snippet: {
    title: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    description?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
    liveBroadcastContent?: string;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
  liveStreamingDetails?: unknown;
}

/**
 * Batched `videos.list`, 50 ids and 1 quota unit per request. The single place
 * that talks to that endpoint, so every caller pages and fails the same way.
 */
async function fetchVideoItems(
  videoIds: string[],
  part: string
): Promise<VideoListItem[]> {
  const items: VideoListItem[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const params = new URLSearchParams({
      part,
      id: videoIds.slice(i, i + 50).join(","),
      key: API_KEY,
    });
    const res = await fetch(`${BASE_URL}/videos?${params}`);
    if (!res.ok) {
      throw new Error(`YouTube video lookup failed: ${await res.text()}`);
    }
    const data = await res.json();
    items.push(...((data.items || []) as VideoListItem[]));
  }
  return items;
}

function bestThumbnail(item: VideoListItem): string {
  const thumbnails = item.snippet.thumbnails;
  return (
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url ||
    ""
  );
}

export async function getVideoDetails(videoIds: string[]): Promise<VideoResult[]> {
  if (videoIds.length === 0) return [];

  const items = await fetchVideoItems(videoIds, "snippet,statistics,contentDetails");
  return items.map((item) => {
    const hoursAge =
      (Date.now() - new Date(item.snippet.publishedAt).getTime()) / (1000 * 60 * 60);
    const views = parseInt(item.statistics?.viewCount || "0");
    return {
      id: item.id,
      title: item.snippet.title,
      channelId: item.snippet.channelId,
      channelName: item.snippet.channelTitle,
      views,
      likes: parseInt(item.statistics?.likeCount || "0"),
      comments: parseInt(item.statistics?.commentCount || "0"),
      duration: item.contentDetails?.duration || "PT0S",
      publishedAt: item.snippet.publishedAt,
      defaultLanguage: item.snippet.defaultLanguage || null,
      defaultAudioLanguage: item.snippet.defaultAudioLanguage || null,
      thumbnailUrl: bestThumbnail(item),
      description: (item.snippet.description || "").slice(0, 500),
      outlierScore: null,
      viewsPerHour: Math.round(views / Math.max(hoursAge, 1)),
      channelSubscribers: null,
      channelAverageViews: null,
      engagementRate: null,
      viewsToSubsRatio: null,
    };
  });
}

export interface ChannelStats {
  /** `null` when the channel hides its subscriber count. Never 0 as a stand-in. */
  subscribers: number | null;
  /** Lifetime views ÷ video count. `null` when either figure is unavailable. */
  averageViews: number | null;
  name: string;
}

export async function getChannelStats(
  channelIds: string[]
): Promise<Map<string, ChannelStats>> {
  const statsMap = new Map<string, ChannelStats>();
  if (channelIds.length === 0) return statsMap;

  const uniqueIds = [...new Set(channelIds)];

  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: batch.join(","),
      key: API_KEY,
    });

    const res = await fetch(`${BASE_URL}/channels?${params}`);
    if (!res.ok) {
      // Skipping the batch would silently drop every video on those channels
      // and make the result set look like the search found less.
      throw new Error(`YouTube channel stats failed: ${await res.text()}`);
    }
    const data = await res.json();

    for (const item of data.items || []) {
      const rawSubscribers = item.statistics?.subscriberCount;
      const rawViews = item.statistics?.viewCount;
      const videoCount = parseInt(item.statistics?.videoCount ?? "0");
      statsMap.set(item.id, {
        subscribers:
          item.statistics?.hiddenSubscriberCount || rawSubscribers === undefined
            ? null
            : parseInt(rawSubscribers),
        averageViews:
          rawViews === undefined || videoCount <= 0
            ? null
            : parseInt(rawViews) / videoCount,
        name: item.snippet.title,
      });
    }
  }

  return statsMap;
}

function applyPostFilters(videos: VideoResult[], filters: SearchFilters): VideoResult[] {
  let filtered = videos;

  // Shorts are excluded unless explicitly asked for. The rule is the canonical
  // one in the metrics module, so search and baselines agree on what a Short is.
  if (filters.excludeShorts !== false) {
    filtered = filtered.filter(
      (v) =>
        classifyFormat({ durationSeconds: parseDuration(v.duration) }) !== "short"
    );
  }

  // A video whose subscriber count or engagement rate is unknown cannot be
  // shown to satisfy a threshold on it, so it is dropped rather than counted
  // as 0 — which would have let every unknown pass a "max subscribers" filter.
  if (filters.maxSubscribers) {
    filtered = filtered.filter(
      (v) =>
        v.channelSubscribers !== null &&
        v.channelSubscribers <= filters.maxSubscribers!
    );
  }

  if (filters.minViews) {
    filtered = filtered.filter((v) => v.views >= filters.minViews!);
  }

  if (filters.minDuration) {
    filtered = filtered.filter(
      (v) => durationMinutes(v.duration) >= filters.minDuration!
    );
  }

  if (filters.maxDuration) {
    filtered = filtered.filter(
      (v) => durationMinutes(v.duration) <= filters.maxDuration!
    );
  }

  if (filters.minEngagement) {
    filtered = filtered.filter(
      (v) => v.engagementRate !== null && v.engagementRate >= filters.minEngagement!
    );
  }

  if (filters.language) {
    const language = filters.language.toLowerCase();
    filtered = filtered.filter((v) => {
      const videoLanguage = v.defaultAudioLanguage || v.defaultLanguage;
      const matchesLanguage = videoLanguage?.toLowerCase().split("-")[0] === language;
      if (!matchesLanguage) return false;
      return language !== "en" || !hasNonEnglishTextSignals(v);
    });
  }

  return filtered;
}

/**
 * Attaches channel-derived figures. Every one of them is null when it cannot be
 * computed — a channel with no lifetime average, no subscribers or a video with
 * no views produces no ratio, never a 0 that would sort and read like a real
 * measurement. The ratio itself comes from the canonical metrics module.
 */
function enrichWithChannelStats(
  videos: VideoResult[],
  channelStats: Map<string, ChannelStats>
): VideoResult[] {
  return videos
    .map((video) => {
      const channel = channelStats.get(video.channelId);
      if (!channel) return null;

      const viewsToSubsRatio =
        channel.subscribers !== null && channel.subscribers > 0
          ? Math.round((video.views / channel.subscribers) * 100) / 100
          : null;
      const engagementRate =
        video.views > 0
          ? Math.round(
              ((video.likes + video.comments) / video.views) * 100 * 100
            ) / 100
          : null;

      return {
        ...video,
        outlierScore: legacyLifetimeAverageRatio(
          video.views,
          channel.averageViews
        ),
        channelSubscribers: channel.subscribers,
        channelAverageViews:
          channel.averageViews !== null && channel.averageViews > 0
            ? Math.round(channel.averageViews)
            : null,
        engagementRate,
        viewsToSubsRatio,
      };
    })
    .filter((v) => v !== null) as VideoResult[];
}

// ── Uploads-playlist collection (no search.list quota) ──

/**
 * How many of a channel's most recent uploads a single analysis will scan.
 * 200 uploads costs 4 `playlistItems.list` + 4 `videos.list` calls = 8 quota
 * units, versus 100 units for one `search.list`.
 */
export const MAX_UPLOADS_SCANNED = 200;

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts a video id from a watch/short/live/embed/youtu.be URL, or accepts a
 * bare id. Returns `null` when the input is not a YouTube video reference —
 * callers must surface that rather than guessing.
 */
export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") {
    return null;
  }

  const queryId = url.searchParams.get("v");
  if (queryId && VIDEO_ID_PATTERN.test(queryId)) return queryId;

  const segments = url.pathname.split("/").filter(Boolean);
  if (
    segments.length >= 2 &&
    ["shorts", "live", "embed", "v"].includes(segments[0])
  ) {
    return VIDEO_ID_PATTERN.test(segments[1]) ? segments[1] : null;
  }

  return null;
}

export interface ChannelSummary {
  id: string;
  name: string;
  subscribers: number | null;
  totalViews: bigint | null;
  videoCount: number | null;
  /** Lifetime views ÷ video count — only used to show the legacy metric. */
  lifetimeAverageViews: number | null;
  uploadsPlaylistId: string;
}

/** Looks up a channel's uploads playlist. 1 quota unit. */
export async function getChannelUploadsInfo(
  channelId: string
): Promise<ChannelSummary | null> {
  const params = new URLSearchParams({
    part: "snippet,contentDetails,statistics",
    id: channelId,
    key: API_KEY,
  });
  const res = await fetch(`${BASE_URL}/channels?${params}`);
  if (!res.ok) {
    throw new Error(`YouTube channel lookup failed: ${await res.text()}`);
  }
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;

  const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return null;

  const totalViews = item.statistics?.viewCount;
  const videoCount = parseInt(item.statistics?.videoCount ?? "0");

  return {
    id: item.id,
    name: item.snippet.title,
    subscribers: item.statistics?.hiddenSubscriberCount
      ? null
      : parseInt(item.statistics?.subscriberCount ?? "0"),
    totalViews:
      totalViews === undefined ? null : BigInt(totalViews),
    videoCount: videoCount > 0 ? videoCount : null,
    lifetimeAverageViews:
      totalViews === undefined || videoCount <= 0
        ? null
        : Math.round(parseInt(totalViews) / videoCount),
    uploadsPlaylistId,
  };
}

/**
 * Enumerates the most recent uploads of a playlist, newest first.
 * 1 quota unit per 50 ids — no `search.list` involved.
 */
export async function listPlaylistVideoIds(
  playlistId: string,
  maxVideos: number
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < maxVideos) {
    const params = new URLSearchParams({
      part: "contentDetails",
      playlistId,
      maxResults: String(Math.min(50, maxVideos - ids.length)),
      key: API_KEY,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${BASE_URL}/playlistItems?${params}`);
    if (!res.ok) {
      throw new Error(`YouTube uploads enumeration failed: ${await res.text()}`);
    }
    const data = await res.json();
    for (const item of data.items || []) {
      const id = item.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return ids;
}

export interface UploadCollection {
  videos: UploadVideo[];
  /** Ids that `videos.list` did not return — private, deleted or region-blocked. */
  missingIds: string[];
}

/**
 * Fetches the metric inputs for a set of video ids. A video whose statistics
 * YouTube withholds gets `views: null` rather than 0, so an unknown view count
 * is never mistaken for a real one.
 */
const UPLOAD_PARTS = "snippet,statistics,contentDetails,liveStreamingDetails";

function toUploadVideo(item: VideoListItem): UploadVideo {
  const rawViews = item.statistics?.viewCount;
  return {
    id: item.id,
    title: item.snippet.title,
    publishedAt: new Date(item.snippet.publishedAt),
    views: rawViews === undefined ? null : parseInt(rawViews),
    durationSeconds: parseDuration(item.contentDetails?.duration || "PT0S"),
    liveBroadcastContent: item.snippet.liveBroadcastContent ?? null,
    hasLiveStreamingDetails: Boolean(item.liveStreamingDetails),
  };
}

export async function getUploadVideos(
  videoIds: string[]
): Promise<UploadCollection> {
  const items = await fetchVideoItems(videoIds, UPLOAD_PARTS);
  const returned = new Set(items.map((item) => item.id));
  return {
    videos: items.map(toUploadVideo),
    missingIds: videoIds.filter((id) => !returned.has(id)),
  };
}

/** Full metadata for one video, plus its channel id. */
export async function getUploadVideo(videoId: string): Promise<
  | { video: UploadVideo; channelId: string; channelName: string; thumbnailUrl: string; likes: number | null; comments: number | null }
  | null
> {
  const [item] = await fetchVideoItems([videoId], UPLOAD_PARTS);
  if (!item) return null;

  const rawLikes = item.statistics?.likeCount;
  const rawComments = item.statistics?.commentCount;

  return {
    video: toUploadVideo(item),
    channelId: item.snippet.channelId,
    channelName: item.snippet.channelTitle,
    thumbnailUrl: bestThumbnail(item),
    likes: rawLikes === undefined ? null : parseInt(rawLikes),
    comments: rawComments === undefined ? null : parseInt(rawComments),
  };
}

// ── Narrow seed discovery (exactly one search.list) ────

/**
 * The scope of a discovery search, stored verbatim alongside its results.
 *
 * Every field is sent to `search.list` as written — the keyword is never
 * expanded through autocomplete here, because a cached result has to be
 * reproducible from the scope that is displayed next to it.
 */
export interface DiscoveryScope {
  query: string;
  /** `relevanceLanguage`; empty means unspecified. */
  language: string;
  /** `regionCode`; empty means unspecified. */
  region: string;
  publishedAfter: string;
  publishedBefore: string;
  /** YouTube's own duration buckets: short < 4 min, medium 4–20, long > 20. */
  duration: "any" | "short" | "medium" | "long";
  maxResults: number;
}

export interface SeedVideo {
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  channelSubscribers: number | null;
  /** `null` when YouTube withholds the view count. */
  views: number | null;
  durationSeconds: number;
  publishedAt: string;
  thumbnailUrl: string;
  format: VideoFormat;
}

export interface SeedCollection {
  seeds: SeedVideo[];
  /** Ids `search.list` returned that `videos.list` did not. */
  unavailableVideoIds: string[];
  /** Channels `channels.list` did not return, so their seeds carry no subscriber count. */
  channelsWithoutStats: string[];
  quotaUnits: number;
}

/** Quota cost of one `search.list` request. Every other endpoint used here costs 1. */
export const SEARCH_LIST_COST = 100;

/**
 * One page of keyword search, then batched detail lookups. Seeds only —
 * baselines and growth come from the uploads playlist and stored snapshots,
 * which cost 1 unit per 50 items instead of 100 per request.
 */
export async function collectSeeds(scope: DiscoveryScope): Promise<SeedCollection> {
  const params = new URLSearchParams({
    part: "snippet",
    q: scope.query,
    type: "video",
    order: "relevance",
    maxResults: String(Math.min(50, Math.max(1, scope.maxResults))),
    key: API_KEY,
  });
  if (scope.language) params.set("relevanceLanguage", scope.language);
  if (scope.region) params.set("regionCode", scope.region);
  if (scope.publishedAfter) params.set("publishedAfter", scope.publishedAfter);
  if (scope.publishedBefore) params.set("publishedBefore", scope.publishedBefore);
  if (scope.duration !== "any") params.set("videoDuration", scope.duration);

  const res = await fetch(`${BASE_URL}/search?${params}`);
  if (!res.ok) {
    throw new Error(`YouTube search failed: ${await res.text()}`);
  }
  const data = await res.json();
  const ids: string[] = [];
  for (const item of data.items || []) {
    const id = item.id?.videoId;
    if (id && !ids.includes(id)) ids.push(id);
  }

  const items = await fetchVideoItems(ids, UPLOAD_PARTS);
  const channelIds = [...new Set(items.map((item) => item.snippet.channelId))];
  const channelStats = await getChannelStats(channelIds);

  const seeds: SeedVideo[] = items.map((item) => {
    const upload = toUploadVideo(item);
    return {
      id: upload.id,
      title: upload.title,
      channelId: item.snippet.channelId,
      channelName: item.snippet.channelTitle,
      channelSubscribers: channelStats.get(item.snippet.channelId)?.subscribers ?? null,
      views: upload.views,
      durationSeconds: upload.durationSeconds,
      publishedAt: upload.publishedAt.toISOString(),
      thumbnailUrl: bestThumbnail(item),
      format: classifyFormat(upload),
    };
  });

  const returnedIds = new Set(items.map((item) => item.id));
  return {
    seeds,
    unavailableVideoIds: ids.filter((id) => !returnedIds.has(id)),
    channelsWithoutStats: channelIds.filter((id) => !channelStats.has(id)),
    quotaUnits:
      SEARCH_LIST_COST +
      Math.ceil(ids.length / 50) +
      Math.ceil(channelIds.length / 50),
  };
}

export async function findOutliers(filters: SearchFilters): Promise<VideoResult[]> {
  const targetCount = filters.maxResults || 50;

  // When filters will discard many results, fetch up to 3 pages (150 videos)
  // so we still have enough after filtering. Without heavy filters, 1 page suffices.
  const maxPages = hasHeavyPostFilters(filters) ? 3 : 1;

  // 1. Search for videos (paginated if needed)
  const videoIds = await searchVideos(filters, maxPages, true);

  // 2. Get video details
  const videos = await getVideoDetails(videoIds);

  // 3. Get channel stats for all videos
  const channelIds = videos.map((v) => v.channelId);
  const channelStats = await getChannelStats(channelIds);

  // 4. Enrich with outlier scores
  const enriched = enrichWithChannelStats(videos, channelStats);

  // 5. Apply client-side filters
  const filtered = applyPostFilters(enriched, filters);

  // 6. Highest legacy ratio first; videos with no computable ratio go last
  filtered.sort((a, b) => (b.outlierScore ?? -1) - (a.outlierScore ?? -1));
  const results = filtered.slice(0, targetCount);

  return results;
}
