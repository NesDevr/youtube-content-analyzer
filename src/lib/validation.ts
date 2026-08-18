import { z } from "zod/v4";
import { WORKSPACE_STATUSES, WORKSPACE_CONTENT_FORMATS } from "./workspace";
import { MAX_SET_QUERIES } from "./collection";

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

/** ISO-8601 instant, the only form `search.list` accepts for a date bound. */
const isoInstant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Must be an ISO-8601 date")
  .transform((value) => new Date(value).toISOString());

/** The scope of a single keyword search, shared by every path that runs one. */
const discoveryScopeSchema = z.object({
  query: z.string().min(1).max(200),
  language: z.string().max(10).optional(),
  region: z.string().max(10).optional(),
  publishedAfter: isoInstant.optional(),
  publishedBefore: isoInstant.optional(),
  duration: z.enum(["any", "short", "medium", "long"]).optional(),
  maxResults: z.int().min(1).max(50).optional(),
});

/** One query inside a research set, with the angle it is there to cover. */
const setQuerySchema = discoveryScopeSchema.extend({
  mechanism: z.string().max(200).optional(),
});

export const collectionActionSchema = z.discriminatedUnion("action", [
  discoveryScopeSchema.extend({
    action: z.literal("discover"),
    workspaceId: z.int().positive(),
  }),
  z.object({
    action: z.literal("planSet"),
    workspaceId: z.int().positive(),
    queries: z.array(setQuerySchema).min(1).max(MAX_SET_QUERIES),
  }),
  z.object({
    action: z.literal("discoverSet"),
    workspaceId: z.int().positive(),
    queries: z.array(setQuerySchema).min(1).max(MAX_SET_QUERIES),
  }),
  discoveryScopeSchema.extend({
    action: z.literal("related"),
    workspaceId: z.int().positive(),
    excludeChannelId: z.string().min(1).max(100),
  }),
  z.object({
    action: z.literal("expand"),
    workspaceId: z.int().positive(),
    channelId: z.string().min(1).max(100),
  }),
  z.object({
    action: z.literal("prune"),
    workspaceId: z.int().positive(),
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
    snapshotThinAfterDays: z.int().min(1).max(3650),
  }),
]);

// ── Query planning ─────────────────────────────────────

const researchProfileFieldsSchema = z.object({ planningNotes: z.string().max(10_000).optional() });

export const queryPlanActionSchema = z.discriminatedUnion("action", [
  researchProfileFieldsSchema.extend({ action: z.literal("saveProfile"), workspaceId: z.int().positive() }),
  z.object({
    action: z.literal("generate"), workspaceId: z.int().positive(),
    /** What the user wants to find. The only source of the suggested wording. */
    question: z.string().min(3).max(300),
  }),
  z.object({ action: z.literal("updateQueries"), workspaceId: z.int().positive(), planId: z.int().positive(), queries: z.array(z.object({
    id: z.int().positive().optional(), query: z.string().min(1).max(200), purpose: z.string().min(1).max(100),
    mechanism: z.string().max(200).default(""), expectedEvidence: z.string().max(500).default(""), sourceContext: z.string().max(500).default(""),
    language: z.string().max(10).default(""), region: z.string().max(10).default(""), generationReason: z.string().max(1000).default(""), selected: z.boolean(),
  })).min(1).max(MAX_SET_QUERIES) }),
]);

// ── Reference Collection Schemas ────────────────────────

/**
 * Why a reference was kept. A saved video is evidence about one thing — the
 * topic, the title, the thumbnail, the hook, the structure or the production —
 * and the same video may be kept for more than one of them.
 */
export const REFERENCE_USES = [
  "topic",
  "title",
  "thumbnail",
  "hook",
  "structure",
  "production",
] as const;

const referenceItemSchema = z.object({
  videoId: z.string().min(1).max(20),
  title: z.string().min(1).max(500),
  channelId: z.string().min(1).max(100),
  channelName: z.string().max(200),
  thumbnailUrl: z.string().max(500),
  views: z.int().nonnegative().nullable(),
  publishedAt: isoInstant,
  format: z.string().max(30),
  language: z.string().max(10).optional(),
  region: z.string().max(10).optional(),
  sourceQuery: z.string().max(200).optional(),
  use: z.enum(REFERENCE_USES),
  note: z.string().max(1000).optional(),
});

export const referenceSaveSchema = z.object({
  /** A set may be saved into several workspaces at once. */
  workspaceIds: z.array(z.int().positive()).min(1).max(20),
  name: z.string().min(1).max(100),
  question: z.string().max(500).optional(),
  items: z.array(referenceItemSchema).min(1).max(100),
});

