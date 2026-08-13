import { NextRequest, NextResponse } from "next/server";
import { findOutliers } from "@/lib/youtube";
import { youtubeSearchSchema, parseBody } from "@/lib/validation";
import { reserveManualQuota, settleManualQuota } from "@/lib/collection";

export async function POST(req: NextRequest) {
  let quotaEventId: number | null = null;
  try {
    const body = await req.json();
    const parsed = parseBody(youtubeSearchSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // A topic search may require two duration buckets. Reserve the maximum
    // visible-path cost before calling YouTube so manual search cannot exhaust
    // the daily allocation silently.
    const quotaEvent = await reserveManualQuota("topic search", 202, parsed.data.keyword);
    quotaEventId = quotaEvent.id;
    const results = await findOutliers(parsed.data);
    await settleManualQuota(quotaEventId, 202);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    if (quotaEventId !== null) {
      await settleManualQuota(quotaEventId, 0, error instanceof Error ? error.message : "Search failed");
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
