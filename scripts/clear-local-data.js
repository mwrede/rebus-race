// Script to clear all local game data
// This clears localStorage but NOT the database

console.log('Clearing local game data...');

// List of all localStorage keys used by the game
const keysToRemove = [
  'rebus_anon_id',
  'rebus_username',
  'rebus_wins',
  'rebus_won_puzzles',
];

let cleared = 0;
keysToRemove.forEach(key => {
  if (localStorage.getItem(key)) {
    localStorage.removeItem(key);
    cleared++;
    console.log(`✓ Removed ${key}`);
  }
});

console.log(`\nCleared ${cleared} items from localStorage.`);
console.log('Refresh the page to start fresh!');

