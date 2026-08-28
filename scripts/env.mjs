import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

export function environment() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env file. Never put the service-role key in client/.env.');
  }
  return {
    url,
    anonKey,
    serviceKey,
    demoPassword: process.env.DEMO_PASSWORD || 'Demo@12345',
    client: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  };
}

export function fail(message, error) {
  console.error(`\nERROR: ${message}`);
  if (error?.message) console.error(error.message);
  process.exit(1);
}
