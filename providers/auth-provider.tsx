import { useRouter, useSegments } from 'expo-router';
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Session } from '@supabase/supabase-js';

import { ensureUserBootstrap } from '@/lib/billing';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      // Fallback manual para web: si hay tokens en el hash, fijar sesión y limpiar URL.
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        const params = new URLSearchParams(window.location.hash.replace('#', ''));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          try {
            await supabase.auth.setSession({ access_token, refresh_token });
            window.history.replaceState(null, '', window.location.pathname);
          } catch (err) {
            console.warn('setSession from hash error', err);
          }
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error) console.warn('getSession error', error.message);
      setSession(data.session ?? null);
      setLoading(false);
    };
    init();

    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    ensureUserBootstrap(session);
  }, [session]);

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  };

  const value = useMemo(() => ({ session, loading, signOut }), [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthGate({ children }: PropsWithChildren) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthRoute = segments[0] === 'login';
    if (session && inAuthRoute) {
      router.replace('/');
    }
    if (!session && !inAuthRoute) {
      router.replace('/login');
    }
  }, [session, segments, loading, router]);

  if (loading) {
    return (
      <ThemedView style={styles.loadingScreen} lightColor="#050915" darkColor="#050915">
        <ActivityIndicator size="large" color="#0E8BFF" />
        <ThemedText style={styles.loadingText}>Validando sesión…</ThemedText>
      </ThemedView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#E5E7EB',
    fontWeight: '700',
  },
});
