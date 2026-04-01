import { z } from "zod/v4";

// ── Folder Schemas ──────────────────────────────────────

const createFolderSchema = z.object({
  action: z.literal("create"),
  name: z.string().min(1).max(100),
});

const addVideoSchema = z.object({
  action: z.literal("addVideo"),
  videoId: z.string().min(1),
  folderId: z.int().positive(),
});

const removeVideoSchema = z.object({
  action: z.literal("removeVideo"),
  videoId: z.string().min(1),
  folderId: z.int().positive(),
});

export const folderActionSchema = z.discriminatedUnion("action", [
  createFolderSchema,
  addVideoSchema,
  removeVideoSchema,
]);

// ── Panel Schemas ───────────────────────────────────────

const createPanelSchema = z.object({
  action: z.literal("create"),
  name: z.string().min(1).max(100),
  keyword: z.string().min(1),
  filters: z.record(z.string(), z.unknown()).optional(),
});

const refreshPanelSchema = z.object({
  action: z.literal("refresh"),
  id: z.int().positive(),
});

export const panelActionSchema = z.discriminatedUnion("action", [
  createPanelSchema,
  refreshPanelSchema,
]);

// ── YouTube Search Schema ───────────────────────────────

export const youtubeSearchSchema = z.object({
  keyword: z.string().min(1),
  maxSubscribers: z.number().positive().optional(),
  minViews: z.number().nonnegative().optional(),
  minDuration: z.number().nonnegative().optional(),
  maxDuration: z.number().positive().optional(),
  videoType: z.enum(["any", "short", "medium", "long"]).optional(),
  publishedAfter: z.string().optional(),
  publishedBefore: z.string().optional(),
  language: z.string().optional(),
  maxResults: z.number().int().min(1).max(50).optional(),
  minEngagement: z.number().nonnegative().optional(),
});

// ── AI Schemas ──────────────────────────────────────────

export const aiIdeasSchema = z.object({
  videos: z.array(z.object({
    title: z.string(),
    views: z.number(),
    likes: z.number(),
    channelName: z.string(),
    channelSubscribers: z.number(),
    outlierScore: z.number(),
    description: z.string(),
  })).min(1).max(10),
  folderId: z.number().int().nullable().optional(),
});

export const aiSummarizeSchema = z.object({
  videoUrl: z.string().optional(),
  title: z.string().optional(),
  views: z.number().optional(),
  likes: z.number().optional(),
  transcript: z.string().min(1),
});

export const videoAnalyzerSchema = z.object({
  urls: z.string().min(1),
});

// ── Keywords Schema ─────────────────────────────────────

export const keywordsAiSchema = z.object({
  topic: z.string().min(1),
  mode: z.enum(["default", "brainstorm"]).optional(),
});

// ── Trends Schema ───────────────────────────────────────

export const trendsSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1).max(5),
  timeRange: z.enum(["now 7-d", "today 1-m", "today 3-m", "today 12-m", "today 5-y"]).optional(),
  action: z.enum(["interestOverTime", "relatedQueries", "regionalInterest"]).optional(),
});

// ── Channel Starter Schemas ─────────────────────────────

const userProfileSchema = z.object({
  interests: z.array(z.string()).max(10),
  skills: z.array(z.string()).max(10),
  constraints: z.object({
    faceless: z.boolean(),
    budget: z.enum(["low", "medium", "high"]),
    hoursPerWeek: z.number().min(1).max(80),
  }),
  goals: z.array(z.string()).max(5),
  contentType: z.enum(["long-form", "short-form", "both", "shorts"]),
});

export const channelStarterDiscoverSchema = z.object({
  profile: userProfileSchema.nullable(),
});

export const channelStarterDeepDiveSchema = z.object({
  discoveryId: z.number().int().positive(),
  nicheName: z.string().min(1),
  searchKeywords: z.array(z.string().min(1)).min(1).max(5),
});

export const channelStarterStrategySchema = z.object({
  discoveryId: z.number().int().positive(),
  nicheName: z.string().min(1),
  profile: userProfileSchema.nullable().optional(),
});

export const channelStarterContentPlanSchema = z.object({
  discoveryId: z.number().int().positive(),
  nicheName: z.string().min(1),
});

// ── Helpers ─────────────────────────────────────────────

export function parseBody<T>(schema: z.ZodType<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { success: false, error: z.prettifyError(result.error) };
  }
  return { success: true, data: result.data };
}
