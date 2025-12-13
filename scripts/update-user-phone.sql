-- Update a user's phone number
-- Replace 'ANON_ID_HERE' with the actual anon_id and 'PHONE_NUMBER_HERE' with the phone number
-- Phone number should be in E.164 format: +1234567890

UPDATE users
SET phone_number = 'PHONE_NUMBER_HERE',
    phone_verified = true,
    updated_at = NOW()
WHERE anon_id = 'ANON_ID_HERE';

-- Example:
-- UPDATE users
-- SET phone_number = '+15551234567',
--     phone_verified = true,
--     updated_at = NOW()
-- WHERE anon_id = 'abc123';

-- Bulk update phone numbers from a CSV (you'll need to import this differently)
-- Or use this pattern for individual updates





