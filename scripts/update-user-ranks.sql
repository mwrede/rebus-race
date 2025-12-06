-- Update user ranks based on all-time leaderboard ranking
-- This calculates rank by number of wins first, then by average time
-- Run this script to populate initial ranks

WITH user_stats AS (
  SELECT 
    anon_id,
    COUNT(CASE WHEN is_correct = true THEN 1 END) as puzzles_won,
    AVG(CASE WHEN is_correct = true THEN time_ms END) as average_time
  FROM submissions
  WHERE anon_id IS NOT NULL
  GROUP BY anon_id
  HAVING COUNT(CASE WHEN is_correct = true THEN 1 END) > 0
),
ranked_users AS (
  SELECT 
    anon_id,
    puzzles_won,
    COALESCE(average_time, 0) as avg_time,
    ROW_NUMBER() OVER (
      ORDER BY 
        puzzles_won DESC,
        COALESCE(average_time, 999999999) ASC
    ) as rank
  FROM user_stats
)
UPDATE users
SET all_time_rank = ranked_users.rank,
    updated_at = NOW()
FROM ranked_users
WHERE users.anon_id = ranked_users.anon_id;

-- Also set rank to NULL for users with no wins (they don't have a rank yet)
UPDATE users
SET all_time_rank = NULL
WHERE anon_id NOT IN (
  SELECT DISTINCT anon_id 
  FROM submissions 
  WHERE is_correct = true AND anon_id IS NOT NULL
);

-- View the updated ranks
SELECT 
  anon_id,
  username,
  all_time_rank,
  phone_number
FROM users
WHERE all_time_rank IS NOT NULL
ORDER BY all_time_rank;

