import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const text = await res.text();

    // Response is JSONP: window.google.ac.h([...])
    // Extract the array
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return NextResponse.json({ suggestions: [] });
    }

    const data = JSON.parse(match[0]);
    // data[1] is array of suggestions, each is [suggestion_text, ...]
    const suggestions = (data[1] || []).map(
      (item: [string]) => item[0]
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Autocomplete error:", error);
    return NextResponse.json({ suggestions: [] });
  }
}
