/*
  Adds ChannelWorkspace and scopes user-owned research artifacts to it.

  Data preservation: every existing Folder, Panel, IdeaGeneration and NicheDiscovery is
  backfilled onto a workspace named "My First Channel" that this migration creates.
  Nothing is deleted. Video and Channel are intentionally left global — they hold public
  YouTube evidence that every workspace reuses.
*/
-- CreateTable
CREATE TABLE "ChannelWorkspace" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "concept" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "language" TEXT NOT NULL DEFAULT 'en',
    "country" TEXT NOT NULL DEFAULT '',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "contentFormat" TEXT NOT NULL DEFAULT 'long-form',
    "positioning" TEXT NOT NULL DEFAULT '',
    "constraints" TEXT NOT NULL DEFAULT '',
    "ownedYoutubeChannelId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Seed the default workspace that existing records are migrated onto.
INSERT INTO "ChannelWorkspace" ("id", "name", "concept", "status", "updatedAt")
VALUES (1, 'My First Channel', 'Workspace created by the workspace migration to hold all research that existed before workspaces were added.', 'active', CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Folder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Folder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Folder" ("createdAt", "id", "name", "workspaceId") SELECT "createdAt", "id", "name", 1 FROM "Folder";
DROP TABLE "Folder";
ALTER TABLE "new_Folder" RENAME TO "Folder";
CREATE INDEX "Folder_workspaceId_idx" ON "Folder"("workspaceId");
CREATE TABLE "new_IdeaGeneration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "panelId" INTEGER,
    "folderId" INTEGER,
    "workspaceId" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdeaGeneration_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "Panel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IdeaGeneration_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IdeaGeneration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_IdeaGeneration" ("createdAt", "folderId", "id", "panelId", "prompt", "result", "workspaceId") SELECT "createdAt", "folderId", "id", "panelId", "prompt", "result", 1 FROM "IdeaGeneration";
DROP TABLE "IdeaGeneration";
ALTER TABLE "new_IdeaGeneration" RENAME TO "IdeaGeneration";
CREATE INDEX "IdeaGeneration_folderId_idx" ON "IdeaGeneration"("folderId");
CREATE INDEX "IdeaGeneration_panelId_idx" ON "IdeaGeneration"("panelId");
CREATE INDEX "IdeaGeneration_workspaceId_idx" ON "IdeaGeneration"("workspaceId");
CREATE TABLE "new_NicheDiscovery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "interests" TEXT,
    "skills" TEXT,
    "constraints" TEXT,
    "goals" TEXT,
    "contentType" TEXT,
    "niches" TEXT,
    "selectedNiche" TEXT,
    "deepDive" TEXT,
    "strategy" TEXT,
    "contentPlan" TEXT,
    "completedStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NicheDiscovery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NicheDiscovery" ("completedStep", "constraints", "contentPlan", "contentType", "createdAt", "deepDive", "goals", "id", "interests", "niches", "selectedNiche", "skills", "strategy", "updatedAt", "workspaceId") SELECT "completedStep", "constraints", "contentPlan", "contentType", "createdAt", "deepDive", "goals", "id", "interests", "niches", "selectedNiche", "skills", "strategy", "updatedAt", 1 FROM "NicheDiscovery";
DROP TABLE "NicheDiscovery";
ALTER TABLE "new_NicheDiscovery" RENAME TO "NicheDiscovery";
CREATE INDEX "NicheDiscovery_createdAt_idx" ON "NicheDiscovery"("createdAt");
CREATE INDEX "NicheDiscovery_workspaceId_idx" ON "NicheDiscovery"("workspaceId");
CREATE TABLE "new_Panel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "filters" TEXT NOT NULL,
    "results" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshed" DATETIME,
    CONSTRAINT "Panel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Panel" ("createdAt", "filters", "id", "keyword", "lastRefreshed", "name", "results", "workspaceId") SELECT "createdAt", "filters", "id", "keyword", "lastRefreshed", "name", "results", 1 FROM "Panel";
DROP TABLE "Panel";
ALTER TABLE "new_Panel" RENAME TO "Panel";
CREATE INDEX "Panel_createdAt_idx" ON "Panel"("createdAt");
CREATE INDEX "Panel_workspaceId_idx" ON "Panel"("workspaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ChannelWorkspace_name_key" ON "ChannelWorkspace"("name");

-- CreateIndex
CREATE INDEX "ChannelWorkspace_status_idx" ON "ChannelWorkspace"("status");
