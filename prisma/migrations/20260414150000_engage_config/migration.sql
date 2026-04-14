-- EngageConfig: per-platform live settings for the engage runners.
--
-- Singleton rows keyed by platform name. Runners read their own row at
-- startup to decide whether to run (`enabled`) and how many comments to
-- attempt (`perRunCap`). `runsPerDay` is advisory / display-only — the
-- actual schedule is owned by systemd user timers.
--
-- Two rows seeded below (facebook + reddit) so the API never has to
-- create-on-read. All defaults match Tim's stated intent: 8/run,
-- 4 runs/day, both enabled.

CREATE TABLE "EngageConfig" (
    "id"         TEXT NOT NULL,
    "platform"   TEXT NOT NULL,
    "enabled"    BOOLEAN NOT NULL DEFAULT true,
    "perRunCap"  INTEGER NOT NULL DEFAULT 8,
    "runsPerDay" INTEGER NOT NULL DEFAULT 4,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    "updatedBy"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngageConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EngageConfig_platform_key" ON "EngageConfig"("platform");

-- Seed rows. Runners and API routes both expect these to exist.
INSERT INTO "EngageConfig" ("id", "platform", "enabled", "perRunCap", "runsPerDay", "updatedAt")
VALUES
  ('engage_config_facebook', 'facebook', true, 8, 4, CURRENT_TIMESTAMP),
  ('engage_config_reddit',   'reddit',   true, 8, 4, CURRENT_TIMESTAMP);
