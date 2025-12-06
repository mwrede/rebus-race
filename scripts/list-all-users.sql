-- List all unique users from the database
-- This query gets all users with their usernames and anon_ids from submissions

SELECT DISTINCT
  anon_id,
  username,
  COUNT(*) as total_submissions,
  COUNT(CASE WHEN is_correct = true THEN 1 END) as correct_submissions,
  MIN(created_at) as first_played,
  MAX(created_at) as last_played
FROM submissions
WHERE anon_id IS NOT NULL
GROUP BY anon_id, username
ORDER BY last_played DESC;

-- Note: If you have a guesses table, you can also query it separately:
-- SELECT DISTINCT
--   anon_id,
--   username,
--   COUNT(*) as total_guesses,
--   MIN(created_at) as first_activity,
--   MAX(created_at) as last_activity
-- FROM guesses
-- WHERE anon_id IS NOT NULL
-- GROUP BY anon_id, username
-- ORDER BY last_activity DESC;

