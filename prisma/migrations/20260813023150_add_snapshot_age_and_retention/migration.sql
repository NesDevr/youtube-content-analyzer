-- AlterTable
ALTER TABLE "VideoSnapshot" ADD COLUMN "publishedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QuotaPolicy" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyBudget" INTEGER NOT NULL DEFAULT 1000,
    "manualReserve" INTEGER NOT NULL DEFAULT 200,
    "searchCacheHours" INTEGER NOT NULL DEFAULT 24,
    "snapshotThinAfterDays" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_QuotaPolicy" ("dailyBudget", "id", "manualReserve", "searchCacheHours", "updatedAt") SELECT "dailyBudget", "id", "manualReserve", "searchCacheHours", "updatedAt" FROM "QuotaPolicy";
DROP TABLE "QuotaPolicy";
ALTER TABLE "new_QuotaPolicy" RENAME TO "QuotaPolicy";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
