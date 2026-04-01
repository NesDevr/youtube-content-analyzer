-- CreateTable
CREATE TABLE "AiCache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "inputHash" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AiCache_inputHash_key" ON "AiCache"("inputHash");

-- CreateIndex
CREATE INDEX "AiCache_inputHash_idx" ON "AiCache"("inputHash");
