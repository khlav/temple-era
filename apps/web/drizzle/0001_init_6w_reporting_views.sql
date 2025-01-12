-- Custom SQL migration file, put you code below! --
CREATE SCHEMA IF NOT EXISTS "views"
;

-- Remove existing views to ensure columns can be dropped/recreated.
DROP VIEW IF EXISTS views.primary_raid_attendance_l6lockoutwk;
DROP VIEW IF EXISTS views.primary_raid_attendee_and_bench_map;
DROP VIEW IF EXISTS views.primary_raid_attendee_map;
DROP VIEW IF EXISTS views.primary_raid_bench_map;
DROP VIEW IF EXISTS views.tracked_raids_l6lockoutwk;

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
                                                             AND a.primary_character_id = b.primary_character_id)
SELECT raid_id,
       primary_character_id,
       all_character_ids,
       attendee_or_bench
FROM all_raid_participation
WHERE primary_character_id IS NOT NULL
ORDER BY raid_id, primary_character_id
;

-- Create views.raids_l6lockoutwk
CREATE OR REPLACE VIEW views.tracked_raids_l6lockoutwk AS
SELECT r.*
FROM public.raid r
WHERE r.date >= date_trunc('week', CURRENT_DATE - INTERVAL '6 weeks') + INTERVAL '1 day'
  AND r.date < date_trunc('week', CURRENT_DATE) + INTERVAL '1 day'
  AND r.attendance_weight > 0
ORDER BY date DESC
;


-- Create views.primary_raid_attendance_l6lockoutwk
CREATE OR REPLACE VIEW views.primary_raid_attendance_l6lockoutwk AS
WITH date_range AS (SELECT date_trunc('week', current_date - interval '6 weeks') + interval '1 day' AS start_date,
                           date_trunc('week', current_date)                                         AS end_date),
     total_weight AS (SELECT SUM(attendance_weight) AS total
                      FROM public.raid
                      WHERE date BETWEEN (SELECT start_date FROM date_range) AND (SELECT end_date FROM date_range)),
     character_attendance AS (SELECT c.character_id           as character_id,
                                     c.name                   as name,
                                     SUM(r.attendance_weight) AS weighted_attendance,
                                     array_agg(json_build_object(
                                             'name', r.name,
                                             'zone', r.zone,
                                             'attendanceWeight', r.attendance_weight,
                                             'attendeeOrBench', prabm.attendee_or_bench
                                               ))             as raids_attended_json
                              FROM public.character c
                                       JOIN views.primary_raid_attendee_and_bench_map prabm
                                            ON c.character_id = prabm.primary_character_id
                                       JOIN public.raid r ON prabm.raid_id = r.raid_id
                              WHERE r.date BETWEEN (SELECT start_date FROM date_range) AND (SELECT end_date FROM date_range)
                                AND r.attendance_weight > 0
                                and c.is_ignored = false
                              GROUP BY c.character_id, c.name)
SELECT ca.character_id                                           as character_id,
       ca.name                                                   as name,
       COALESCE(ca.weighted_attendance, 0)                       AS weighted_attendance,
       tw.total                                                  AS weighted_raid_total,
       COALESCE(ca.weighted_attendance / NULLIF(tw.total, 0), 0) AS weighted_attendance_pct,
       raids_attended_json
FROM character_attendance ca
         CROSS JOIN total_weight tw
ORDER BY weighted_attendance_pct DESC, ca.name
;