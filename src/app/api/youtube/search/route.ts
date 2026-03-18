import { NextRequest, NextResponse } from "next/server";
import { findOutliers, SearchFilters } from "@/lib/youtube";

export async function POST(req: NextRequest) {
  try {
    const filters: SearchFilters = await req.json();

    if (!filters.keyword) {
      return NextResponse.json({ error: "Keyword is required" }, { status: 400 });
    }

    const results = await findOutliers(filters);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
