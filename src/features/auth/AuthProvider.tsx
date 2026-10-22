import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getMyProfile } from '@/lib/api';
import type { Profile } from '@/types/db';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** true once the profile for the current session has been fetched */
  profileReady: boolean;
  isAuthorized: boolean;
  isAdmin: boolean;
  recovery: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** call when an API call reports an expired session */
  handleExpired: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const manualSignOut = useRef(false);
  const hadSession = useRef(false);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setProfileFor(null); return; }
    try {
      setProfile(await getMyProfile(s.user.id));
    } catch {
      setProfile(null);
    } finally {
      setProfileFor(s.user.id);
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      hadSession.current = Boolean(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') {
        if (hadSession.current && !manualSignOut.current) {
          toast.warning('Your session has ended. Please sign in again.');
        }
        manualSignOut.current = false;
        setRecovery(false);
      }
      hadSession.current = Boolean(s);
      setSession(s);
      // Defer DB calls out of the auth callback (avoids a supabase-js deadlock).
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        setTimeout(() => { void loadProfile(s); }, 0);
      }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    manualSignOut.current = true;
    await supabase.auth.signOut();
  }, []);

  const handleExpired = useCallback(() => {
    void supabase.auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo<AuthState>(() => ({
    session,
    profile,
    loading,
    profileReady: !session || profileFor === session.user.id,
    recovery,
    isAuthorized: profile?.role === 'admin' || profile?.role === 'staff',
    isAdmin: profile?.role === 'admin',
    signOut,
    refreshProfile: () => loadProfile(session),
    handleExpired,
  }), [session, profile, profileFor, loading, recovery, signOut, loadProfile, handleExpired]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
