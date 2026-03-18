-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IdeaGeneration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "panelId" INTEGER,
    "folderId" INTEGER,
    "prompt" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdeaGeneration_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IdeaGeneration_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IdeaGeneration" ("createdAt", "folderId", "id", "panelId", "prompt", "result") SELECT "createdAt", "folderId", "id", "panelId", "prompt", "result" FROM "IdeaGeneration";
DROP TABLE "IdeaGeneration";
ALTER TABLE "new_IdeaGeneration" RENAME TO "IdeaGeneration";
CREATE INDEX "IdeaGeneration_folderId_idx" ON "IdeaGeneration"("folderId");
CREATE INDEX "IdeaGeneration_panelId_idx" ON "IdeaGeneration"("panelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Channel_lastFetched_idx" ON "Channel"("lastFetched");

-- CreateIndex
CREATE INDEX "Panel_createdAt_idx" ON "Panel"("createdAt");

-- CreateIndex
CREATE INDEX "Video_channelId_idx" ON "Video"("channelId");
