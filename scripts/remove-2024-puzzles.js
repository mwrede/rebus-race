// Script to remove 2024 puzzles
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env file manually
const envFile = readFileSync('.env', 'utf-8');
const supabaseUrl = envFile.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const supabaseAnonKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function remove2024Puzzles() {
  console.log('Removing 2024 puzzles...\n');

  try {
    // Delete all puzzles from 2024
    const { data, error } = await supabase
      .from('puzzles')
      .delete()
      .lt('date', '2025-01-01')
      .gte('date', '2024-01-01')
      .select();

    if (error) {
      console.error('Error removing puzzles:', error);
    } else {
      console.log(`✓ Removed ${data?.length || 0} puzzles from 2024`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

remove2024Puzzles().catch(console.error);

