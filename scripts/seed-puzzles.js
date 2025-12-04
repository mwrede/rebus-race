// Script to seed puzzles from public folder
// Puzzle files should be named: answer_MM.DD.YYYY.png
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

// Function to parse filename: answer_MM.DD.YYYY.png
function parsePuzzleFilename(filename) {
  // Remove .png extension
  const nameWithoutExt = filename.replace(/\.png$/i, '');
  
  // Split by last underscore to separate answer from date
  const lastUnderscoreIndex = nameWithoutExt.lastIndexOf('_');
  if (lastUnderscoreIndex === -1) {
    return null;
  }
  
  const answer = nameWithoutExt.substring(0, lastUnderscoreIndex);
  const dateStr = nameWithoutExt.substring(lastUnderscoreIndex + 1);
  
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
  const puzzles = files
    .filter(file => file.toLowerCase().endsWith('.png'))
    .map(file => parsePuzzleFilename(file))
    .filter(puzzle => puzzle !== null)
    .sort((a, b) => a.date.localeCompare(b.date)); // Sort by date
  
  if (puzzles.length === 0) {
    console.log('No puzzle files found in public folder.');
    console.log('Expected format: answer_MM.DD.YYYY.png (e.g., apple_12.25.2025.png)');
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
