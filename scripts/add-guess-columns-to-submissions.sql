-- Add columns to submissions table to store each of the 5 guesses
-- This allows seeing all guesses made for each submission

ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS guess_1 TEXT,
ADD COLUMN IF NOT EXISTS guess_2 TEXT,
ADD COLUMN IF NOT EXISTS guess_3 TEXT,
ADD COLUMN IF NOT EXISTS guess_4 TEXT,
ADD COLUMN IF NOT EXISTS guess_5 TEXT;

-- Add comments to document the columns
COMMENT ON COLUMN submissions.guess_1 IS 'First guess made (1st attempt)';
COMMENT ON COLUMN submissions.guess_2 IS 'Second guess made (2nd attempt)';
COMMENT ON COLUMN submissions.guess_3 IS 'Third guess made (3rd attempt)';
COMMENT ON COLUMN submissions.guess_4 IS 'Fourth guess made (4th attempt)';
COMMENT ON COLUMN submissions.guess_5 IS 'Fifth guess made (5th attempt)';


