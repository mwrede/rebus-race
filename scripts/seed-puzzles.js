// Simple script to seed puzzles into Supabase
// Run with: node scripts/seed-puzzles.js
// Make sure your .env file is configured

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env file manually (simple approach)
const envFile = readFileSync('.env', 'utf-8');
const supabaseUrl = envFile.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const supabaseAnonKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const puzzles = [
  {
    date: '2025-12-04',
    image_url: '/gracias.png',
    answer: 'gracias',
  },
  {
    date: '2025-12-05',
    image_url: '/hamilton.png',
    answer: 'hamilton',
  },
  {
    date: '2025-12-06',
    image_url: '/mike and ike.png',
    answer: 'mike and ike',
  },
];

async function seedPuzzles() {
  console.log('Seeding puzzles...\n');

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
      console.log(`✓ Added puzzle for ${puzzle.date}: "${puzzle.answer}"`);
    }
  }

  console.log('\nDone!');
}

seedPuzzles().catch(console.error);

