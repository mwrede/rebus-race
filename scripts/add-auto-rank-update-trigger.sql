-- Create a function to automatically update user ranks when submissions are made
-- This will recalculate ranks for all users whenever a submission is inserted or updated

CREATE OR REPLACE FUNCTION update_user_ranks()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate all user ranks based on current submissions
  WITH user_stats AS (
    SELECT 
      anon_id,
      COUNT(CASE WHEN is_correct = true THEN 1 END) as puzzles_won,
      AVG(CASE WHEN is_correct = true THEN time_ms END) as average_time
    FROM submissions
    WHERE anon_id IS NOT NULL
    GROUP BY anon_id
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run after submissions are inserted
CREATE TRIGGER update_ranks_on_submission_insert
AFTER INSERT ON submissions
FOR EACH ROW
WHEN (NEW.anon_id IS NOT NULL)
EXECUTE FUNCTION update_user_ranks();

-- Create trigger to run after submissions are updated (in case is_correct changes)
CREATE TRIGGER update_ranks_on_submission_update
AFTER UPDATE ON submissions
FOR EACH ROW
WHEN (NEW.anon_id IS NOT NULL AND (OLD.is_correct IS DISTINCT FROM NEW.is_correct OR OLD.time_ms IS DISTINCT FROM NEW.time_ms))
EXECUTE FUNCTION update_user_ranks();

COMMENT ON FUNCTION update_user_ranks() IS 'Automatically updates user ranks when submissions are created or updated';

