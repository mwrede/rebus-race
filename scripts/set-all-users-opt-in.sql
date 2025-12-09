-- Set opt_in_texts = true for all users
UPDATE users
SET opt_in_texts = true
WHERE opt_in_texts IS NULL OR opt_in_texts = false;

-- Verify the update
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN opt_in_texts = true THEN 1 END) as opted_in,
  COUNT(CASE WHEN opt_in_texts = false THEN 1 END) as opted_out
FROM users;


