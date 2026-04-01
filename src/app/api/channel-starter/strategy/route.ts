import { NextRequest, NextResponse } from "next/server";
import { channelStarterStrategySchema, parseBody } from "@/lib/validation";
import { generateContentStrategy } from "@/lib/channel-starter";
import { prisma } from "@/lib/prisma";
import { hashInputs, getCachedAiResponse, setCachedAiResponse } from "@/lib/ai-cache";
import type { NicheDeepDive, UserProfile } from "@/types/channel-starter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(channelStarterStrategySchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { discoveryId, nicheName, profile } = parsed.data;

    // Read deepDive from DB instead of requiring client to POST it
    const discovery = await prisma.nicheDiscovery.findUnique({
      where: { id: discoveryId },
      select: { deepDive: true },
    });
    if (!discovery?.deepDive) {
      return NextResponse.json(
        { error: "Deep dive data not found — complete step 3 first" },
        { status: 400 }
      );
    }
    const deepDive = JSON.parse(discovery.deepDive) as NicheDeepDive;

    // Check AI cache before calling Gemini
    const strategyHash = hashInputs("strategy", nicheName, discovery.deepDive);
    const cachedStrategy = await getCachedAiResponse(strategyHash, "strategy");
    let strategy;
    if (cachedStrategy) {
      strategy = JSON.parse(cachedStrategy);
    } else {
      strategy = await generateContentStrategy(
        nicheName,
        deepDive,
        (profile as unknown as UserProfile) ?? null
      );
      await setCachedAiResponse(strategyHash, "strategy", JSON.stringify(strategy));
    }

    await prisma.nicheDiscovery.update({
      where: { id: discoveryId },
      data: {
        strategy: JSON.stringify(strategy),
        completedStep: 4,
      },
    });

    return NextResponse.json({ strategy });
  } catch (error) {
    console.error("Channel starter strategy error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate content strategy",
      },
      { status: 500 }
    );
  }
}
