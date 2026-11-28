-- Cancelled-raid attendance credit.
--
-- When Temple hosts no creditable raid (attendance_weight > 0) for one of the four attendance
-- zones in a lockout week, every raider gets credit for that zone that week, at the zone's default
-- weight (~/lib/raid-weights.ts: Naxx/AQ40/BWL 1, MC 0.5) — as though they had attended it. The
-- 3-per-week cap still applies. "Every raider" is everyone already in this view: anyone with a
-- creditable raid (attended or bench) in the 6-week window.
--
-- Mirrored in TypeScript by getWeeklyPrimaryCharacterAttendance (the heatmap grid) via
-- ~/lib/cancelled-raid-credit.ts — keep the two in step.
--
-- Output columns and their types are unchanged from 0001, so CREATE OR REPLACE keeps the existing
-- grants (reports_readonly / templar).
CREATE OR REPLACE VIEW views.primary_raid_attendance_l6lockoutwk AS
WITH date_range AS (SELECT date_trunc('week', current_date - 1 - interval '6 weeks') + interval '1 day' AS start_date,
                           date_trunc('week', current_date - 1)                                         AS end_date),
     total_weight AS (
         SELECT
             ceil(DATE_PART('day',end_date - start_date) / 7)      as total_weeks,
             ceil(DATE_PART('day',end_date - start_date) / 7) * 3  as total,
             3                                                     as max_per_week
         FROM date_range
     ),
     credited_zones (zone, attendance_weight) AS (
         VALUES ('Naxxramas', 1::real),
                ('Temple of Ahn''Qiraj', 1::real),
                ('Blackwing Lair', 1::real),
                ('Molten Core', 0.5::real)
     ),
     -- One row per lockout week in the window, keyed the same way as weekly_attendance.raid_week
     -- (the Monday that date_trunc('week', date - 1) yields).
     lockout_weeks AS (
         SELECT generate_series(
                        (SELECT start_date FROM date_range) - interval '1 day',
                        (SELECT end_date FROM date_range) - interval '7 days',
                        interval '7 days'
                )::date AS raid_week
     ),
     cancelled_zone_weeks AS (
         SELECT lw.raid_week, cz.zone, cz.attendance_weight
         FROM lockout_weeks lw
                  CROSS JOIN credited_zones cz
         WHERE NOT EXISTS (SELECT 1
                           FROM public.raid r
                           WHERE r.zone = cz.zone
                             AND r.attendance_weight > 0
                             AND date_trunc('week', r.date::date - 1)::date = lw.raid_week)
     ),
     character_attendance AS (
         SELECT
             c.character_id           as character_id,
             c.name                   as character_name,
             r.zone,
             r.date,
             r.attendance_weight,
             ROW_NUMBER() OVER (
                 PARTITION BY date_trunc('week', r.date::date - 1), c.character_id, r.zone
                 ORDER BY attendance_weight desc, date
                 ) AS rn
         FROM public.character c
                  JOIN views.primary_raid_attendee_and_bench_map prabm
                       ON c.character_id = prabm.primary_character_id
                  JOIN public.raid r ON prabm.raid_id = r.raid_id
         WHERE r.date BETWEEN (SELECT start_date FROM date_range) AND (SELECT end_date FROM date_range)
           AND r.attendance_weight > 0
           AND c.is_ignored = false
     ),
     raiders AS (
         SELECT DISTINCT character_id, character_name
         FROM character_attendance
     ),
     credits AS (
         SELECT date_trunc('week', a.date - 1)::date as raid_week,
                a.character_id,
                a.character_name,
                a.attendance_weight
         FROM character_attendance a
         WHERE a.rn = 1
         UNION ALL
         SELECT czw.raid_week,
                rd.character_id,
                rd.character_name,
                czw.attendance_weight
         FROM cancelled_zone_weeks czw
                  CROSS JOIN raiders rd
     ),
     weekly_attendance as (
         SELECT
             cr.raid_week,
             cr.character_id,
             cr.character_name,
             LEAST(SUM(cr.attendance_weight), tw.max_per_week) as week_total
         FROM credits cr
                  CROSS JOIN total_weight tw
         GROUP BY 1, 2, 3, tw.max_per_week
     )

SELECT
    character_id,
    character_name  as name,
    sum(week_total) as weighted_attendance,
    tw.total        as weighted_raid_total,
    COALESCE(sum(week_total) / NULLIF(tw.total, 0), 0) as weighted_attendance_pct
FROM weekly_attendance
         CROSS JOIN total_weight tw
group by character_id, character_name, tw.total
order by weighted_attendance_pct desc, character_name
;
