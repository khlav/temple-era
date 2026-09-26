-- Per-raid clear-completeness audit for any subset of the 40-man zones.
-- Answers: "which AQ40 / BWL / MC raids have fewer bosses killed than the max?"
-- Run via the read-only SQL tool (read-only, SELECT-only, 200-row cap — narrow the zone
-- list if the row count approaches 200).
--
-- Verified live Sep 15 2026: 52 rows (AQ40 27/144, BWL 16/186, MC 9/175).
-- Zone population at that date: MC 175 raids, BWL 186, AQ40 144.

with zonelist as (
  select 'Molten Core' as zone, unnest(array[
    'Lucifron','Magmadar','Gehennas','Garr','Baron Geddon','Shazzrah',
    'Sulfuron Harbinger','Golemagg the Incinerator','Majordomo Executus','Ragnaros']) as boss
  union all
  select 'Blackwing Lair', unnest(array[
    'Razorgore the Untamed','Vaelastrasz the Corrupt','Broodlord Lashlayer','Firemaw',
    'Ebonroc','Flamegor','Chromaggus','Nefarian'])
  union all
  select E'Temple of Ahn''Qiraj', unnest(array[
    'The Prophet Skeram','Silithid Royalty','Battleguard Sartura','Fankriss the Unyielding',
    'Viscidus','Princess Huhuran','Twin Emperors','Ouro',E'C''Thun'])
  union all
  select 'Naxxramas', unnest(array[
    'Anub''Rekhan','Grand Widow Faerlina','Maexxna','Noth the Plaguebringer',
    'Heigan the Unclean','Loatheb','Instructor Razuvious','Gothik the Harvester',
    'The Four Horsemen','Patchwerk','Grobbulus','Gluth','Thaddius',
    'Sapphiron','Kel''Thuzad'])
),
kills_per_raid as (
  -- The unnest MUST be in the FROM via an explicit lateral alias. Writing
  --   count(distinct k) ... and z.boss = any(rl.kills)
  -- fails with: column "k" does not exist. count(distinct bossname), not
  -- count(*), is what makes a boss killed twice in one night count once.
  select r.raid_id, count(distinct k.bossname) as bosses
  from public.raid r
  join public.raid_log rl on rl.raid_id = r.raid_id
  cross join lateral unnest(rl.kills) as k(bossname)
  join zonelist z on z.zone = r.zone and z.boss = k.bossname
  group by r.raid_id
),
maxes as (select zone, count(*)::int as zone_max from zonelist group by zone)
select r.raid_id, r.date, r.zone, coalesce(k.bosses,0) as bosses, m.zone_max,
       r.name, r.attendance_weight
from public.raid r
left join kills_per_raid k on k.raid_id = r.raid_id
join maxes m on m.zone = r.zone
where r.zone in ('Molten Core','Blackwing Lair',E'Temple of Ahn''Qiraj')
  and coalesce(k.bosses,0) < m.zone_max
order by r.date, r.zone;

-- ---------------------------------------------------------------------------
-- Variant A — counts only, by zone. RUN THIS FIRST for the cost projection
-- (count -> list -> projection -> get the go-ahead, before any refresh).
--   select r.zone, m.zone_max,
--          count(*) as raids_total,
--          count(*) filter (where coalesce(k.bosses,0) < m.zone_max) as raids_under_max,
--          count(*) filter (where coalesce(k.bosses,0) = 0) as raids_zero_kills
--   ... group by r.zone, m.zone_max order by r.zone;
--
-- Variant B — histogram of clear depth, for the gap>=2 vs 1-boss-gap split:
--   select r.zone, coalesce(k.bosses,0) as bosses_killed, count(*) as raids
--   ... group by r.zone, coalesce(k.bosses,0) order by r.zone, bosses_killed;
--
-- Variant C — post-refresh re-check of one batch: add
--   and r.raid_id in (147,144,122,...)
-- to the FINAL where clause, and drop the `bosses < zone_max` filter so the
-- same query shows both the recovered and the unchanged raids.
