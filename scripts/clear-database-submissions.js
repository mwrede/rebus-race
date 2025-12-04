// Script to clear all submissions from the database
// This will delete ALL submissions but keep puzzles
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

async function clearSubmissions() {
  console.log('Clearing all submissions from database...\n');

  try {
    // Delete all submissions
    const { data, error } = await supabase
      .from('submissions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (this condition is always true)
      .select();

    if (error) {
      console.error('Error clearing submissions:', error);
    } else {
      console.log(`✓ Cleared ${data?.length || 0} submissions from database`);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

clearSubmissions().catch(console.error);

