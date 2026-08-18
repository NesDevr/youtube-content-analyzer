-- Preserve every existing profile field in a readable single note before
-- removing the over-specified columns.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChannelResearchProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "planningNotes" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChannelResearchProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChannelResearchProfile" ("id", "workspaceId", "planningNotes", "updatedAt")
SELECT "id", "workspaceId", TRIM(
  CASE WHEN "contentPillars" <> '' THEN 'Content pillars: ' || "contentPillars" || char(10) ELSE '' END ||
  CASE WHEN "recurringSeries" <> '' THEN 'Recurring series: ' || "recurringSeries" || char(10) ELSE '' END ||
  CASE WHEN "tone" <> '' THEN 'Tone: ' || "tone" || char(10) ELSE '' END ||
  CASE WHEN "targetDuration" <> '' THEN 'Target duration: ' || "targetDuration" || char(10) ELSE '' END ||
  CASE WHEN "uploadGoals" <> '' THEN 'Upload goals: ' || "uploadGoals" || char(10) ELSE '' END ||
  CASE WHEN "topicsToPursue" <> '' THEN 'Topics to pursue: ' || "topicsToPursue" || char(10) ELSE '' END ||
  CASE WHEN "topicsToAvoid" <> '' THEN 'Topics to avoid: ' || "topicsToAvoid" || char(10) ELSE '' END ||
  CASE WHEN "packagingRules" <> '' THEN 'Packaging rules: ' || "packagingRules" || char(10) ELSE '' END ||
  CASE WHEN "expertiseNotes" <> '' THEN 'Expertise: ' || "expertiseNotes" || char(10) ELSE '' END ||
  CASE WHEN "interestsNotes" <> '' THEN 'Interests: ' || "interestsNotes" || char(10) ELSE '' END ||
  CASE WHEN "availableSources" <> '' THEN 'Available sources: ' || "availableSources" || char(10) ELSE '' END ||
  CASE WHEN "preferredTypes" <> '' THEN 'Preferred video types: ' || "preferredTypes" || char(10) ELSE '' END ||
  CASE WHEN "businessGoals" <> '' THEN 'Business goals: ' || "businessGoals" ELSE '' END
), "updatedAt" FROM "ChannelResearchProfile";
DROP TABLE "ChannelResearchProfile";
ALTER TABLE "new_ChannelResearchProfile" RENAME TO "ChannelResearchProfile";
CREATE UNIQUE INDEX "ChannelResearchProfile_workspaceId_key" ON "ChannelResearchProfile"("workspaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
