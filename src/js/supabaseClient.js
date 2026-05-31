/**
 * DutchIT – Supabase client singleton
 */
import { createClient } from '@supabase/supabase-js';
import { config, isSupabaseConfigured } from './config.js';

let client = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
  }
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
  return client;
}
