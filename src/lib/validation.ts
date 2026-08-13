import { z } from "zod/v4";
import { WORKSPACE_STATUSES, WORKSPACE_CONTENT_FORMATS } from "./workspace";

// ── Channel Workspace Schemas ───────────────────────────

const workspaceFieldsSchema = z.object({
  name: z.string().min(1).max(100),
  concept: z.string().max(2000).optional(),
  status: z.enum(WORKSPACE_STATUSES).optional(),
  language: z.string().min(1).max(10).optional(),
  country: z.string().max(10).optional(),
  targetAudience: z.string().max(500).optional(),
  contentFormat: z.enum(WORKSPACE_CONTENT_FORMATS).optional(),
  positioning: z.string().max(1000).optional(),
  constraints: z.string().max(1000).optional(),
  ownedYoutubeChannelId: z.string().max(64).nullable().optional(),
});

const createWorkspaceSchema = workspaceFieldsSchema.extend({
  action: z.literal("create"),
});

const updateWorkspaceSchema = workspaceFieldsSchema.partial().extend({
  action: z.literal("update"),
  id: z.int().positive(),
});

export const workspaceActionSchema = z.discriminatedUnion("action", [
  createWorkspaceSchema,
  updateWorkspaceSchema,
]);

// ── Folder Schemas ──────────────────────────────────────

const createFolderSchema = z.object({
  action: z.literal("create"),
  name: z.string().min(1).max(100),
  workspaceId: z.int().positive(),
});

/**
 * Search results live only in memory until the user saves one, so `addVideo`
 * carries the full video payload and the route upserts the `Video` row. Without
 * it, saving anything found through search fails with "Video not found".
 */
const savedVideoSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  channelId: z.string(),
  channelName: z.string(),
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  duration: z.string(),
  publishedAt: z.string(),
  thumbnailUrl: z.string(),
  description: z.string().optional(),
  outlierScore: z.number().nullable().optional(),
  viewsPerHour: z.number().nullable().optional(),
});

const addVideoSchema = z.object({
  action: z.literal("addVideo"),
  videoId: z.string().min(1),
  folderId: z.int().positive(),
  workspaceId: z.int().positive(),
  video: savedVideoSchema.optional(),
});

const removeVideoSchema = z.object({
  action: z.literal("removeVideo"),
  videoId: z.string().min(1),
  folderId: z.int().positive(),
  workspaceId: z.int().positive(),
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
  workspaceId: z.int().positive(),
  filters: z.record(z.string(), z.unknown()).optional(),
  results: z.array(z.record(z.string(), z.unknown())).optional(),
});

const refreshPanelSchema = z.object({
  action: z.literal("refresh"),
  id: z.int().positive(),
  workspaceId: z.int().positive(),
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
  excludeShorts: z.boolean().optional(),
});

// ── Outlier Lab Schema ──────────────────────────────────

export const outlierAnalyzeSchema = z.object({
  url: z.string().min(1),
  workspaceId: z.int().positive(),
});

// ── Collection Engine Schemas ──────────────────────────

export const collectionActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("discover"),
    workspaceId: z.int().positive(),
    query: z.string().min(1).max(200),
    language: z.string().max(10).optional(),
    region: z.string().max(10).optional(),
  }),
  z.object({
    action: z.literal("track"),
    workspaceId: z.int().positive(),
    channelId: z.string().min(1).max(100),
    priority: z.enum(["tier-1", "tier-2", "tier-3"]),
    refreshSchedule: z.enum(["daily", "weekly", "monthly", "manual"]),
  }),
  z.object({
    action: z.literal("refresh"),
    workspaceId: z.int().positive(),
    trackedChannelId: z.int().positive().optional(),
  }),
  z.object({
    action: z.literal("updatePolicy"),
    workspaceId: z.int().positive(),
    dailyBudget: z.int().min(1).max(10000),
    manualReserve: z.int().min(0).max(9999),
    searchCacheHours: z.int().min(1).max(720),
  }),
]);

// ── AI Schemas ──────────────────────────────────────────

export const aiIdeasSchema = z.object({
  videos: z.array(z.object({
    title: z.string(),
    views: z.number(),
    likes: z.number(),
    channelName: z.string(),
    /** Null for videos saved before a legacy score was computed. */
    outlierScore: z.number().nullable(),
    description: z.string(),
  })).min(1).max(10),
  folderId: z.number().int().nullable().optional(),
  workspaceId: z.int().positive(),
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
  workspaceId: z.int().positive(),
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
