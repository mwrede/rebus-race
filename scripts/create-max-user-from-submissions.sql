-- Create a new user "max" from submissions
-- This script finds all submissions with username "max" (case-insensitive)
-- and creates a new user record, assigning all those submissions to it

DO $$
DECLARE
  new_anon_id TEXT;
  max_username TEXT := 'max';
  submission_anon_ids TEXT[];
BEGIN
  -- Generate a new anon_id for the max user
  new_anon_id := gen_random_uuid()::TEXT;
  
  RAISE NOTICE 'Creating new user with anon_id: % and username: %', new_anon_id, max_username;
  
  -- Get all anon_ids from submissions with username "max" (case-insensitive)
  SELECT ARRAY_AGG(DISTINCT anon_id) INTO submission_anon_ids
  FROM submissions
  WHERE LOWER(TRIM(username)) = LOWER(max_username)
    AND anon_id IS NOT NULL;
  
  -- If no submissions found, check if we should still create the user
  IF submission_anon_ids IS NULL OR array_length(submission_anon_ids, 1) IS NULL THEN
    RAISE NOTICE 'No submissions found with username "max". Creating empty user record.';
  ELSE
    RAISE NOTICE 'Found submissions with anon_ids: %', submission_anon_ids;
  END IF;
  
  -- Step 1: Create the new user record
  INSERT INTO users (anon_id, username, created_at, updated_at)
  VALUES (new_anon_id, max_username, NOW(), NOW())
  ON CONFLICT (anon_id) DO UPDATE SET
    username = max_username,
    updated_at = NOW();
  
  RAISE NOTICE 'Created/updated user record';
  
  -- Step 2: Update all submissions with username "max" to use the new anon_id
  UPDATE submissions
  SET 
    anon_id = new_anon_id,
    username = max_username
  WHERE LOWER(TRIM(username)) = LOWER(max_username);
  
  RAISE NOTICE 'Updated % submissions', (SELECT COUNT(*) FROM submissions WHERE anon_id = new_anon_id);
  
  -- Step 3: Update clue_suggestions if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clue_suggestions' AND column_name = 'anon_id'
  ) THEN
    UPDATE clue_suggestions
    SET 
      anon_id = new_anon_id,
      username = max_username
    WHERE LOWER(TRIM(username)) = LOWER(max_username);
    
    RAISE NOTICE 'Updated clue_suggestions';
  END IF;
  
  -- Update clue_suggestions username (if table exists but no anon_id column)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'clue_suggestions'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clue_suggestions' AND column_name = 'anon_id'
  ) THEN
    UPDATE clue_suggestions
    SET username = max_username
    WHERE LOWER(TRIM(username)) = LOWER(max_username);
    
    RAISE NOTICE 'Updated clue_suggestions username';
  END IF;
  
  -- Step 4: Update image_submissions
  UPDATE image_submissions
  SET username = max_username
  WHERE LOWER(TRIM(username)) = LOWER(max_username);
  
  RAISE NOTICE 'Updated image_submissions';
  
  -- Step 5: Update guesses table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guesses') THEN
    UPDATE guesses
    SET 
      anon_id = new_anon_id,
      username = max_username
    WHERE LOWER(TRIM(username)) = LOWER(max_username);
    
    RAISE NOTICE 'Updated guesses';
  END IF;
  
  RAISE NOTICE 'Successfully created user "max" with anon_id: %', new_anon_id;
  
END $$;

-- Step 6: Recalculate ranks for all users
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

-- Verification: Show the new Max user
SELECT 
  u.anon_id,
  u.username,
  u.all_time_rank,
  COUNT(s.id) as total_submissions,
  COUNT(s.id) FILTER (WHERE s.is_correct = true) as correct_submissions,
  AVG(s.time_ms) FILTER (WHERE s.is_correct = true) as avg_time_ms,
  u.email,
  u.google_email,
  u.phone_number
FROM users u
LEFT JOIN submissions s ON u.anon_id = s.anon_id
WHERE LOWER(TRIM(u.username)) = 'max'
GROUP BY u.anon_id, u.username, u.all_time_rank, u.email, u.google_email, u.phone_number;

