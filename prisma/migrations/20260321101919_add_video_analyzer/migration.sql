-- AlterTable
ALTER TABLE "Video" ADD COLUMN "transcript" TEXT;

-- CreateTable
CREATE TABLE "VideoAnalysis" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "videoIds" TEXT NOT NULL,
    "analysisResult" TEXT NOT NULL,
    "inspirations" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "VideoAnalysis_createdAt_idx" ON "VideoAnalysis"("createdAt");
