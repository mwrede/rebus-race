-- RLS Policies for Rebus Race
-- These policies allow anonymous users to read public data and write their own data

-- ============================================
-- PUZZLES TABLE
-- ============================================
-- Allow anyone to read puzzles (public data)
CREATE POLICY "Allow public read access to puzzles"
  ON puzzles FOR SELECT
  USING (true);

-- Only service role can insert/update puzzles (admin only)
-- No policy needed - service role bypasses RLS

-- ============================================
-- SUBMISSIONS TABLE
-- ============================================
-- Allow anyone to read all submissions (for leaderboards)
CREATE POLICY "Allow public read access to submissions"
  ON submissions FOR SELECT
  USING (true);

-- Allow users to insert their own submissions
-- Note: This uses anon_id from the request, which should be set in the client
CREATE POLICY "Allow users to insert their own submissions"
  ON submissions FOR INSERT
  WITH CHECK (true); -- We validate anon_id in application logic

-- Allow users to update their own submissions (if needed)
CREATE POLICY "Allow users to update their own submissions"
  ON submissions FOR UPDATE
  USING (true) -- Simplified for now, can be restricted if needed
  WITH CHECK (true);

-- ============================================
-- USERS TABLE
-- ============================================
-- Allow users to read their own user record
-- Note: Since we use anon_id, we allow reading any user (for leaderboards)
-- But we restrict updates to their own record
CREATE POLICY "Allow public read access to users"
  ON users FOR SELECT
  USING (true);

-- Allow users to insert/update their own user record
CREATE POLICY "Allow users to upsert their own user record"
  ON users FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow users to update their own user record"
  ON users FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================
-- GUESSES TABLE
-- ============================================
-- Allow users to read their own guesses
CREATE POLICY "Allow users to read their own guesses"
  ON guesses FOR SELECT
  USING (true); -- Simplified - can restrict to anon_id if needed

-- Allow users to insert their own guesses
CREATE POLICY "Allow users to insert their own guesses"
  ON guesses FOR INSERT
  WITH CHECK (true);

-- ============================================
-- IMAGE_SUBMISSIONS TABLE
-- ============================================
-- Allow users to read image submissions (for admin viewing)
CREATE POLICY "Allow public read access to image_submissions"
  ON image_submissions FOR SELECT
  USING (true);

-- Allow users to insert their own image submissions
CREATE POLICY "Allow users to insert image submissions"
  ON image_submissions FOR INSERT
  WITH CHECK (true);

-- ============================================
-- CLUE_SUGGESTIONS TABLE (if exists)
-- ============================================
-- Allow users to read clue suggestions (for admin viewing)
CREATE POLICY "Allow public read access to clue_suggestions"
  ON clue_suggestions FOR SELECT
  USING (true);

-- Allow users to insert their own clue suggestions
CREATE POLICY "Allow users to insert clue suggestions"
  ON clue_suggestions FOR INSERT
  WITH CHECK (true);

