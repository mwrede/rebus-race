-- Add guess_count column to submissions table
-- This column tracks how many guesses (1-5) the user made before submitting

ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS guess_count INTEGER;

-- Add a comment to document the column
COMMENT ON COLUMN submissions.guess_count IS 'Number of guesses made (1-5) before submission. NULL for old submissions before this feature was added.';

