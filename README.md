# Rebus Race

A daily rebus puzzle game built with React + Vite + TypeScript and Supabase.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up your Supabase project:
   - Create a new Supabase project at https://supabase.com
   - Create the following tables:

   **puzzles table:**
   ```sql
   CREATE TABLE puzzles (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     date DATE NOT NULL UNIQUE,
     image_url TEXT NOT NULL,
     answer TEXT NOT NULL,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );
   ```

   **submissions table:**
   ```sql
   CREATE TABLE submissions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     puzzle_id UUID NOT NULL REFERENCES puzzles(id),
     user_id UUID REFERENCES auth.users(id),
     anon_id TEXT,
     answer TEXT NOT NULL,
     is_correct BOOLEAN NOT NULL,
     time_ms INTEGER NOT NULL,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );
   ```

   - Create indexes for better performance:
   ```sql
   CREATE INDEX idx_submissions_puzzle_id ON submissions(puzzle_id);
   CREATE INDEX idx_submissions_is_correct ON submissions(is_correct);
   CREATE INDEX idx_submissions_time_ms ON submissions(time_ms);
   ```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Add your Supabase URL and anon key:
   ```
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Run the development server:
```bash
npm run dev
```

## Features

- **Today's Puzzle** (`/today`): Play today's rebus puzzle with a 30-second timer
- **Leaderboard** (`/leaderboard`): View the fastest correct submissions for today's puzzle
- **Archive** (`/archive`): Browse and replay past puzzles

## Tech Stack

- React 18
- TypeScript
- Vite
- Supabase
- Tailwind CSS
- React Router

