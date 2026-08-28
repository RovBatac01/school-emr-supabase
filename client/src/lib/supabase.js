import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy client/.env.example to client/.env.');
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  global: {
    headers: { 'x-application-name': 'school-clinic-emr' }
  }
});

export const assertSupabaseConfigured = () => {
  if (!url || !anonKey) throw new Error('Supabase is not configured. Add the project URL and anon key to client/.env.');
};
