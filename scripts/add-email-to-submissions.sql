-- Add email column to submissions table for tracking submissions by email
-- Run this in your Supabase SQL editor

ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_submissions_email ON submissions(email) WHERE email IS NOT NULL;

-- Create index for puzzle_id + email combination for duplicate checks
CREATE INDEX IF NOT EXISTS idx_submissions_puzzle_email ON submissions(puzzle_id, email) WHERE email IS NOT NULL;

COMMENT ON COLUMN submissions.email IS 'User email address for tracking submissions and preventing duplicates';

