-- Production notes per stage for the current-video workflow.
ALTER TABLE "Idea" ADD COLUMN "production" TEXT NOT NULL DEFAULT '{}';
