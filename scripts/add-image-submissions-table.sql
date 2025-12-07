CREATE TABLE IF NOT EXISTS image_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT,
  image_url TEXT,
  answer TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_submissions_username ON image_submissions(username);
CREATE INDEX IF NOT EXISTS idx_image_submissions_created_at ON image_submissions(created_at);

COMMENT ON TABLE image_submissions IS 'Stores user-submitted rebus puzzles (images and/or answers/clues).';

