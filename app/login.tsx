import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Image,
  useWindowDimensions,
} from 'react-native';

import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { maybeCompleteAuthSession, openAuthSessionAsync } from 'expo-web-browser';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';

maybeCompleteAuthSession();

/** Paleta estilo captura */
const palette = {
  bg: '#F6F7FB',
  card: '#FFFFFF',
  card2: '#F3F4F6',
  border: '#E6E8EF',
  text: '#0B1220',
  subtext: '#6B7280',
  muted: '#94A3B8',
  primary: '#2563EB',
  accent: '#2563EB',
  danger: '#DC2626',
};

const getRedirectTo = () => {
  if (Platform.OS === 'web') return Linking.createURL('/');
  const slug = Constants.expoConfig?.slug ?? 'phunter';
  const owner =
    Constants.expoConfig?.owner ?? Constants.easConfig?.projectOwner ?? 'anonymous';
  if (Constants.appOwnership === 'expo') return `https://auth.expo.io/@${owner}/${slug}`;
  return Linking.createURL('/');
};

const getProxyStartUrl = (authUrl: string, returnUrl: string) => {
  if (Platform.OS === 'web' || Constants.appOwnership !== 'expo') return authUrl;
  const slug = Constants.expoConfig?.slug ?? 'phunter';
  const owner =
    Constants.expoConfig?.owner ?? Constants.easConfig?.projectOwner ?? 'anonymous';
  const projectFullName = Constants.expoConfig?.originalFullName ?? `@${owner}/${slug}`;
  const params = new URLSearchParams({ authUrl, returnUrl });
  return `https://auth.expo.io/${projectFullName}/start?${params.toString()}`;
};

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const isSmall = width < 360;  // teléfonos pequeños
  const isLarge = width >= 430; // teléfonos grandes / phablets

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    if (!supabase) {
      setError('Estamos configurando la conexión. Intenta en un momento.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const redirectTo = getRedirectTo();
      const { data, error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });

      if (googleError) {
        setError('No pudimos iniciar con Google. Revisa que el acceso esté permitido.');
        return;
      }
      if (!data?.url) {
        setError('No se pudo abrir Google, inténtalo de nuevo.');
        return;
      }

      const returnUrl = Linking.createURL('/');
      const authUrl = getProxyStartUrl(data.url, returnUrl);
      const result = await openAuthSessionAsync(authUrl, returnUrl);

      if (result.type !== 'success' || !result.url) {
        setError('Inicio cancelado o sin respuesta.');
        return;
      }

      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const hashParams = new URLSearchParams(url.hash.replace('#', ''));
      const access_token = url.searchParams.get('access_token') ?? hashParams.get('access_token');
      const refresh_token =
        url.searchParams.get('refresh_token') ?? hashParams.get('refresh_token');

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) setError('No se pudo completar la sesión.');
      } else if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessionError) setError('No se pudo completar la sesión.');
      } else {
        setError('No se pudo completar la sesión.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Error al iniciar sesión. Vuelve a intentar.');
    } finally {
      setLoading(false);
    }
  };

  const showMissingConfig = !hasSupabaseConfig;

  return (
    <ThemedView style={styles.screen} lightColor={palette.bg} darkColor={palette.bg}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            isSmall && { paddingHorizontal: 16, paddingTop: 18 },
            isLarge && { paddingHorizontal: 28, paddingTop: 26 },
          ]}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {/* HERO (como la captura) */}
          <View style={[styles.hero, isSmall && { gap: 10 }, isLarge && { gap: 14 }]}>
            <ThemedText
              style={[
                styles.brandTop,
                isSmall && { fontSize: 34, letterSpacing: 2.4 },
                isLarge && { fontSize: 44, letterSpacing: 3.2 },
              ]}
            >
              CIVICAR
            </ThemedText>

            <View
              style={[
                styles.logoCard,
                isSmall && { width: 76, height: 76, borderRadius: 20 },
                isLarge && { width: 108, height: 108, borderRadius: 28 },
              ]}
            >
              <Image
                source={require('../assets/images/logo_PeruCheck.png')}
                style={[
                  styles.logoHero,
                  isSmall && { width: 44, height: 44 },
                  isLarge && { width: 70, height: 70 },
                ]}
              />
            </View>

            <ThemedText
              style={[
                styles.title,
                isSmall && { fontSize: 24, lineHeight: 30 },
                isLarge && { fontSize: 34, lineHeight: 40 },
              ]}
            >
              Entra y consulta{'\n'}al instante
            </ThemedText>
          </View>

          {/* CARD GOOGLE */}
          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>Accede con Google</ThemedText>

            {showMissingConfig ? (
              <ThemedText style={styles.errorText}>
                Aún estamos configurando la conexión segura. Intenta más tarde o escribe a soporte.
              </ThemedText>
            ) : (
              <>
                <ThemedText style={styles.cardSubtitle}>
                  Mantendremos tu sesión iniciada y podrás cerrar sesión cuando quieras.
                </ThemedText>

                {/* Botón Google outline pill */}
                <Pressable
                  onPress={signInWithGoogle}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.googleBtn,
                    pressed && { backgroundColor: 'rgba(37,99,235,0.08)' },
                    loading && { opacity: 0.7 },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color={palette.primary} />
                  ) : (
                    <View style={styles.googleBtnInner}>
                      <Image
                        source={require('../assets/images/google-logo.png')}
                        style={styles.googleIcon}
                      />
                      <ThemedText style={styles.googleBtnText}>Continuar con Google</ThemedText>
                    </View>
                  )}
                </Pressable>
              </>
            )}

            {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
          </View>

          {/* INFO CARD */}
          <View style={styles.cardInfo}>
            <ThemedText style={styles.infoTitle}>Lo que verás al entrar</ThemedText>

            <InfoRow text="Panel con tus consultas y resultados" />
            <InfoRow text="Créditos de bienvenida listos para usar" />
            <InfoRow text="Historial y descargas en tu perfil" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function InfoRow({ text }: { text: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.checkCircle}>
        <ThemedText style={styles.checkMark}>✓</ThemedText>
      </View>
      <ThemedText style={styles.infoText}>{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // ✅ responsive real: centrado + ancho máximo en pantallas grandes (tablets)
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 22,
    paddingTop: 50,
    paddingBottom: 28,
    gap: 18,
  },

  hero: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },

  brandTop: {
    fontSize: 45,
    fontWeight: '900',
    letterSpacing: 2,
    color: palette.primary,
    lineHeight: 32,         // 👈 clave
    includeFontPadding: true, // 👈 importante en Android
  },

  logoCard: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,

    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },

  logoHero: {
    width: 70,
    height: 70,
    resizeMode: 'contain',
  },

  title: {
    color: palette.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 4,
  },

  subtitle: {
    color: palette.subtext,
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 340,
  },

  card: {
    backgroundColor: palette.card,
    borderRadius: 18,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: palette.border,

    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },

  cardTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '900',
  },

  cardSubtitle: {
    color: palette.subtext,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },

  googleBtn: {
    height: 54,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    overflow: 'hidden',
  },

  googleBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  googleIcon: {
    width: 25,
    height: 25,
    resizeMode: 'contain',
  },

  googleBtnText: {
    color: palette.primary,
    fontWeight: '900',
    fontSize: 16,
  },

  errorText: {
    color: palette.danger,
    fontWeight: '800',
    marginTop: 8,
  },

  cardInfo: {
    backgroundColor: palette.card2,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: palette.border,

    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },

  infoTitle: {
    color: palette.text,
    fontWeight: '900',
    fontSize: 18,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  checkMark: {
    color: palette.primary,
    fontWeight: '900',
    marginTop: -1,
  },

  infoText: {
    color: palette.subtext,
    fontSize: 14,
  },
});
