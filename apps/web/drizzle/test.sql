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
                 PARTITION BY date_trunc('week', r.date), c.character_id, r.zone
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
            date_trunc('week', a.date)::date as raid_week,
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
order by weighted_attendance_pct desc, character_name

--
-- SELECT ca.character_id                                           as character_id
--      , ca.name                                                   as name
--      , COALESCE(ca.weighted_attendance, 0)                       AS weighted_attendance
--      , tw.total                                                  AS weighted_raid_total
--      , COALESCE(ca.weighted_attendance / NULLIF(tw.total, 0), 0) AS weighted_attendance_pct
-- -- , raids_attended_json
-- FROM character_attendance ca
--          CROSS JOIN total_weight tw
-- WHERE COALESCE(ca.weighted_attendance / NULLIF(tw.total, 0), 0) >= 0.1
-- ORDER BY weighted_attendance_pct DESC, ca.name