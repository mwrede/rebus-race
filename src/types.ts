export interface Puzzle {
  id: string;
  date: string;
  image_url: string;
  answer: string;
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
}

