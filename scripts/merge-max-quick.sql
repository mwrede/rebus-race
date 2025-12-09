-- Quick script to merge max users and update ranks
-- Just copy and paste this entire script into Supabase SQL editor

-- Merge max users
DO $$
DECLARE
  primary_id TEXT;
  all_ids TEXT[];
BEGIN
  SELECT anon_id INTO primary_id
  FROM (
    SELECT u.anon_id, COUNT(s.id) as cnt
    FROM users u LEFT JOIN submissions s ON u.anon_id = s.anon_id
    WHERE LOWER(TRIM(u.username)) = 'max'
    GROUP BY u.anon_id ORDER BY cnt DESC LIMIT 1
  ) x;

  SELECT ARRAY_AGG(anon_id) INTO all_ids
  FROM users WHERE LOWER(TRIM(username)) = 'max';

  UPDATE submissions SET anon_id = primary_id, username = 'max'
  WHERE anon_id = ANY(all_ids) AND anon_id != primary_id;

  UPDATE users u1 SET username = 'max', updated_at = NOW()
  FROM users u2
  WHERE u1.anon_id = primary_id AND u2.anon_id = ANY(all_ids) AND u2.anon_id != primary_id;

  DELETE FROM users WHERE anon_id = ANY(all_ids) AND anon_id != primary_id;
END $$;

-- Update all ranks
WITH stats AS (
  SELECT anon_id, COUNT(*) FILTER (WHERE is_correct = true) as wins,
         AVG(time_ms) FILTER (WHERE is_correct = true) as avg_time
  FROM submissions WHERE is_correct = true AND anon_id IS NOT NULL
  GROUP BY anon_id
),
ranked AS (
  SELECT anon_id, ROW_NUMBER() OVER (ORDER BY wins DESC, avg_time ASC) as r
  FROM stats
)
UPDATE users SET all_time_rank = ranked.r, updated_at = NOW()
FROM ranked WHERE users.anon_id = ranked.anon_id;

UPDATE users SET all_time_rank = NULL
WHERE anon_id NOT IN (SELECT DISTINCT anon_id FROM submissions WHERE is_correct = true);

