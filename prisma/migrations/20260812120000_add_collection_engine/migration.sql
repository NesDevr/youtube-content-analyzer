-- Stage 3: durable, quota-accounted collection. Public channel/video metadata
-- remains globally reusable; tracking and jobs remain scoped to a workspace.
CREATE TABLE "QuotaPolicy" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "dailyBudget" INTEGER NOT NULL DEFAULT 1000,
  "manualReserve" INTEGER NOT NULL DEFAULT 200,
  "searchCacheHours" INTEGER NOT NULL DEFAULT 24,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "CollectionJob" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "workspaceId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "scope" TEXT NOT NULL,
  "result" TEXT,
  "error" TEXT,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectionJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "QuotaEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "policyId" INTEGER NOT NULL DEFAULT 1,
  "endpoint" TEXT NOT NULL,
  "expectedCost" INTEGER NOT NULL,
  "actualCost" INTEGER,
  "jobId" INTEGER,
  "detail" TEXT NOT NULL DEFAULT '',
  "result" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuotaEvent_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "QuotaPolicy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QuotaEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "CollectionJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "TrackedChannel" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "workspaceId" INTEGER NOT NULL,
  "channelId" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'tier-2',
  "refreshSchedule" TEXT NOT NULL DEFAULT 'weekly',
  "lastRefreshedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackedChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ChannelSnapshot" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "trackedChannelId" INTEGER NOT NULL,
  "channelId" TEXT NOT NULL,
  "subscribers" INTEGER,
  "totalViews" BIGINT,
  "videoCount" INTEGER,
  "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelSnapshot_trackedChannelId_fkey" FOREIGN KEY ("trackedChannelId") REFERENCES "TrackedChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "VideoSnapshot" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "videoId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "views" INTEGER,
  "likes" INTEGER,
  "comments" INTEGER,
  "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DiscoverySearch" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "workspaceId" INTEGER NOT NULL,
  "queryKey" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "region" TEXT NOT NULL DEFAULT '',
  "language" TEXT NOT NULL DEFAULT '',
  "scope" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  CONSTRAINT "DiscoverySearch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ManualObservation" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "workspaceId" INTEGER NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "topic" TEXT NOT NULL DEFAULT '',
  "viewerPromise" TEXT NOT NULL DEFAULT '',
  "titleThumbnail" TEXT NOT NULL DEFAULT '',
  "formatNotes" TEXT NOT NULL DEFAULT '',
  "productionStyle" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ManualObservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TrackedChannel_workspaceId_channelId_key" ON "TrackedChannel"("workspaceId", "channelId");
CREATE UNIQUE INDEX "DiscoverySearch_workspaceId_queryKey_key" ON "DiscoverySearch"("workspaceId", "queryKey");
CREATE INDEX "CollectionJob_workspaceId_createdAt_idx" ON "CollectionJob"("workspaceId", "createdAt");
CREATE INDEX "CollectionJob_status_idx" ON "CollectionJob"("status");
CREATE INDEX "QuotaEvent_createdAt_idx" ON "QuotaEvent"("createdAt");
CREATE INDEX "QuotaEvent_jobId_idx" ON "QuotaEvent"("jobId");
CREATE INDEX "TrackedChannel_workspaceId_priority_idx" ON "TrackedChannel"("workspaceId", "priority");
CREATE INDEX "ChannelSnapshot_channelId_collectedAt_idx" ON "ChannelSnapshot"("channelId", "collectedAt");
CREATE INDEX "VideoSnapshot_videoId_collectedAt_idx" ON "VideoSnapshot"("videoId", "collectedAt");
CREATE INDEX "VideoSnapshot_channelId_collectedAt_idx" ON "VideoSnapshot"("channelId", "collectedAt");
CREATE INDEX "DiscoverySearch_expiresAt_idx" ON "DiscoverySearch"("expiresAt");
CREATE INDEX "ManualObservation_workspaceId_entityType_entityId_idx" ON "ManualObservation"("workspaceId", "entityType", "entityId");
