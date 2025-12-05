// Utility for managing paused game state

export interface PausedGameState {
  puzzleId: string;
  isDaily: boolean; // true for today's puzzle, false for archive
  startTime: number; // timestamp when game started
  pausedAt: number; // timestamp when paused
  timeElapsed: number; // seconds elapsed when paused
  wrongGuesses: string[];
  guessCount: number;
  hintUsed: boolean;
  answer: string; // current answer input
}

const PAUSED_GAME_KEY = 'rebus_paused_game';

export function savePausedGame(state: PausedGameState): void {
  localStorage.setItem(PAUSED_GAME_KEY, JSON.stringify(state));
}

export function loadPausedGame(): PausedGameState | null {
  const saved = localStorage.getItem(PAUSED_GAME_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export function clearPausedGame(): void {
  localStorage.removeItem(PAUSED_GAME_KEY);
}

export function hasPausedGame(puzzleId: string): boolean {
  const paused = loadPausedGame();
  return paused !== null && paused.puzzleId === puzzleId;
}

