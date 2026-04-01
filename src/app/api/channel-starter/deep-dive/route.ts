import { NextRequest, NextResponse } from "next/server";
import { channelStarterDeepDiveSchema, parseBody } from "@/lib/validation";
import { generateNicheDeepDive } from "@/lib/channel-starter";
import {
  searchVideos,
  getVideoDetails,
  getChannelStats,
} from "@/lib/youtube";
import { getRelatedQueries } from "@/lib/trends";
import { prisma } from "@/lib/prisma";
import { hashInputs, getCachedAiResponse, setCachedAiResponse } from "@/lib/ai-cache";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(channelStarterDeepDiveSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { discoveryId, nicheName, searchKeywords } = parsed.data;

    // Read content type preference from the discovery record
    const discovery = await prisma.nicheDiscovery.findUnique({
      where: { id: discoveryId },
      select: { contentType: true },
    });
    const contentFilter = discovery?.contentType ?? "both";

    // 1. Broader outlier search using the niche keywords
    const primaryKeyword = searchKeywords[0];
    const searchVideoType =
      contentFilter === "short-form" || contentFilter === "shorts"
        ? "short"
        : contentFilter === "long-form"
          ? "medium"
          : undefined;
    const videoIds = await searchVideos(
      { keyword: primaryKeyword, videoType: searchVideoType },
      1
    );
    let videos = await getVideoDetails(videoIds);

    const channelIds = videos.map((v) => v.channelId);
    const channelStats = await getChannelStats(channelIds);

    // Build outlier data
    const outlierData = videos
      .map((v) => {
        const channel = channelStats.get(v.channelId);
        if (!channel) return null;
        return {
          title: v.title,
          channelName: v.channelName,
          views: v.views,
          subscribers: channel.subscribers,
          outlierScore:
            Math.round(
              (channel.averageViews > 0
                ? v.views / channel.averageViews
                : 0) * 100
            ) / 100,
        };
      })
      .filter((v) => v !== null)
      .sort((a, b) => b.outlierScore - a.outlierScore);

    // Build channel landscape data (deduplicated)
    const channelMap = new Map<
      string,
      { name: string; subscribers: number; avgViews: number }
    >();
    for (const [id, stats] of channelStats) {
      if (!channelMap.has(id)) {
        channelMap.set(id, {
          name: stats.name,
          subscribers: stats.subscribers,
          avgViews: stats.averageViews,
        });
      }
    }
    const channelData = [...channelMap.values()].sort(
      (a, b) => b.subscribers - a.subscribers
    );

    // 2. Get related queries from Google Trends
    let relatedQueries: { query: string; value: number | string }[] = [];
    try {
      const related = await getRelatedQueries(nicheName);
      relatedQueries = [...related.rising, ...related.top];
    } catch {
      // Trends failed — continue without
    }

    // 3. Generate deep dive analysis with Gemini (check cache first)
    const deepDiveHash = hashInputs("deep-dive", nicheName, searchKeywords);
    const cachedDeepDive = await getCachedAiResponse(deepDiveHash, "deep-dive");
    let deepDive;
    if (cachedDeepDive) {
      deepDive = JSON.parse(cachedDeepDive);
    } else {
      deepDive = await generateNicheDeepDive(
        nicheName,
        outlierData,
        relatedQueries,
        channelData
      );
      await setCachedAiResponse(deepDiveHash, "deep-dive", JSON.stringify(deepDive));
    }

    // 4. Update DB
    await prisma.nicheDiscovery.update({
      where: { id: discoveryId },
      data: {
        selectedNiche: nicheName,
        deepDive: JSON.stringify(deepDive),
        completedStep: 3,
      },
    });

    return NextResponse.json({ deepDive });
  } catch (error) {
    console.error("Channel starter deep-dive error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to perform niche deep dive",
      },
      { status: 500 }
    );
  }
}
