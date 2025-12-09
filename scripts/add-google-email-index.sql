-- Add index on google_email for faster lookups when checking if a Google email already exists
-- This is needed for the one-username-per-Google-email feature

CREATE INDEX IF NOT EXISTS idx_users_google_email ON users(google_email) WHERE google_email IS NOT NULL;

COMMENT ON INDEX idx_users_google_email IS 'Index for fast lookups of users by Google email address';

