-- Add Google authentication columns to users table
-- This allows users to log in with Google OAuth

ALTER TABLE users
ADD COLUMN IF NOT EXISTS google_id TEXT,
ADD COLUMN IF NOT EXISTS google_email TEXT,
ADD COLUMN IF NOT EXISTS google_name TEXT,
ADD COLUMN IF NOT EXISTS google_picture TEXT;

-- Create index for faster Google ID lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN users.google_id IS 'Google OAuth user ID';
COMMENT ON COLUMN users.google_email IS 'Google account email address';
COMMENT ON COLUMN users.google_name IS 'Google account display name';
COMMENT ON COLUMN users.google_picture IS 'Google account profile picture URL';

