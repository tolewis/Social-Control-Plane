-- Add Graph API resolver + rotation fields to the engage pipeline.
--
-- - EngagePage.realFbPageId: canonical Graph API page id (learned lazily
--   by the worker resolver). Often differs from the legacy mbasic-scraped
--   fbPageId.
-- - EngagePage.lastPostedAt: set whenever the worker successfully posts
--   a comment on this page. Runners use it to spread comments across
--   the registry instead of hammering the same 8 pages every run.
-- - EngagePost.canonicalFbPostId: cached per-post Graph-confirmed id so
--   retries of the same comment skip the resolver GET.
--
-- All columns nullable, no backfill. Zero downtime.

ALTER TABLE "EngagePage"
  ADD COLUMN "realFbPageId" TEXT,
  ADD COLUMN "lastPostedAt" TIMESTAMP(3);

CREATE INDEX "EngagePage_lastPostedAt_idx" ON "EngagePage"("lastPostedAt");

ALTER TABLE "EngagePost"
  ADD COLUMN "canonicalFbPostId" TEXT;
