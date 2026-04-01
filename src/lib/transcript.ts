import { YoutubeTranscript } from "youtube-transcript";
import { prisma } from "./prisma";

// ── URL Parsing (client-safe, no Node deps) ─────────────

const VIDEO_ID_REGEX =
  /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const BARE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function extractVideoIds(input: string): string[] {
  const tokens = input.split(/[\n,\s]+/).filter(Boolean);
  const ids = new Set<string>();

  for (const token of tokens) {
    const urlMatch = token.match(VIDEO_ID_REGEX);
    if (urlMatch) {
      ids.add(urlMatch[1]);
      continue;
    }
    if (BARE_ID_REGEX.test(token.trim())) {
      ids.add(token.trim());
    }
  }

  return [...ids];
}

// ── Transcript Fetching (server-only) ───────────────────

export async function fetchTranscript(
  videoId: string
): Promise<{ transcript: string | null; error?: string }> {
  // Check cache first
  const cached = await prisma.video.findUnique({
    where: { id: videoId },
    select: { transcript: true },
  });

  if (cached?.transcript) {
    return { transcript: cached.transcript };
  }

  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    const transcript = segments.map((s) => s.text).join(" ");

    // Cache in DB (only if video row exists)
    await prisma.video
      .update({
        where: { id: videoId },
        data: { transcript },
      })
      .catch(() => {
        // Video row may not exist yet — that's fine, skip caching
      });

    return { transcript };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch transcript";

    if (message.includes("disabled")) {
      return { transcript: null, error: "Transcripts are disabled for this video" };
    }
    if (message.includes("not available") || message.includes("unavailable")) {
      return { transcript: null, error: "No transcript available for this video" };
    }
    if (message.includes("Too many requests")) {
      return { transcript: null, error: "Rate limited — try again in a moment" };
    }

    return { transcript: null, error: message };
  }
}
