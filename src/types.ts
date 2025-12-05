export interface Puzzle {
  id: string;
  date: string;
  image_url: string;
  answer: string;
  hint?: string | null;
}

export interface Submission {
  id: string;
  puzzle_id: string;
  user_id: string | null;
  anon_id: string | null;
  username: string | null;
  answer: string;
  is_correct: boolean;
  time_ms: number;
  created_at: string;
  guess_count?: number | null;
}

export interface Guess {
  id: string;
  puzzle_id: string;
  anon_id: string | null;
  user_id: string | null;
  username: string | null;
  guess: string;
  is_correct: boolean;
  guess_number: number;
  time_ms: number | null;
  created_at: string;
}

