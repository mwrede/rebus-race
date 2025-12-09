-- Add username and anon_id columns to clue_suggestions table
-- This allows tracking who submitted each clue suggestion

ALTER TABLE clue_suggestions
ADD COLUMN IF NOT EXISTS anon_id TEXT;

ALTER TABLE clue_suggestions
ADD COLUMN IF NOT EXISTS username TEXT;

-- Create index for faster queries by username
CREATE INDEX IF NOT EXISTS idx_clue_suggestions_username ON clue_suggestions(username);
CREATE INDEX IF NOT EXISTS idx_clue_suggestions_anon_id ON clue_suggestions(anon_id);



