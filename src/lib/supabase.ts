import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your_supabase_project_url') {
  console.error('Missing or invalid Supabase environment variables. Please check your .env file.');
}

export const supabase = supabaseUrl && supabaseAnonKey && supabaseUrl !== 'your_supabase_project_url'
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any; // Will show error in UI instead

