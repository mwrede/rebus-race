-- Merge all "Max" users into a single user based on submissions
-- This script consolidates all users with username "Max" (case-insensitive)

DO $$
DECLARE
  primary_anon_id TEXT;
  all_max_anon_ids TEXT[];
  max_username TEXT := 'Max';
BEGIN
  -- Find the primary anon_id (the one with the most submissions)
  SELECT anon_id INTO primary_anon_id
  FROM (
    SELECT 
      u.anon_id,
      COUNT(s.id) as submission_count
    FROM users u
    LEFT JOIN submissions s ON u.anon_id = s.anon_id
    WHERE LOWER(TRIM(u.username)) = LOWER(max_username)
    GROUP BY u.anon_id
    ORDER BY submission_count DESC, u.anon_id
    LIMIT 1
  ) subq;

  -- If no Max users found, exit
  IF primary_anon_id IS NULL THEN
    RAISE NOTICE 'No Max users found to merge';
    RETURN;
  END IF;

  -- Get all anon_ids for Max users
  SELECT ARRAY_AGG(anon_id) INTO all_max_anon_ids
  FROM users
  WHERE LOWER(TRIM(username)) = LOWER(max_username);

  RAISE NOTICE 'Primary anon_id: %', primary_anon_id;
  RAISE NOTICE 'All Max anon_ids: %', all_max_anon_ids;

  -- Step 1: Update all submissions to use the primary anon_id
  UPDATE submissions
  SET 
    anon_id = primary_anon_id,
    username = max_username
  WHERE anon_id = ANY(all_max_anon_ids)
    AND anon_id != primary_anon_id;

  RAISE NOTICE 'Updated submissions';

  -- Step 2: Merge user data into primary user (phone, email, Google info)
  UPDATE users u1
  SET 
    phone_number = COALESCE(u1.phone_number, u2.phone_number),
    email = COALESCE(u1.email, u2.email),
    google_id = COALESCE(u1.google_id, u2.google_id),
    google_email = COALESCE(u1.google_email, u2.google_email),
    google_name = COALESCE(u1.google_name, u2.google_name),
    google_picture = COALESCE(u1.google_picture, u2.google_picture),
    opt_in_texts = COALESCE(u1.opt_in_texts, u2.opt_in_texts, true),
    username = max_username, -- Ensure username is "Max"
    updated_at = NOW()
  FROM users u2
  WHERE u1.anon_id = primary_anon_id
    AND u2.anon_id = ANY(all_max_anon_ids)
    AND u2.anon_id != primary_anon_id;

  RAISE NOTICE 'Merged user data';

  -- Step 3: Delete duplicate user records (keep only the primary one)
  DELETE FROM users
  WHERE anon_id = ANY(all_max_anon_ids)
    AND anon_id != primary_anon_id;

  RAISE NOTICE 'Deleted duplicate user records';

  -- Step 4: Update other tables
  -- Update clue_suggestions
  UPDATE clue_suggestions
  SET 
    anon_id = primary_anon_id,
    username = max_username
  WHERE anon_id = ANY(all_max_anon_ids)
    AND anon_id != primary_anon_id;

  -- Update image_submissions
  UPDATE image_submissions
  SET username = max_username
  WHERE LOWER(TRIM(username)) = LOWER(max_username)
    AND username != max_username;

  -- Update guesses table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guesses') THEN
    UPDATE guesses
    SET 
      anon_id = primary_anon_id,
      username = max_username
    WHERE anon_id = ANY(all_max_anon_ids)
      AND anon_id != primary_anon_id;
  END IF;

  RAISE NOTICE 'Updated related tables';

END $$;

-- Step 5: Recalculate ranks for all users
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

-- Verification: Show the final Max user
SELECT 
  u.anon_id,
  u.username,
  u.all_time_rank,
  COUNT(s.id) as total_submissions,
  COUNT(s.id) FILTER (WHERE s.is_correct = true) as correct_submissions,
  AVG(s.time_ms) FILTER (WHERE s.is_correct = true) as avg_time_ms,
  u.email,
  u.google_email
FROM users u
LEFT JOIN submissions s ON u.anon_id = s.anon_id
WHERE LOWER(TRIM(u.username)) = 'max'
GROUP BY u.anon_id, u.username, u.all_time_rank, u.email, u.google_email;

-- Check if there are still multiple Max users
SELECT 
  COUNT(*) as max_user_count
FROM users
WHERE LOWER(TRIM(username)) = 'max';

