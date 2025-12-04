-- Create guesses table to track all guesses made by users
-- This table stores every guess attempt, not just the final submission

CREATE TABLE IF NOT EXISTS guesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  anon_id TEXT,
  user_id UUID,
  username TEXT,
  guess TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  guess_number INTEGER NOT NULL, -- 1, 2, 3, 4, or 5
  time_ms INTEGER, -- Time elapsed when this guess was made
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_guesses_puzzle_id ON guesses(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_guesses_anon_id ON guesses(anon_id);
CREATE INDEX IF NOT EXISTS idx_guesses_puzzle_anon ON guesses(puzzle_id, anon_id);

-- Add a comment to document the table
COMMENT ON TABLE guesses IS 'Stores all guess attempts made by users for each puzzle, including incorrect guesses before the final submission.';

