const WINS_KEY = 'rebus_wins';
const WON_PUZZLES_KEY = 'rebus_won_puzzles'; // Track which puzzles they've won to avoid duplicates

export function getWins(): number {
  const wins = localStorage.getItem(WINS_KEY);
  return wins ? parseInt(wins, 10) : 0;
}

export function incrementWin(puzzleId: string): boolean {
  // Check if they've already won this puzzle
  const wonPuzzles = getWonPuzzles();
  if (wonPuzzles.includes(puzzleId)) {
    return false; // Already won this puzzle
  }

  // Increment win count
  const currentWins = getWins();
  localStorage.setItem(WINS_KEY, (currentWins + 1).toString());

  // Add puzzle to won list
  wonPuzzles.push(puzzleId);
  localStorage.setItem(WON_PUZZLES_KEY, JSON.stringify(wonPuzzles));

  // Dispatch custom event to notify other components
  window.dispatchEvent(new CustomEvent('rebusWinUpdated'));

  return true;
}

export function getWonPuzzles(): string[] {
  const wonPuzzles = localStorage.getItem(WON_PUZZLES_KEY);
  return wonPuzzles ? JSON.parse(wonPuzzles) : [];
}

export function resetStats(): void {
  localStorage.removeItem(WINS_KEY);
  localStorage.removeItem(WON_PUZZLES_KEY);
}

