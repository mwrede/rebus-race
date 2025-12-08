-- Consolidate duplicate users based on username
-- This script finds users with the same username (case-insensitive) and merges them
-- It uses the anon_id with the most submissions as the primary one

DO $$
DECLARE
  duplicate_record RECORD;
  primary_anon_id TEXT;
  all_anon_ids TEXT[];
  original_username TEXT;
BEGIN
  -- Loop through each duplicate username
  FOR duplicate_record IN
    SELECT 
      LOWER(TRIM(username)) as username_lower,
      username as original_username,
      COUNT(DISTINCT anon_id) as user_count
    FROM users
    WHERE username IS NOT NULL
    GROUP BY username
    HAVING COUNT(DISTINCT anon_id) > 1
  LOOP
    RAISE NOTICE 'Processing duplicate username: %', duplicate_record.original_username;
    
    -- Find the primary anon_id (most submissions)
    SELECT anon_id INTO primary_anon_id
    FROM (
      SELECT 
        u.anon_id,
        COUNT(s.id) as submission_count
      FROM users u
      LEFT JOIN submissions s ON u.anon_id = s.anon_id
      WHERE LOWER(TRIM(u.username)) = duplicate_record.username_lower
      GROUP BY u.anon_id
      ORDER BY submission_count DESC, u.anon_id
      LIMIT 1
    ) subq;
    
    -- Get all anon_ids for this username
    SELECT ARRAY_AGG(anon_id) INTO all_anon_ids
    FROM users
    WHERE LOWER(TRIM(username)) = duplicate_record.username_lower;
    
    -- Get the original username (from primary user)
    SELECT username INTO original_username
    FROM users
    WHERE anon_id = primary_anon_id;
    
    RAISE NOTICE 'Primary anon_id: %, All anon_ids: %', primary_anon_id, all_anon_ids;
    
    -- Update all submissions to use the primary anon_id
    UPDATE submissions
    SET 
      anon_id = primary_anon_id,
      username = original_username
    WHERE anon_id = ANY(all_anon_ids)
      AND anon_id != primary_anon_id;
    
    -- Merge user data into primary user
    UPDATE users u1
    SET 
      phone_number = COALESCE(u1.phone_number, u2.phone_number),
      email = COALESCE(u1.email, u2.email),
      google_id = COALESCE(u1.google_id, u2.google_id),
      google_email = COALESCE(u1.google_email, u2.google_email),
      google_name = COALESCE(u1.google_name, u2.google_name),
      google_picture = COALESCE(u1.google_picture, u2.google_picture),
      opt_in_texts = COALESCE(u1.opt_in_texts, u2.opt_in_texts, true),
      updated_at = NOW()
    FROM users u2
    WHERE u1.anon_id = primary_anon_id
      AND u2.anon_id = ANY(all_anon_ids)
      AND u2.anon_id != primary_anon_id;
    
    -- Delete duplicate user records
    DELETE FROM users
    WHERE anon_id = ANY(all_anon_ids)
      AND anon_id != primary_anon_id;
    
    -- Update clue_suggestions
    UPDATE clue_suggestions
    SET 
      anon_id = primary_anon_id,
      username = original_username
    WHERE anon_id = ANY(all_anon_ids)
      AND anon_id != primary_anon_id;
    
    -- Update image_submissions
    UPDATE image_submissions
    SET username = original_username
    WHERE LOWER(TRIM(username)) = duplicate_record.username_lower
      AND username != original_username;
    
    -- Update guesses table if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guesses') THEN
      UPDATE guesses
      SET 
        anon_id = primary_anon_id,
        username = original_username
      WHERE anon_id = ANY(all_anon_ids)
        AND anon_id != primary_anon_id;
    END IF;
    
    RAISE NOTICE 'Consolidated username: % into anon_id: %', duplicate_record.original_username, primary_anon_id;
  END LOOP;
END $$;

-- Recalculate ranks for all users
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

-- Verification query - show any remaining duplicates
SELECT 
  username,
  COUNT(*) as user_count,
  STRING_AGG(anon_id::text, ', ') as anon_ids
FROM users
WHERE username IS NOT NULL
GROUP BY username
HAVING COUNT(*) > 1
ORDER BY username;

-- Show final Max user(s)
SELECT 
  u.anon_id,
  u.username,
  u.all_time_rank,
  COUNT(s.id) as total_submissions,
  COUNT(s.id) FILTER (WHERE s.is_correct = true) as correct_submissions,
  AVG(s.time_ms) FILTER (WHERE s.is_correct = true) as avg_time
FROM users u
LEFT JOIN submissions s ON u.anon_id = s.anon_id
WHERE LOWER(TRIM(u.username)) = 'max'
GROUP BY u.anon_id, u.username, u.all_time_rank;
