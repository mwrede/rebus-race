// Script to seed puzzles from public folder
// Puzzle files should be named: MM.DD.YYYY_answer.png
// Run with: node scripts/seed-puzzles.js
// Make sure your .env file is configured

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Read .env file manually (simple approach)
const envFile = readFileSync('.env', 'utf-8');
const supabaseUrl = envFile.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const supabaseAnonKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Function to parse filename: MM.DD.YYYY_answer.png
function parsePuzzleFilename(filename) {
  // Remove .png extension
  const nameWithoutExt = filename.replace(/\.png$/i, '');
  
  // Split by first underscore to separate date from answer
  const firstUnderscoreIndex = nameWithoutExt.indexOf('_');
  if (firstUnderscoreIndex === -1) {
    return null;
  }
  
  const dateStr = nameWithoutExt.substring(0, firstUnderscoreIndex);
  const answer = nameWithoutExt.substring(firstUnderscoreIndex + 1);
  
  // Parse date from MM.DD.YYYY to YYYY-MM-DD
  const dateParts = dateStr.split('.');
  if (dateParts.length !== 3) {
    return null;
  }
  
  const [month, day, year] = dateParts;
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  
  return {
    answer: answer,
    date: date,
    image_url: `/${filename}`,
  };
}

async function seedPuzzles() {
  console.log('Scanning public folder for puzzle files...\n');
  
  // Read all files from public directory
  const publicDir = join(process.cwd(), 'public');
  const files = readdirSync(publicDir);
  
  // Filter for .png files and parse them
  // Skip files with "reveal" in the name as they're not actual puzzles
  const puzzles = files
    .filter(file => file.toLowerCase().endsWith('.png'))
    .filter(file => !file.toLowerCase().includes('reveal'))
    .map(file => parsePuzzleFilename(file))
    .filter(puzzle => puzzle !== null)
    .sort((a, b) => a.date.localeCompare(b.date)); // Sort by date
  
  if (puzzles.length === 0) {
    console.log('No puzzle files found in public folder.');
    console.log('Expected format: MM.DD.YYYY_answer.png (e.g., 12.25.2025_apple.png)');
    return;
  }
  
  console.log(`Found ${puzzles.length} puzzle file(s):\n`);
  
  for (const puzzle of puzzles) {
    console.log(`  ${puzzle.date}: "${puzzle.answer}" -> ${puzzle.image_url}`);
  }
  
  console.log('\nSeeding puzzles into database...\n');
  
  for (const puzzle of puzzles) {
    const { data, error } = await supabase
      .from('puzzles')
      .upsert({
        date: puzzle.date,
        image_url: puzzle.image_url,
        answer: puzzle.answer,
      }, {
        onConflict: 'date',
      })
      .select();

    if (error) {
      console.error(`✗ Error for ${puzzle.date}:`, error.message);
    } else {
      console.log(`✓ Added/Updated puzzle for ${puzzle.date}: "${puzzle.answer}"`);
    }
  }

  console.log('\nDone!');
}

seedPuzzles().catch(console.error);
