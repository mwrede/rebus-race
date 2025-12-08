-- Merge Max1, Max, and Max 2 into a single user profile
-- This script consolidates all submissions and user data for these usernames

-- Step 1: Find the primary anon_id (the one with the most submissions)
DO $$
DECLARE
  primary_anon_id TEXT;
  all_max_anon_ids TEXT[];
BEGIN
  -- Find the primary anon_id (most submissions)
  SELECT anon_id INTO primary_anon_id
  FROM (
    SELECT 
      anon_id,
      COUNT(*) as submission_count
    FROM submissions
    WHERE LOWER(TRIM(username)) IN ('max1', 'max', 'max 2')
      AND anon_id IS NOT NULL
    GROUP BY anon_id
    ORDER BY submission_count DESC, anon_id
    LIMIT 1
  ) subq;

  -- Get all anon_ids for Max users
  SELECT ARRAY_AGG(DISTINCT anon_id) INTO all_max_anon_ids
  FROM submissions
  WHERE LOWER(TRIM(username)) IN ('max1', 'max', 'max 2')
    AND anon_id IS NOT NULL;

  -- If no primary anon_id found, exit
  IF primary_anon_id IS NULL THEN
    RAISE NOTICE 'No Max users found to merge';
    RETURN;
  END IF;

  RAISE NOTICE 'Primary anon_id: %', primary_anon_id;
  RAISE NOTICE 'All Max anon_ids: %', all_max_anon_ids;

  -- Step 2: Update all submissions to use the primary anon_id and username "Max"
  UPDATE submissions
  SET 
    anon_id = primary_anon_id,
    username = 'Max'
  WHERE anon_id = ANY(all_max_anon_ids)
    AND LOWER(TRIM(username)) IN ('max1', 'max', 'max 2');

  -- Step 3: Update users table - consolidate all Max users into one
  -- First, update the primary user record
  UPDATE users
  SET 
    username = 'Max',
    updated_at = NOW()
  WHERE anon_id = primary_anon_id;

  -- Merge any additional data from other Max user records into the primary one
  -- (e.g., phone numbers, emails)
  UPDATE users u1
  SET 
    phone_number = COALESCE(u1.phone_number, u2.phone_number),
    email = COALESCE(u1.email, u2.email),
    opt_in_texts = COALESCE(u1.opt_in_texts, u2.opt_in_texts, true),
    updated_at = NOW()
  FROM users u2
  WHERE u1.anon_id = primary_anon_id
    AND u2.anon_id = ANY(all_max_anon_ids)
    AND u2.anon_id != primary_anon_id;

  -- Delete duplicate user records (keep only the primary one)
  DELETE FROM users
  WHERE anon_id = ANY(all_max_anon_ids)
    AND anon_id != primary_anon_id;

  -- Step 4: Update other tables that reference usernames
  -- Update clue_suggestions
  UPDATE clue_suggestions
  SET 
    anon_id = primary_anon_id,
    username = 'Max'
  WHERE LOWER(TRIM(username)) IN ('max1', 'max', 'max 2')
    AND anon_id IS NOT NULL;

  -- Update image_submissions
  UPDATE image_submissions
  SET username = 'Max'
  WHERE LOWER(TRIM(username)) IN ('max1', 'max', 'max 2');

  -- Update guesses table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guesses') THEN
    UPDATE guesses
    SET 
      anon_id = primary_anon_id,
      username = 'Max'
    WHERE LOWER(TRIM(username)) IN ('max1', 'max', 'max 2')
      AND anon_id IS NOT NULL;
  END IF;

END $$;

-- Step 5: Recalculate ranks for all users
-- This uses the same logic as update-user-ranks.sql
WITH user_stats AS (
  SELECT 
    anon_id,
    COUNT(*) FILTER (WHERE is_correct = true) as puzzles_won,
    AVG(time_ms) FILTER (WHERE is_correct = true) as average_time
  FROM submissions
  WHERE is_correct = true
    AND anon_id IS NOT NULL
  GROUP BY anon_id
),
ranked_users AS (
  SELECT 
    anon_id,
    puzzles_won,
    average_time,
    ROW_NUMBER() OVER (
      ORDER BY puzzles_won DESC, average_time ASC
    ) as new_rank
  FROM user_stats
)
UPDATE users
SET 
  all_time_rank = ranked_users.new_rank,
  updated_at = NOW()
FROM ranked_users
WHERE users.anon_id = ranked_users.anon_id;

-- Set rank to NULL for users with no wins
UPDATE users
SET all_time_rank = NULL
WHERE anon_id NOT IN (
  SELECT DISTINCT anon_id 
  FROM submissions 
  WHERE is_correct = true AND anon_id IS NOT NULL
);

-- Verification query - check the merged user
SELECT 
  u.anon_id,
  u.username,
  u.all_time_rank,
  COUNT(s.id) as total_submissions,
  COUNT(s.id) FILTER (WHERE s.is_correct = true) as correct_submissions,
  AVG(s.time_ms) FILTER (WHERE s.is_correct = true) as avg_time
FROM users u
LEFT JOIN submissions s ON u.anon_id = s.anon_id
WHERE u.username = 'Max'
GROUP BY u.anon_id, u.username, u.all_time_rank;

COMMENT ON TABLE users IS 'Max1, Max, and Max 2 have been merged into a single user profile with username "Max"';

