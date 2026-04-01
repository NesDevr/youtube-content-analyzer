# YT Analyzer

YouTube research tool for finding viral content patterns, discovering niches, and generating AI-powered video ideas.

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind 4 · Prisma (SQLite) · Gemini 2.5 Pro

## Features

- **Outlier Finder** — Search YouTube videos by keyword, filter by subscribers/views/duration/engagement, and surface hidden gems with outlier scoring
- **Video Analyzer** — Paste YouTube URLs to auto-fetch transcripts and metadata, get deep AI analysis of hooks/scripts/thumbnails, and generate inspired content ideas
- **Keyword Research** — YouTube autocomplete suggestions + AI-powered keyword generation and brainstorming
- **Google Trends** — Compare keyword interest over time, find rising queries and regional interest
- **AI Tools** — Idea generator (from saved folders) and video summarizer
- **Folders** — Save and organize videos into collections for batch analysis

## GCP Services

**Project:** `yt-analyzer-tool` | **Region:** `us-central1` | **Billing:** OFF

Manually enabled API (beyond GCP defaults):

| API | Service | Used for | Auth |
|-----|---------|----------|------|
| `youtube.googleapis.com` | YouTube Data API v3 | Video search, metadata retrieval, channel stats | API key (`YOUTUBE_API_KEY`) |

The app also uses **Gemini 2.5 Pro** (via `@google/genai` SDK with API key) for:

- Deep video analysis (hooks, script structure, content patterns, thumbnails)
- Inspired content idea generation
- Keyword generation and brainstorming
- Video summarization

**Non-GCP Google integrations** (no quota, no API key needed):

- Google Trends — search trend analysis via `google-trends-api` package
- YouTube Autocomplete — keyword suggestions via public suggest endpoint
- YouTube Transcripts — caption extraction via `youtube-transcript` package

## Environment Variables

```env
DATABASE_URL="file:./dev.db"
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
GEMINI_API_KEY=your_gemini_api_key
```

## Getting Started

```bash
# Install dependencies
npm install

# Set up database
npx prisma migrate dev

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.
