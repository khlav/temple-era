-- Lets the read-only reporting role (templar, via reports_readonly — see 0029/0030) read earned
-- achievements, so guild-wide achievement reporting works over the ad hoc SQL connection.
--
-- Same explicit allow-list rule as 0029: no ALTER DEFAULT PRIVILEGES, so a future table stays
-- invisible to this role until someone adds it here on purpose. `season` rides along because
-- achievement.season_id points at it — without it a query can't say which season an achievement
-- belongs to. Read-only: SELECT only, no write grant of any kind (TEMPLE-124).
GRANT SELECT ON
  public.achievement,
  public.achievement_tier,
  public.achievement_award,
  public.season
TO reports_readonly;
