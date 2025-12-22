import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import * as Linking from 'expo-linking';

import { Fonts } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';

const palette = {
  primary: '#0E8BFF',
  accent: '#0CD3A2',
  danger: '#F05941',
  surface: '#0A1024',
  surfaceAlt: '#0E1530',
  muted: '#1F2937',
};

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    if (!supabase) {
      setError('Estamos configurando la conexión. Intenta en un momento.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const redirectTo = Linking.createURL('/');
      const { data, error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (googleError) {
        setError('No pudimos iniciar con Google. Revisa que el acceso esté permitido.');
      } else if (!data?.url) {
        setError('No se pudo abrir Google, inténtalo de nuevo.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Error al iniciar sesión. Vuelve a intentar.');
    } finally {
      setLoading(false);
    }
  };

  const showMissingConfig = !hasSupabaseConfig;

  return (
    <ThemedView style={styles.screen} lightColor="#040915" darkColor="#040915">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <View style={styles.hero}>
            <ThemedText style={styles.overline}>PeruCheck</ThemedText>
            <ThemedText type="title" style={styles.title}>
              Entra y consulta al instante
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Crea tu cuenta con Google, recibe tus consultas de cortesía y lleva el historial en un
              solo lugar.
            </ThemedText>
            <View style={styles.heroBadges}>
              <Badge label="Seguro con Supabase" tone={palette.accent} />
              <Badge label="Sesión guardada" tone={palette.primary} />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText style={styles.cardTitle}>Accede con Google</ThemedText>
              <Badge label="1 clic" tone={palette.accent} />
            </View>

            {showMissingConfig ? (
              <ThemedText style={styles.errorText}>
                Aún estamos configurando la conexión segura. Intenta más tarde o escribe a soporte.
              </ThemedText>
            ) : (
              <>
                <ThemedText style={styles.subtitle}>
                  Mantendremos tu sesión iniciada y podrás cerrar sesión cuando quieras.
                </ThemedText>
                <Pressable style={styles.primaryButton} onPress={signInWithGoogle} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText style={styles.primaryButtonText}>Continuar con Google</ThemedText>
                  )}
                </Pressable>
              </>
            )}

            {message && <ThemedText style={styles.message}>{message}</ThemedText>}
            {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
          </View>

          <View style={styles.helperCard}>
            <ThemedText style={styles.helperTitle}>Lo que verás al entrar</ThemedText>
            <ThemedText style={styles.helperItem}>• Panel con tus consultas y resultados</ThemedText>
            <ThemedText style={styles.helperItem}>• Créditos de bienvenida listos para usar</ThemedText>
            <ThemedText style={styles.helperItem}>• Historial y descargas en tu perfil</ThemedText>
            <View style={styles.helperInline}>
              <Badge label="Sin compartir tu correo" tone={palette.primary} />
              <Badge label="Puedes cerrar sesión cuando quieras" tone={palette.accent} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${tone}20`, borderColor: tone }]}>
      <ThemedText style={[styles.badgeText, { color: tone }]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 18,
  },
  hero: {
    gap: 10,
    padding: 18,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: '#162042',
  },
  heroBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  header: {
    gap: 8,
  },
  overline: {
    color: palette.accent,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: Fonts.rounded,
  },
  title: {
    color: '#F8FAFC',
    fontFamily: Fonts.rounded,
  },
  subtitle: {
    color: '#CBD5E1',
    maxWidth: 360,
  },
  card: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#162042',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  primaryButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  message: {
    color: palette.accent,
    fontWeight: '700',
  },
  errorText: {
    color: palette.danger,
    fontWeight: '700',
  },
  helperCard: {
    backgroundColor: '#0F162A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#162042',
    gap: 6,
  },
  helperTitle: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  helperItem: {
    color: '#CBD5E1',
  },
  helperInline: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: palette.surfaceAlt,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
