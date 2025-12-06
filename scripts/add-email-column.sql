-- Add email column to users table
-- Run this in your Supabase SQL editor

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index for faster email lookups (optional)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

COMMENT ON COLUMN users.email IS 'Optional email address for user notifications';

