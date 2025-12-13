-- Get all users who have opted in to text blasts and have phone numbers
-- Use this query to get the list of users for your daily text blast

SELECT 
  anon_id,
  username,
  phone_number,
  phone_verified
FROM users
WHERE opt_in_texts = true
  AND phone_number IS NOT NULL
  AND phone_verified = true
ORDER BY username, anon_id;

-- Count of users ready for text blast
SELECT COUNT(*) as total_users_for_text_blast
FROM users
WHERE opt_in_texts = true
  AND phone_number IS NOT NULL
  AND phone_verified = true;





