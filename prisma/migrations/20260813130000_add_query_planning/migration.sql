CREATE TABLE "ChannelResearchProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "contentPillars" TEXT NOT NULL DEFAULT '',
    "recurringSeries" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT '',
    "targetDuration" TEXT NOT NULL DEFAULT '',
    "uploadGoals" TEXT NOT NULL DEFAULT '',
    "topicsToPursue" TEXT NOT NULL DEFAULT '',
    "topicsToAvoid" TEXT NOT NULL DEFAULT '',
    "packagingRules" TEXT NOT NULL DEFAULT '',
    "expertiseNotes" TEXT NOT NULL DEFAULT '',
    "interestsNotes" TEXT NOT NULL DEFAULT '',
    "availableSources" TEXT NOT NULL DEFAULT '',
    "preferredTypes" TEXT NOT NULL DEFAULT '',
    "businessGoals" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelResearchProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChannelResearchProfile_workspaceId_key" ON "ChannelResearchProfile"("workspaceId");
CREATE TABLE "QueryPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "inputs" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'none',
    "model" TEXT NOT NULL DEFAULT '',
    "promptVersion" TEXT NOT NULL DEFAULT 'query-plan-v1',
    "manualPrompt" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueryPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "QueryPlan_workspaceId_createdAt_idx" ON "QueryPlan"("workspaceId", "createdAt");
CREATE TABLE "QueryPlanQuery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "queryPlanId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "query" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "mechanism" TEXT NOT NULL DEFAULT '',
    "expectedEvidence" TEXT NOT NULL DEFAULT '',
    "sourceContext" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "generationReason" TEXT NOT NULL DEFAULT '',
    "selected" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "QueryPlanQuery_queryPlanId_fkey" FOREIGN KEY ("queryPlanId") REFERENCES "QueryPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "QueryPlanQuery_queryPlanId_position_idx" ON "QueryPlanQuery"("queryPlanId", "position");