// ── Codex research bridge schemas ──────────────────────

export const RESEARCH_JOB_SCHEMA_VERSION = "research-job-v1";

const researchSeedSchema = z.object({
  kind: z.enum(["video", "folder", "outlier", "observation", "referenceCollection", "manual"]),
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(500),
  note: z.string().max(2000).optional(),
});

export const researchJobCreateSchema = z.object({
  action: z.literal("create"),
  workspaceId: z.int().positive(),
  intent: z.string().min(1).max(2000),
  seeds: z.array(researchSeedSchema).min(1).max(50),
  referenceCollectionIds: z.array(z.int().positive()).max(20).default([]),
  quotaBudget: z.int().min(0).max(10000).default(0),
});

export const researchEvidenceSchema = z.object({
  url: z.url().max(2000),
  sourceType: z.enum(["primary", "commentary"]),
  title: z.string().max(500).optional(),
  claim: z.string().min(1).max(2000),
  note: z.string().max(2000).optional(),
});

export const researchResultSchema = z.object({
  conclusion: z.string().min(1).max(8000),
  claims: z.array(z.string().min(1).max(2000)).max(30),
  counterarguments: z.array(z.string().min(1).max(2000)).max(30),
  missingEvidence: z.array(z.string().min(1).max(2000)).max(30),
  risks: z.array(z.string().min(1).max(2000)).max(30),
  repeatability: z.object({
    verdict: z.enum(["repeatable", "unproven", "not-repeatable"]),
    siblingEvidence: z.array(z.string().min(1).max(2000)).max(20),
    independentChannelEvidence: z.array(z.string().min(1).max(2000)).max(20),
  }),
  visualObservations: z.array(z.object({
    reference: z.string().min(1).max(500),
    titleThumbnail: z.string().max(2000),
    mechanism: z.string().max(1000),
    counterexample: z.string().max(1000).default(""),
  })).max(50),
  ideas: z.array(z.object({
    title: z.string().min(1).max(500),
    audiencePromise: z.string().max(2000).default(""),
    angle: z.string().max(3000).default(""),
    evidenceLinks: z.array(z.string().max(2000)).max(50).default([]),
    risks: z.string().max(3000).default(""),
    freshness: z.string().max(1000).default(""),
    productionRequirements: z.string().max(3000).default(""),
    confidence: z.enum(["low", "medium", "high", "unknown"]).default("unknown"),
    packages: z.array(z.object({
      title: z.string().min(1).max(500),
      thumbnailDirection: z.string().min(1).max(2000),
      transferableMechanism: z.string().min(1).max(2000),
      distinctExecution: z.string().min(1).max(2000),
      flags: z.array(z.enum(["unsupported-accusation", "weak-sourcing", "copyright-risk", "derivative"])).default([]),
    })).max(10).default([]),
  })).max(20),
});

export const researchJobActionSchema = z.discriminatedUnion("action", [
  researchJobCreateSchema,
  z.object({ action: z.literal("resume"), workspaceId: z.int().positive(), id: z.int().positive() }),
]);

export const IDEA_STATUSES = ["inbox", "shortlisted", "researching", "selected", "rejected", "produced", "published"] as const;
const ideaFieldsSchema = z.object({
  title: z.string().min(1).max(500),
  audiencePromise: z.string().max(2000).optional(),
  angle: z.string().max(3000).optional(),
  evidenceLinks: z.array(z.string().max(2000)).max(50).optional(),
  risks: z.string().max(3000).optional(),
  freshness: z.string().max(1000).optional(),
  productionRequirements: z.string().max(3000).optional(),
  confidence: z.enum(["low", "medium", "high", "unknown"]).optional(),
  status: z.enum(IDEA_STATUSES).optional(),
  rejectionReason: z.string().max(2000).optional(),
  selectedPackage: z.string().max(5000).optional(),
  rejectedPackages: z.array(z.string().max(5000)).max(20).optional(),
  rank: z.int().min(0).max(100000).optional(),
  researchBrief: z.string().max(20000).optional(),
  /** Per-stage production notes, serialized by the current-video page. */
  production: z.string().max(60000).optional(),
});
export const ideaActionSchema = z.discriminatedUnion("action", [
  ideaFieldsSchema.extend({ action: z.literal("create"), workspaceId: z.int().positive(), researchJobId: z.int().positive().optional() }),
  ideaFieldsSchema.partial().extend({ action: z.literal("update"), workspaceId: z.int().positive(), id: z.int().positive(), destinationWorkspaceId: z.int().positive().optional() }),
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
