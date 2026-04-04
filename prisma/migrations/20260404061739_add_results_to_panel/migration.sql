-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Panel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "filters" TEXT NOT NULL,
    "results" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshed" DATETIME
);
INSERT INTO "new_Panel" ("createdAt", "filters", "id", "keyword", "lastRefreshed", "name") SELECT "createdAt", "filters", "id", "keyword", "lastRefreshed", "name" FROM "Panel";
DROP TABLE "Panel";
ALTER TABLE "new_Panel" RENAME TO "Panel";
CREATE INDEX "Panel_createdAt_idx" ON "Panel"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
