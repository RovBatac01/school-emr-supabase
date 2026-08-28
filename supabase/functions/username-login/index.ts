import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, getClientIp, json, sha256 } from '../_shared/http.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { success: false, message: 'Method not allowed.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) return json(req, { success: false, message: 'Login service is not configured.' }, 500);
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[a-z0-9._-]{3,80}$/.test(username) || password.length < 1 || password.length > 200) {
      return json(req, { success: false, message: 'Invalid username or password.' }, 401);
    }

    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const clientIp = getClientIp(req);
    const identifierHash = await sha256(`school-emr:${username}`);
    const ipHash = await sha256(`school-emr:${clientIp}`);
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await service.from('login_attempts').select('*', { count: 'exact', head: true })
      .eq('identifier_hash', identifierHash).eq('successful', false).gte('attempted_at', since);
    if ((count || 0) >= 8) return json(req, { success: false, message: 'Too many failed attempts. Try again later.' }, 429);

    const { data: profile } = await service.from('profiles').select('id,email,status').ilike('username', username).maybeSingle();
    if (!profile || profile.status !== 'ACTIVE') {
      await service.from('login_attempts').insert({ identifier_hash: identifierHash, ip_hash: ipHash, successful: false });
      return json(req, { success: false, message: 'Invalid username or password.' }, 401);
    }

    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await authClient.auth.signInWithPassword({ email: profile.email, password });
    const successful = !error && !!data.session;
    await service.from('login_attempts').insert({ identifier_hash: identifierHash, ip_hash: ipHash, successful });
    if (!successful || !data.session || !data.user) return json(req, { success: false, message: 'Invalid username or password.' }, 401);

    await service.from('profiles').update({ last_login_at: new Date().toISOString(), last_login_ip: clientIp === 'unknown' ? null : clientIp }).eq('id', data.user.id);
    await service.from('activity_logs').insert({ user_id: data.user.id, action: 'LOGIN', description: 'Signed in to School Clinic EMR using username', entity_type: 'profiles', entity_id: data.user.id, ip_address: clientIp === 'unknown' ? null : clientIp, user_agent: req.headers.get('user-agent')?.slice(0, 500) || null });

    return json(req, {
      success: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type
    });
  } catch (error) {
    console.error(error);
    return json(req, { success: false, message: 'Invalid username or password.' }, 401);
  }
});
