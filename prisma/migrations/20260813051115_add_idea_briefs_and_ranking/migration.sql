-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Idea" (
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
    "rank" INTEGER NOT NULL DEFAULT 0,
    "researchBrief" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Idea_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Idea_researchJobId_fkey" FOREIGN KEY ("researchJobId") REFERENCES "ResearchJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Idea" ("angle", "audiencePromise", "confidence", "createdAt", "evidenceLinks", "freshness", "id", "productionRequirements", "rejectedPackages", "rejectionReason", "researchJobId", "risks", "selectedPackage", "status", "title", "updatedAt", "workspaceId") SELECT "angle", "audiencePromise", "confidence", "createdAt", "evidenceLinks", "freshness", "id", "productionRequirements", "rejectedPackages", "rejectionReason", "researchJobId", "risks", "selectedPackage", "status", "title", "updatedAt", "workspaceId" FROM "Idea";
DROP TABLE "Idea";
ALTER TABLE "new_Idea" RENAME TO "Idea";
CREATE INDEX "Idea_workspaceId_status_updatedAt_idx" ON "Idea"("workspaceId", "status", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
