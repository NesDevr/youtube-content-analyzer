-- CreateTable
CREATE TABLE "NicheDiscovery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "NicheDiscovery_createdAt_idx" ON "NicheDiscovery"("createdAt");
