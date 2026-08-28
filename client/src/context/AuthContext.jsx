import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, assertSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profile_with_role')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProfile(null); return null; }
    const data = await loadProfile(user.id);
    setProfile(data);
    return data;
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session: storedSession } }) => {
      if (!active) return;
      let current = storedSession;
      const mode = localStorage.getItem('school-emr-session-mode');
      if (current && mode === 'session' && !sessionStorage.getItem('school-emr-session-active')) {
        await supabase.auth.signOut({ scope: 'local' });
        current = null;
      }
      setSession(current);
      if (current?.user) {
        try {
          const loaded = await loadProfile(current.user.id);
          if (!loaded || loaded.status !== 'ACTIVE') {
            await supabase.auth.signOut({ scope: 'local' });
            setSession(null);
            setProfile(null);
          } else setProfile(loaded);
        } catch (error) { console.error('Profile load failed', error); }
      }
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        try { setProfile(await loadProfile(nextSession.user.id)); }
        catch { setProfile(null); }
      } else setProfile(null);
      setLoading(false);
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  const signIn = async (login, password) => {
    assertSupabaseConfigured();
    const identifier = login.trim();
    if (identifier.includes('@')) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: identifier, password });
      if (error) throw error;
      const loginAudit = await supabase.rpc('record_login');
      if (loginAudit.error) {
        await supabase.auth.signOut({ scope: 'local' });
        throw loginAudit.error;
      }
      return data;
    }
    const { data, error } = await supabase.functions.invoke('username-login', { body: { username: identifier, password } });
    if (error) throw new Error(error.message || 'Unable to sign in.');
    if (!data?.access_token || !data?.refresh_token) throw new Error(data?.message || 'Invalid username or password.');
    const result = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    if (result.error) throw result.error;
    return result.data;
  };

  const signOut = async (scope = 'local') => {
    await supabase.rpc('record_logout');
    const { error } = await supabase.auth.signOut({ scope });
    if (error) throw error;
  };

  const hasPermission = useCallback(code => {
    if (!code) return true;
    if (profile?.role_code === 'SUPER_ADMIN') return true;
    return Array.isArray(profile?.permissions) && profile.permissions.includes(code);
  }, [profile]);

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    profile,
    loading,
    signIn,
    signOut,
    refreshProfile,
    hasPermission,
    isSuperAdmin: profile?.role_code === 'SUPER_ADMIN'
  }), [session, profile, loading, refreshProfile, hasPermission]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
