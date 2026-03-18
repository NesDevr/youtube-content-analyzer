import { prisma } from "./prisma";

const API_KEY = process.env.YOUTUBE_API_KEY!;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

// ── Types ──────────────────────────────────────────────

export interface VideoResult {
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  views: number;
  likes: number;
  comments: number;
  duration: string;
  publishedAt: string;
  thumbnailUrl: string;
  description: string;
  outlierScore: number | null;
  viewsPerHour: number | null;
  channelSubscribers: number | null;
  channelAverageViews: number | null;
  engagementRate: number | null;
  viewsToSubsRatio: number | null;
}

export interface SearchFilters {
  keyword: string;
  maxSubscribers?: number;
  minViews?: number;
  minDuration?: number; // minutes
  maxDuration?: number; // minutes
  videoType?: "any" | "short" | "long";
  publishedAfter?: string; // ISO date
  publishedBefore?: string; // ISO date
  language?: string;
  maxResults?: number;
  minEngagement?: number; // percentage
}

// ── Helpers ────────────────────────────────────────────

function parseDuration(iso: string): number {
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

// ── API Calls ──────────────────────────────────────────

export async function searchVideos(filters: SearchFilters): Promise<string[]> {
  const params = new URLSearchParams({
    part: "snippet",
    q: filters.keyword,
    type: "video",
    order: "viewCount",
    maxResults: String(filters.maxResults || 50),
    key: API_KEY,
  });

  if (filters.publishedAfter) params.set("publishedAfter", filters.publishedAfter);
  if (filters.publishedBefore) params.set("publishedBefore", filters.publishedBefore);
  if (filters.language) params.set("relevanceLanguage", filters.language);

  // Video duration filter for the API
  // Smart videoDuration: use min/max duration to set API-level pre-filter
  if (filters.minDuration && filters.minDuration >= 20) {
    params.set("videoDuration", "long"); // > 20 min
  } else if (filters.maxDuration && filters.maxDuration <= 4) {
    params.set("videoDuration", "short"); // < 4 min
  } else if (filters.videoType === "short") {
    params.set("videoDuration", "short");
  } else if (filters.videoType === "long") {
    params.set("videoDuration", "long");
  }

  const res = await fetch(`${BASE_URL}/search?${params}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube search failed: ${err}`);
  }
  const data = await res.json();
  return (data.items || []).map((item: { id: { videoId: string } }) => item.id.videoId);
}

export async function getVideoDetails(videoIds: string[]): Promise<VideoResult[]> {
  if (videoIds.length === 0) return [];

  // Batch in groups of 50 (API limit)
  const results: VideoResult[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);

    // Check cache first
    const cached = await prisma.video.findMany({
      where: { id: { in: batch } },
    });
    const cachedIds = new Set(cached.map((v) => v.id));
    const uncachedIds = batch.filter((id) => !cachedIds.has(id));

    // Fetch uncached from YouTube API
    if (uncachedIds.length > 0) {
      const params = new URLSearchParams({
        part: "snippet,statistics,contentDetails",
        id: uncachedIds.join(","),
        key: API_KEY,
      });

      const res = await fetch(`${BASE_URL}/videos?${params}`);
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`YouTube video details failed: ${err}`);
      }
      const data = await res.json();

      for (const item of data.items || []) {
        const video = {
          id: item.id,
          title: item.snippet.title,
          channelId: item.snippet.channelId,
          channelName: item.snippet.channelTitle,
          views: parseInt(item.statistics.viewCount || "0"),
          likes: parseInt(item.statistics.likeCount || "0"),
          comments: parseInt(item.statistics.commentCount || "0"),
          duration: item.contentDetails.duration,
          publishedAt: item.snippet.publishedAt,
          thumbnailUrl:
            item.snippet.thumbnails?.high?.url ||
            item.snippet.thumbnails?.medium?.url ||
            item.snippet.thumbnails?.default?.url ||
            "",
          description: (item.snippet.description || "").slice(0, 500),
        };

        // Cache in DB
        await prisma.video.upsert({
          where: { id: video.id },
          update: { ...video, publishedAt: new Date(video.publishedAt) },
          create: { ...video, publishedAt: new Date(video.publishedAt) },
        });

        cached.push({
          ...video,
          publishedAt: new Date(video.publishedAt),
          outlierScore: null,
          viewsPerHour: null,
          savedAt: new Date(),
        });
      }
    }

    // Convert cached videos to results (without channel stats yet)
    for (const v of cached) {
      if (!batch.includes(v.id)) continue;
      const hoursAge =
        (Date.now() - new Date(v.publishedAt).getTime()) / (1000 * 60 * 60);
      results.push({
        id: v.id,
        title: v.title,
        channelId: v.channelId,
        channelName: v.channelName,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        duration: v.duration,
        publishedAt: new Date(v.publishedAt).toISOString(),
        thumbnailUrl: v.thumbnailUrl,
        description: v.description,
        outlierScore: null,
        viewsPerHour: Math.round(v.views / Math.max(hoursAge, 1)),
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

    // Check cache (only if fetched recently — within 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const cached = await prisma.channel.findMany({
      where: {
        id: { in: batch },
        lastFetched: { gte: oneDayAgo },
      },
    });
    const cachedIds = new Set(cached.map((c) => c.id));

    for (const c of cached) {
      statsMap.set(c.id, {
        subscribers: c.subscribers,
        averageViews: c.averageViews || 0,
        name: c.name,
      });
    }

    const uncachedIds = batch.filter((id) => !cachedIds.has(id));
    if (uncachedIds.length === 0) continue;

    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: uncachedIds.join(","),
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

      await prisma.channel.upsert({
        where: { id: item.id },
        update: {
          name: item.snippet.title,
          subscribers,
          totalViews: BigInt(totalViews),
          videoCount,
          averageViews,
          lastFetched: new Date(),
        },
        create: {
          id: item.id,
          name: item.snippet.title,
          subscribers,
          totalViews: BigInt(totalViews),
          videoCount,
          averageViews,
          lastFetched: new Date(),
        },
      });

      statsMap.set(item.id, { subscribers, averageViews, name: item.snippet.title });
    }
  }

  return statsMap;
}

export async function findOutliers(filters: SearchFilters): Promise<VideoResult[]> {
  // 1. Search for videos
  const videoIds = await searchVideos(filters);

  // 2. Get video details
  const videos = await getVideoDetails(videoIds);

  // 3. Get channel stats for all videos
  const channelIds = videos.map((v) => v.channelId);
  const channelStats = await getChannelStats(channelIds);

  // 4. Calculate outlier scores and apply filters
  const enriched = videos
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

  // Apply client-side filters
  let filtered = enriched;

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

  // Sort by outlier score descending
  filtered.sort((a, b) => (b.outlierScore || 0) - (a.outlierScore || 0));

  // Update outlier scores in DB
  for (const v of filtered) {
    await prisma.video.update({
      where: { id: v.id },
      data: {
        outlierScore: v.outlierScore,
        viewsPerHour: v.viewsPerHour,
      },
    });
  }

  return filtered;
}
