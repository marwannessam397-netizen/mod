import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('بيانات Supabase ناقصة. ضيف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في إعدادات Vercel.');
  }
  return supabase;
}
