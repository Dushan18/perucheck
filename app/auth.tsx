import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [message, setMessage] = useState('Completando inicio de sesión...');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!supabase) {
        setMessage('Supabase no configurado.');
        return;
      }

      const code = typeof params.code === 'string' ? params.code : '';
      const accessToken =
        typeof params.access_token === 'string' ? params.access_token : '';
      const refreshToken =
        typeof params.refresh_token === 'string' ? params.refresh_token : '';

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }
      } catch (error: any) {
        if (!cancelled) {
          setMessage(error?.message ?? 'No se pudo completar la sesión.');
          setTimeout(() => router.replace('/login'), 1500);
        }
        return;
      }

      if (!cancelled) {
        router.replace('/');
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [params.code, params.access_token, params.refresh_token, router]);

  return (
    <ThemedView style={styles.container} lightColor="#050915" darkColor="#050915">
      <ActivityIndicator size="large" color="#0E8BFF" />
      <ThemedText style={styles.text}>{message}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    color: '#E5E7EB',
    fontWeight: '700',
    textAlign: 'center',
  },
});
