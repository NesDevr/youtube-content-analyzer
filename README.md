# YT Analyzer

A personal YouTube research tool. It helps answer two questions with evidence you can inspect: which channel to build, and which video to make next.

The app collects measurable facts from the YouTube Data API, calculates outlier metrics from them, and keeps the reasoning visible. It does not invent scores when the underlying data is missing — it reports insufficient data instead.

Built with **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS 4**, **Prisma**, and **SQLite**.

## Features

- **Channel Workspaces** - Keep separate planned, active, paused, and archived channel concepts. Searches, folders, and saved evidence are scoped to the selected workspace, while public video and channel data is shared across all of them.
- **Current video** - The one idea you are making next, with its concept, references, packaging, research, structure, script, and visual plan kept on the idea itself.
- **Ideas** - Everything the channel could make. Add one, edit one, and choose which becomes the current video.
- **Find references** - Ask what you want to find, approve the suggested searches, see the maximum quota cost, then run them. Pasting a video or channel link analyzes it against comparable uploads instead, with raw statistics, calculated metrics, sample size, and confidence shown separately.
- **Library** - The reference collections, verified outliers, saved videos, and written observations this workspace has kept.
- **Advanced** - The machinery behind all of it: quota budget, search cache, collection ledger, tracked channels, measured growth, and the Codex research queue.

## Outlier metric

Performance is measured as a **recent-median view ratio** rather than a lifetime average:

- Comparable uploads are drawn from the channel's uploads playlist within a 180-day window, up to 20 videos, requiring at least 5 to produce a score.
- Long-form videos, Shorts, and livestreams are classified and compared separately. Shorts are videos of 180 seconds or less.
- The target video is excluded from its own baseline.
- Every stored score carries its metric name, formula version (`recent-median-v1`), sample size, comparison window, format, and collection time.

Lifetime-average performance is retained as an explicitly labeled legacy metric. When a baseline cannot be built, the result is an insufficient-data state, not a fallback number.

## Screenshots

### Outlier Finder

![Outlier Finder showing ranked YouTube video opportunities](public/screenshots/outlier-finder.png)

### Keyword Research

![Keyword Research showing YouTube autocomplete suggestions](public/screenshots/keyword-research.png)

## API Setup

Requires a Google Cloud project with YouTube Data API v3 enabled.

| API | Used for | Auth | Required |
|-----|----------|------|----------|
| YouTube Data API v3 | Video search, metadata, and channel stats | `YOUTUBE_API_KEY` | Yes |
| Gemini via `@google/genai` | Optional AI assistance on top of collected evidence | Vertex AI project and location | No |

Core workflows — managing workspaces, collecting evidence, calculating outliers, and organizing ideas — run without any model provider configured. Nothing silently falls back to a different provider when one is unavailable.

The app also uses public, non-key integrations:

- YouTube autocomplete via the public suggest endpoint
- YouTube transcript extraction via `youtube-transcript`

## Environment Variables

Copy `.env.example` to `.env` and fill it in:

```env
DATABASE_URL="file:./dev.db"
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
```

Only needed if you enable the optional Gemini features:

```env
GOOGLE_PROJECT_ID=your_google_cloud_project_id
GOOGLE_CLOUD_LOCATION=us-central1
```

## Runs locally, not on the open internet

This is a single-user tool and it is built that way. The API routes have no
authentication and the SQLite database has no per-user boundary — a workspace is
an organizing device, not a security boundary. Anyone who can reach the server
can read and modify every workspace. Run it on `localhost`. Deploying it to a
public URL exposes the whole database and lets strangers spend your YouTube API
quota.

## Getting Started

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app locally.

## Tests

```bash
npm test
```

Covers the outlier metric — medians, baseline exclusions, format separation, insufficient samples — and workspace isolation across folders, searches, and saved evidence.

## Codex research handoff

The current video's research step creates a workspace-owned research job; it
never pretends a web button can call Codex Desktop. Run these commands from the project root when
you explicitly want Codex to take a queued job:

```bash
npm run research:jobs -- list 2
npm run research:jobs -- claim 17
npm run research:jobs -- inspect 17
npm run research:jobs -- update 17 progress.json
npm run research:jobs -- complete 17 result.json
```

`progress.json` must contain sourced evidence, each marked `primary` or
`commentary`. `result.json` uses `research-job-v1` and must include a
conclusion, claims, counterarguments, missing evidence, risks, and any original
ideas. A job can be safely returned to the queue with `resume`; completed jobs
are immutable. The command fails loudly when an id, state transition, source,
or result shape is invalid.
