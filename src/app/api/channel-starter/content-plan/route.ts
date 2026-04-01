import { NextRequest, NextResponse } from "next/server";
import { channelStarterContentPlanSchema, parseBody } from "@/lib/validation";
import { generateStarterContentPlan } from "@/lib/channel-starter";
import { prisma } from "@/lib/prisma";
import { hashInputs, getCachedAiResponse, setCachedAiResponse } from "@/lib/ai-cache";
import type { ContentStrategy, NicheDeepDive } from "@/types/channel-starter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(channelStarterContentPlanSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { discoveryId, nicheName } = parsed.data;

    // Read strategy and deepDive from DB instead of requiring client to POST them
    const discovery = await prisma.nicheDiscovery.findUnique({
      where: { id: discoveryId },
      select: { strategy: true, deepDive: true },
    });
    if (!discovery?.strategy || !discovery?.deepDive) {
      return NextResponse.json(
        { error: "Strategy or deep dive data not found — complete earlier steps first" },
        { status: 400 }
      );
    }
    const strategy = JSON.parse(discovery.strategy) as ContentStrategy;
    const deepDive = JSON.parse(discovery.deepDive) as NicheDeepDive;

    // Check AI cache before calling Gemini
    const planHash = hashInputs("content-plan", nicheName, discovery.strategy, discovery.deepDive);
    const cachedPlan = await getCachedAiResponse(planHash, "content-plan");
    let contentPlan;
    if (cachedPlan) {
      contentPlan = JSON.parse(cachedPlan);
    } else {
      contentPlan = await generateStarterContentPlan(
        nicheName,
        strategy,
        deepDive
      );
      await setCachedAiResponse(planHash, "content-plan", JSON.stringify(contentPlan));
    }

    await prisma.nicheDiscovery.update({
      where: { id: discoveryId },
      data: {
        contentPlan: JSON.stringify(contentPlan),
        completedStep: 5,
      },
    });

    return NextResponse.json({ contentPlan });
  } catch (error) {
    console.error("Channel starter content-plan error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate content plan",
      },
      { status: 500 }
    );
  }
}
