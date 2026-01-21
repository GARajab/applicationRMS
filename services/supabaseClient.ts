import { createClient } from '@supabase/supabase-js';

// Safe access to process.env to prevent "process is not defined" crashes in browser
const getEnvVar = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return '';
};

const supabaseUrl = getEnvVar('SUPABASE_URL') || 'https://nqlhzmqepkgevqbchlqj.supabase.co';
const supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xbGh6bXFlcGtnZXZxYmNobHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5Njc4NjgsImV4cCI6MjA4NDU0Mzg2OH0.WDkLtj3eJX_RgeJAisltWQsWEJV55kmnL6vV8ciDYuE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);