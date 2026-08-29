import { createClient, SupabaseClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';

export let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    console.log('[Supabase Client] Initialized successfully.');
  } catch (err) {
    console.warn('[Supabase Client] Failed to initialize:', err);
    supabase = null;
  }
} else {
  console.log('[Supabase Client] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set. Using SSE real-time sync.');
}
