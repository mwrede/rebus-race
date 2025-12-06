-- Add +1 country code to all phone numbers that don't already have it
-- This assumes all numbers are US/Canada numbers

-- First, let's see what we're working with
SELECT phone_number, COUNT(*) 
FROM users 
WHERE phone_number IS NOT NULL
GROUP BY phone_number
ORDER BY COUNT(*) DESC;

-- Update phone numbers that don't start with +
-- Remove any existing +1, spaces, dashes, parentheses first, then add +1
UPDATE users
SET phone_number = '+1' || REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g')
WHERE phone_number IS NOT NULL
  AND phone_number NOT LIKE '+%'
  AND LENGTH(REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g')) = 10; -- Only 10-digit numbers

-- Update phone numbers that start with + but not +1
UPDATE users
SET phone_number = '+1' || SUBSTRING(phone_number FROM 2)
WHERE phone_number IS NOT NULL
  AND phone_number LIKE '+%'
  AND phone_number NOT LIKE '+1%'
  AND LENGTH(REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g')) = 10;

-- Update phone numbers that are just digits (10 digits) without +
UPDATE users
SET phone_number = '+1' || phone_number
WHERE phone_number IS NOT NULL
  AND phone_number NOT LIKE '+%'
  AND LENGTH(REGEXP_REPLACE(phone_number, '[^0-9]', '', 'g')) = 10;

-- View the results
SELECT phone_number, COUNT(*) 
FROM users 
WHERE phone_number IS NOT NULL
GROUP BY phone_number
ORDER BY COUNT(*) DESC;

