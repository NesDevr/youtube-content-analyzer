-- CreateTable
CREATE TABLE "ResearchJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT 'research-job-v1',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "intent" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "result" TEXT,
    "quotaBudget" INTEGER NOT NULL DEFAULT 0,
    "quotaUsed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "claimedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResearchJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResearchJobEvidence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "researchJobId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "claim" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchJobEvidence_researchJobId_fkey" FOREIGN KEY ("researchJobId") REFERENCES "ResearchJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "researchJobId" INTEGER,
    "title" TEXT NOT NULL,
    "audiencePromise" TEXT NOT NULL DEFAULT '',
    "angle" TEXT NOT NULL DEFAULT '',
    "evidenceLinks" TEXT NOT NULL DEFAULT '[]',
    "risks" TEXT NOT NULL DEFAULT '',
    "freshness" TEXT NOT NULL DEFAULT '',
    "productionRequirements" TEXT NOT NULL DEFAULT '',
    "confidence" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'inbox',
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "selectedPackage" TEXT NOT NULL DEFAULT '',
    "rejectedPackages" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Idea_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Idea_researchJobId_fkey" FOREIGN KEY ("researchJobId") REFERENCES "ResearchJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ResearchJob_workspaceId_status_createdAt_idx" ON "ResearchJob"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchJobEvidence_researchJobId_idx" ON "ResearchJobEvidence"("researchJobId");

-- CreateIndex
CREATE INDEX "Idea_workspaceId_status_updatedAt_idx" ON "Idea"("workspaceId", "status", "updatedAt");
