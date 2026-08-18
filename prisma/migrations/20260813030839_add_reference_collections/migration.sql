-- CreateTable
CREATE TABLE "ReferenceCollection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "question" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferenceCollection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferenceItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "collectionId" INTEGER NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "views" INTEGER,
    "publishedAt" DATETIME NOT NULL,
    "format" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "sourceQuery" TEXT NOT NULL DEFAULT '',
    "use" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferenceItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ReferenceCollection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceCollection_workspaceId_name_key" ON "ReferenceCollection"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "ReferenceItem_collectionId_idx" ON "ReferenceItem"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceItem_collectionId_videoId_use_key" ON "ReferenceItem"("collectionId", "videoId", "use");
