-- Create clue_suggestions table to store user suggestions for puzzle clues
-- This table stores suggestions submitted by users after completing a puzzle

CREATE TABLE IF NOT EXISTS clue_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id UUID NOT NULL REFERENCES puzzles(id) ON DELETE CASCADE,
  suggestion TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_clue_suggestions_puzzle_id ON clue_suggestions(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_clue_suggestions_created_at ON clue_suggestions(created_at);

-- Add a comment to document the table
COMMENT ON TABLE clue_suggestions IS 'Stores user suggestions for puzzle clues submitted after completing a puzzle.';

