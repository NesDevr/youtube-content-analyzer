import { NextRequest, NextResponse } from "next/server";
import { getInterestOverTime, getRelatedQueries, getRegionalInterest } from "@/lib/trends";
import { trendsSchema, parseBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(trendsSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { keywords, timeRange, action } = parsed.data;

    switch (action) {
      case "interestOverTime": {
        const data = await getInterestOverTime(keywords, timeRange);
        return NextResponse.json({ data });
      }
      case "relatedQueries": {
        const data = await getRelatedQueries(keywords[0]);
        return NextResponse.json({ data });
      }
      case "regionalInterest": {
        const data = await getRegionalInterest(keywords[0]);
        return NextResponse.json({ data });
      }
      default: {
        const data = await getInterestOverTime(keywords, timeRange);
        return NextResponse.json({ data });
      }
    }
  } catch (error) {
    console.error("Trends error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Trends fetch failed" },
      { status: 500 }
    );
  }
}
