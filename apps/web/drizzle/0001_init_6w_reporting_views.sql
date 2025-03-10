-- Custom SQL migration file, put you code below! --
CREATE SCHEMA IF NOT EXISTS "views"
;

-- Remove existing views to ensure columns can be dropped/recreated.
DROP VIEW IF EXISTS views.primary_raid_attendance_l6lockoutwk;
DROP VIEW IF EXISTS views.primary_raid_attendee_and_bench_map;
DROP VIEW IF EXISTS views.primary_raid_attendee_map;
DROP VIEW IF EXISTS views.primary_raid_bench_map;
DROP VIEW IF EXISTS views.tracked_raids_l6lockoutwk;
DROP VIEW IF EXISTS views.tracked_raids_current_lockout;
DROP VIEW IF EXISTS views.all_raids_current_lockout;
DROP VIEW IF EXISTS views.report_dates;

-- Create views.report_dates
CREATE VIEW views.report_dates AS
SELECT (date_trunc('week', CURRENT_DATE - 1 - INTERVAL '6 weeks') + INTERVAL '1 day')::DATE AS report_period_start,
       (date_trunc('week', CURRENT_DATE - 1))::DATE                                         AS report_period_end;

-- Create views.primary_raid_attendee_map
CREATE VIEW views.primary_raid_attendee_map AS
SELECT rl.raid_id                                                 AS raid_id
     , COALESCE(c.primary_character_id, c.character_id)           as primary_character_id
     , ARRAY_AGG(DISTINCT c.character_id ORDER BY c.character_id) as attending_character_ids
FROM public.raid_log rl
         LEFT JOIN public.raid_log_attendee_map rlam ON rl.raid_log_id = rlam.raid_log_id
         LEFT JOIN public.character c ON c.character_id = rlam.character_id
WHERE rl.raid_id IS NOT NULL
  AND rlam.is_ignored = false
  and c.is_ignored = false
GROUP BY rl.raid_id, COALESCE(c.primary_character_id, c.character_id)
;

-- Create views.primary_raid_bench_map
CREATE VIEW views.primary_raid_bench_map AS
SELECT rbm.raid_id                                                AS raid_id
     , COALESCE(c.primary_character_id, c.character_id)           as primary_character_id
     , ARRAY_AGG(DISTINCT c.character_id ORDER BY c.character_id) as bench_character_ids
FROM public.raid_bench_map rbm
         LEFT JOIN public.character c ON c.character_id = rbm.character_id
WHERE c.is_ignored = false
GROUP BY rbm.raid_id, COALESCE(c.primary_character_id, c.character_id)
;

-- Create views.primary_raid_attendee_map_with_bench
CREATE VIEW views.primary_raid_attendee_and_bench_map AS
WITH all_raid_participation AS (SELECT COALESCE(a.raid_id, b.raid_id)                           as raid_id,
                                       COALESCE(a.primary_character_id, b.primary_character_id) as primary_character_id,
                                       COALESCE(
                                               CASE
                                                   WHEN a.attending_character_ids IS NOT NULL AND
                                                        b.bench_character_ids IS NOT NULL
                                                       THEN (SELECT array_agg(DISTINCT elem ORDER BY elem)
                                                             FROM unnest(a.attending_character_ids || b.bench_character_ids) elem)
                                                   ELSE COALESCE(a.attending_character_ids, b.bench_character_ids)
                                                   END,
                                               '{}'::integer[]
                                       )                                                        as all_character_ids,
                                       CASE
                                           WHEN a.primary_character_id IS NOT NULL AND b.primary_character_id IS NULL
                                               THEN 'attendee'
                                           WHEN a.primary_character_id IS NULL AND b.primary_character_id IS NOT NULL
                                               THEN 'bench'
                                           WHEN a.primary_character_id IS NOT NULL AND b.primary_character_id IS NOT NULL
                                               THEN 'attendee'
                                           END                                                  as attendee_or_bench
                                FROM views.primary_raid_attendee_map a
                                         FULL OUTER JOIN views.primary_raid_bench_map b
                                                         ON a.raid_id = b.raid_id
                                                             AND a.primary_character_id = b.primary_character_id),

     character_details AS (SELECT character_id, name
                           FROM public.character
                           WHERE is_ignored = false),

     raid_logs_by_raid_id AS (SELECT raid_id, array_agg(raid_log_id) as raid_log_ids
                              FROM public.raid_log
                              WHERE raid_id IS NOT NULL
                              GROUP BY raid_id)

