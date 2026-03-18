import { NextRequest, NextResponse } from "next/server";
import { getInterestOverTime, getRelatedQueries, getRegionalInterest } from "@/lib/trends";

export async function POST(req: NextRequest) {
  try {
    const { keywords, timeRange, action } = await req.json();

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: "Keywords array is required" }, { status: 400 });
    }

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
