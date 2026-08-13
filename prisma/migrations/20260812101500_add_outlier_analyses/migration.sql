-- Stores the complete, reproducible Stage 2 outlier result in the selected
-- channel workspace. Historical channel/video snapshots are intentionally
-- deferred to Stage 3.
CREATE TABLE "OutlierAnalysis" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "videoId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "comparisonWindowDays" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "collectedAt" DATETIME NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutlierAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OutlierAnalysis_workspaceId_collectedAt_idx" ON "OutlierAnalysis"("workspaceId", "collectedAt");
CREATE INDEX "OutlierAnalysis_videoId_idx" ON "OutlierAnalysis"("videoId");
