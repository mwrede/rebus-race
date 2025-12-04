import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Puzzle data
const puzzles = [
  {
    date: '2024-12-04',
    filename: 'gracias.png',
    answer: 'gracias',
  },
  {
    date: '2024-12-05',
    filename: 'hamilton.png',
    answer: 'hamilton',
  },
  {
    date: '2024-12-06',
    filename: 'mike and ike.png',
    answer: 'mike and ike',
  },
];

async function seedPuzzles() {
  console.log('Starting to seed puzzles...\n');

  for (const puzzle of puzzles) {
    // For local development, use relative path
    // In production, you'd upload to Supabase Storage or use a CDN
    const imageUrl = `/${puzzle.filename}`;

    const { data, error } = await supabase
      .from('puzzles')
      .upsert({
        date: puzzle.date,
        image_url: imageUrl,
        answer: puzzle.answer,
      }, {
        onConflict: 'date',
      })
      .select();

    if (error) {
      console.error(`Error inserting puzzle for ${puzzle.date}:`, error);
    } else {
      console.log(`✓ Added puzzle for ${puzzle.date}: ${puzzle.answer}`);
    }
  }

  console.log('\nDone seeding puzzles!');
}

seedPuzzles().catch(console.error);

