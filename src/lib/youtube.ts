import { YOUTUBE_API_KEY } from "./env";
import type { VideoResult, SearchFilters } from "@/types/video";

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

function buildSearchParams(filters: SearchFilters, query: string): URLSearchParams {
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

  // Smart videoDuration: use min/max duration to set API-level pre-filter
  if (filters.minDuration && filters.minDuration >= 20) {
    params.set("videoDuration", "long"); // > 20 min
  } else if (filters.maxDuration && filters.maxDuration <= 4) {
    params.set("videoDuration", "short"); // < 4 min
  } else if (filters.videoType === "short") {
    params.set("videoDuration", "short");
  } else if (filters.videoType === "medium") {
    params.set("videoDuration", "medium");
  } else if (filters.videoType === "long") {
    params.set("videoDuration", "long");
  }

  return params;
}

// Returns true if the filters include criteria that YouTube API can't handle
// (subscribers, engagement, exact duration ranges) — meaning we'll lose results
// to post-filtering and should fetch extra pages.
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
  const params = buildSearchParams(filters, query);
  const allIds: string[] = [];

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(`${BASE_URL}/search?${params}`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`YouTube search failed: ${err}`);
    }
    const data = await res.json();
    const ids = (data.items || []).map((item: { id: { videoId: string } }) => item.id.videoId);
    allIds.push(...ids);

    // If there's a next page token, set it for the next iteration
    if (data.nextPageToken) {
      params.set("pageToken", data.nextPageToken);
    } else {
      break; // No more results
    }
  }

  return allIds;
}

export async function getVideoDetails(videoIds: string[]): Promise<VideoResult[]> {
  if (videoIds.length === 0) return [];

  const results: VideoResult[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet,statistics,contentDetails",
      id: batch.join(","),
      key: API_KEY,
    });

    const res = await fetch(`${BASE_URL}/videos?${params}`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`YouTube video details failed: ${err}`);
    }
    const data = await res.json();

    for (const item of data.items || []) {
      const hoursAge =
        (Date.now() - new Date(item.snippet.publishedAt).getTime()) / (1000 * 60 * 60);
      const views = parseInt(item.statistics.viewCount || "0");
      results.push({
        id: item.id,
        title: item.snippet.title,
        channelId: item.snippet.channelId,
        channelName: item.snippet.channelTitle,
        views,
        likes: parseInt(item.statistics.likeCount || "0"),
        comments: parseInt(item.statistics.commentCount || "0"),
        duration: item.contentDetails.duration,
        publishedAt: item.snippet.publishedAt,
        defaultLanguage: item.snippet.defaultLanguage || null,
        defaultAudioLanguage: item.snippet.defaultAudioLanguage || null,
        thumbnailUrl:
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url ||
          "",
        description: (item.snippet.description || "").slice(0, 500),
        outlierScore: null,
        viewsPerHour: Math.round(views / Math.max(hoursAge, 1)),
        channelSubscribers: null,
        channelAverageViews: null,
        engagementRate: null,
        viewsToSubsRatio: null,
      });
    }
  }

  return results;
}

export async function getChannelStats(
  channelIds: string[]
): Promise<Map<string, { subscribers: number; averageViews: number; name: string }>> {
  const statsMap = new Map<
    string,
    { subscribers: number; averageViews: number; name: string }
  >();
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
    if (!res.ok) continue;
    const data = await res.json();

    for (const item of data.items || []) {
      const subscribers = parseInt(item.statistics.subscriberCount || "0");
      const totalViews = parseInt(item.statistics.viewCount || "0");
      const videoCount = parseInt(item.statistics.videoCount || "1");
      const averageViews = videoCount > 0 ? totalViews / videoCount : 0;
      statsMap.set(item.id, { subscribers, averageViews, name: item.snippet.title });
    }
  }

  return statsMap;
}

function applyPostFilters(videos: VideoResult[], filters: SearchFilters): VideoResult[] {
  let filtered = videos;

  if (filters.maxSubscribers) {
    filtered = filtered.filter(
      (v) => (v.channelSubscribers || 0) <= filters.maxSubscribers!
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
      (v) => (v.engagementRate || 0) >= filters.minEngagement!
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

function enrichWithChannelStats(
  videos: VideoResult[],
  channelStats: Map<string, { subscribers: number; averageViews: number; name: string }>
): VideoResult[] {
  return videos
    .map((video) => {
      const channel = channelStats.get(video.channelId);
      if (!channel) return null;

      const outlierScore =
        channel.averageViews > 0
          ? video.views / channel.averageViews
          : 0;
      const viewsToSubsRatio =
        channel.subscribers > 0 ? video.views / channel.subscribers : 0;
      const engagementRate =
        video.views > 0
          ? ((video.likes + video.comments) / video.views) * 100
          : 0;

      return {
        ...video,
        outlierScore: Math.round(outlierScore * 100) / 100,
        channelSubscribers: channel.subscribers,
        channelAverageViews: Math.round(channel.averageViews),
        engagementRate: Math.round(engagementRate * 100) / 100,
        viewsToSubsRatio: Math.round(viewsToSubsRatio * 100) / 100,
      };
    })
    .filter((v) => v !== null) as VideoResult[];
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

  // 6. Sort by outlier score descending and limit to requested count
  filtered.sort((a, b) => (b.outlierScore || 0) - (a.outlierScore || 0));
  const results = filtered.slice(0, targetCount);

  return results;
}