SELECT arp.raid_id,
       arp.primary_character_id,
       arp.all_character_ids,
       arp.attendee_or_bench,
       ARRAY(
               SELECT json_build_object('characterId', c.character_id, 'name', c.name) -- camelCase to match TS when in use
               FROM unnest(arp.all_character_ids) AS unnested_character_id
                        LEFT JOIN character_details c ON c.character_id = unnested_character_id
       ) AS all_characters,
       rl.raid_log_ids
FROM all_raid_participation arp
         LEFT JOIN raid_logs_by_raid_id rl ON rl.raid_id = arp.raid_id
WHERE arp.primary_character_id IS NOT NULL
ORDER BY arp.raid_id, arp.primary_character_id
;

-- Create views.raids_l6lockoutwk
CREATE OR REPLACE VIEW views.tracked_raids_l6lockoutwk AS
SELECT
    r.*,
    (date_trunc('week', r.date - 1) + INTERVAL '1 day')::date as lockout_week
FROM public.raid r
WHERE r.date >= date_trunc('week', CURRENT_DATE - 1 - INTERVAL '6 weeks') + INTERVAL '1 day'
  AND r.date < date_trunc('week', CURRENT_DATE - 1) + INTERVAL '1 day'
  AND r.attendance_weight > 0
ORDER BY date DESC
;

-- Create views.tracked_raids_current_lockout
CREATE OR REPLACE VIEW views.tracked_raids_current_lockout AS
SELECT r.*
FROM public.raid r
WHERE r.date >= date_trunc('week', CURRENT_DATE - 1) + INTERVAL '1 day'
  AND r.date <= date_trunc('week', CURRENT_DATE - 1) + INTERVAL '7 day'
  AND r.attendance_weight > 0
ORDER BY date DESC
;

CREATE OR REPLACE VIEW views.all_raids_current_lockout AS
SELECT r.*
FROM public.raid r
WHERE r.date >= date_trunc('week', CURRENT_DATE - 1) + INTERVAL '1 day'
  AND r.date <= date_trunc('week', CURRENT_DATE - 1) + INTERVAL '7 day'
ORDER BY date DESC
;

-- Create views.primary_raid_attendance_l6lockoutwk
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
     character_attendance AS (
         SELECT
             c.character_id           as character_id,
             c.name                   as character_name,
             r.name                   as raid_name,
             r.zone,
             r.date,
             r.attendance_weight,
             prabm.attendee_or_bench,
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
     weekly_attendance as (
         SELECT
             date_trunc('week', a.date-1)::date as raid_week,
             a.character_id,
             a.character_name,
             SUM(attendance_weight) AS weighted_attendance,
             LEAST(SUM(attendance_weight), tw.max_per_week) as week_total
                 ,
             array_agg(json_build_object(
                     'name', a.raid_name,
                     'zone', a.zone,
                     'date', a.date,
                     'attendanceWeight', a.attendance_weight,
                     'attendeeOrBench', a.attendee_or_bench
                       ))             as raids_attended_json
         FROM character_attendance a
                  CROSS JOIN total_weight tw
         WHERE a.rn = 1
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
having COALESCE(sum(week_total) / NULLIF(tw.total, 0), 0) >= 0.1
order by weighted_attendance_pct desc, character_name
;