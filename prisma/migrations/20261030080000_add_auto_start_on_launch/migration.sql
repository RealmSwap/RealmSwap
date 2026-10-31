-- Dedicated-box mode (deep-dive downside #1): a per-server switch to start
-- the server automatically when the app launches, so an "old laptop in the
-- closet" boots straight into its game servers. Default off — opt-in per
-- server alongside the existing launch-on-boot app setting.
ALTER TABLE "Server" ADD COLUMN "autoStartOnLaunch" BOOLEAN NOT NULL DEFAULT 0;
