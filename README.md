# YT Analyzer

Full-stack YouTube research platform for creators and content teams. YT Analyzer helps find outlier videos, analyze transcripts, compare trends, research keywords, and generate AI-assisted content ideas.

Built with **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS 4**, **Prisma**, **SQLite**, **Google Gemini**, **YouTube Data API**, and **Google Trends**.

## Features

- **Outlier Finder** - Search YouTube by keyword, filter by views/subscribers/duration/engagement, and surface unusually strong videos.
- **Video Analyzer** - Paste YouTube URLs, fetch transcripts and metadata, and generate deep analysis of hooks, structure, thumbnails, and content patterns.
- **Keyword Research** - Combine YouTube autocomplete with AI keyword generation and brainstorming.
- **Google Trends** - Compare keyword interest over time and inspect rising queries and regional interest.
- **AI Tools** - Generate ideas from saved folders and summarize videos.
- **Folders** - Save videos into collections for later research and batch analysis.

## Screenshots

### Outlier Finder

![Outlier Finder showing ranked YouTube video opportunities](public/screenshots/outlier-finder.png)

### Google Trends

![Google Trends showing keyword interest over time](public/screenshots/google-trends.png)

## API Setup

Requires a Google Cloud project with YouTube Data API v3 enabled. Set the project ID and region through environment variables.

| API | Used for | Auth |
|-----|----------|------|
| YouTube Data API v3 | Video search, metadata, and channel stats | `YOUTUBE_API_KEY` |
| Gemini via `@google/genai` | Analysis, summaries, keyword generation, and idea generation | Google project/location environment |

The app also uses public/non-key integrations:

- Google Trends via `google-trends-api`
- YouTube autocomplete via the public suggest endpoint
- YouTube transcript extraction via `youtube-transcript`

## Environment Variables

Create a local `.env` file:

```env
DATABASE_URL="file:./dev.db"
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
GOOGLE_PROJECT_ID=your_google_cloud_project_id
GOOGLE_CLOUD_LOCATION=us-central1
```

## Getting Started

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app locally.
