-- Simple script to merge two "max" users and update ranks
-- Run this in your Supabase SQL editor

-- Step 1: Merge max users (keep the one with most submissions)
DO $$
DECLARE
  primary_anon_id TEXT;
  all_max_anon_ids TEXT[];
BEGIN
  -- Find primary anon_id (most submissions)
  SELECT anon_id INTO primary_anon_id
  FROM (
    SELECT u.anon_id, COUNT(s.id) as submission_count
    FROM users u
    LEFT JOIN submissions s ON u.anon_id = s.anon_id
    WHERE LOWER(TRIM(u.username)) = 'max'
    GROUP BY u.anon_id
    ORDER BY submission_count DESC
    LIMIT 1
  ) subq;

  -- Get all max anon_ids
  SELECT ARRAY_AGG(anon_id) INTO all_max_anon_ids
  FROM users
  WHERE LOWER(TRIM(username)) = 'max';

  -- Update submissions
  UPDATE submissions
  SET anon_id = primary_anon_id, username = 'max'
  WHERE anon_id = ANY(all_max_anon_ids) AND anon_id != primary_anon_id;

  -- Merge user data
  UPDATE users u1
  SET 
    phone_number = COALESCE(u1.phone_number, u2.phone_number),
    email = COALESCE(u1.email, u2.email),
    google_id = COALESCE(u1.google_id, u2.google_id),
    google_email = COALESCE(u1.google_email, u2.google_email),
    username = 'max',
    updated_at = NOW()
  FROM users u2
  WHERE u1.anon_id = primary_anon_id
    AND u2.anon_id = ANY(all_max_anon_ids)
    AND u2.anon_id != primary_anon_id;

  -- Delete duplicates
  DELETE FROM users
  WHERE anon_id = ANY(all_max_anon_ids) AND anon_id != primary_anon_id;
END $$;

-- Step 2: Update all ranks based on submissions
WITH user_stats AS (
  SELECT 
    anon_id,
    COUNT(*) FILTER (WHERE is_correct = true) as puzzles_won,
    AVG(time_ms) FILTER (WHERE is_correct = true) as average_time
  FROM submissions
  WHERE is_correct = true AND anon_id IS NOT NULL
  GROUP BY anon_id
),
ranked_users AS (
  SELECT 
    anon_id,
    ROW_NUMBER() OVER (ORDER BY puzzles_won DESC, average_time ASC) as new_rank
  FROM user_stats
)
UPDATE users
SET all_time_rank = ranked_users.new_rank, updated_at = NOW()
FROM ranked_users
WHERE users.anon_id = ranked_users.anon_id;

-- Set rank to NULL for users with no wins
UPDATE users
SET all_time_rank = NULL
WHERE anon_id NOT IN (
  SELECT DISTINCT anon_id FROM submissions WHERE is_correct = true
);

