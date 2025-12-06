-- Create a users table to store phone numbers and user information
-- This will be the central place to manage users for text blasts

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id TEXT UNIQUE NOT NULL,
  username TEXT,
  phone_number TEXT,
  phone_verified BOOLEAN DEFAULT false,
  opt_in_texts BOOLEAN DEFAULT true, -- Users can opt out of text blasts
  all_time_rank INTEGER, -- User's rank on the all-time leaderboard
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_users_anon_id ON users(anon_id);
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_opt_in ON users(opt_in_texts) WHERE opt_in_texts = true;
CREATE INDEX IF NOT EXISTS idx_users_rank ON users(all_time_rank);

-- Add a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migrate existing users from submissions table
INSERT INTO users (anon_id, username)
SELECT DISTINCT anon_id, username
FROM submissions
WHERE anon_id IS NOT NULL
ON CONFLICT (anon_id) DO UPDATE SET username = COALESCE(EXCLUDED.username, users.username);

-- Also migrate from guesses table for users who only made guesses (if table exists)
-- Uncomment this if you have a guesses table:
-- INSERT INTO users (anon_id, username)
-- SELECT DISTINCT anon_id, username
-- FROM guesses
-- WHERE anon_id IS NOT NULL
-- ON CONFLICT (anon_id) DO UPDATE SET username = COALESCE(EXCLUDED.username, users.username);

COMMENT ON TABLE users IS 'Central user table for managing user information including phone numbers for text blasts';

