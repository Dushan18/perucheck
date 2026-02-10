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
} from 'react-native';

import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { maybeCompleteAuthSession, openAuthSessionAsync } from 'expo-web-browser';
import { Fonts } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
//
import { useWindowDimensions } from 'react-native';


maybeCompleteAuthSession();

const palette = {
  bg: '#F8FAFC',          // fondo general
  card: '#FFFFFF',       // cards principales
  card2: '#F1F5F9',      // cards secundarias
  border: '#E5E7EB',     // bordes suaves
  text: '#0F172A',       // texto principal
  subtext: '#475569',    // texto secundario
  muted: '#64748B',
  primary: '#2563EB',    // azul principal
  accent: '#0D9488',     // verde confianza
  danger: '#DC2626',
};

const getRedirectTo = () => {
  if (Platform.OS === 'web') return Linking.createURL('/');
  const slug = Constants.expoConfig?.slug ?? 'phunter';
  const owner = Constants.expoConfig?.owner ?? Constants.easConfig?.projectOwner ?? 'anonymous';
  if (Constants.appOwnership === 'expo') return `https://auth.expo.io/@${owner}/${slug}`;
  return Linking.createURL('/');
};

const getProxyStartUrl = (authUrl: string, returnUrl: string) => {
  if (Platform.OS === 'web' || Constants.appOwnership !== 'expo') return authUrl;
  const slug = Constants.expoConfig?.slug ?? 'phunter';
  const owner = Constants.expoConfig?.owner ?? Constants.easConfig?.projectOwner ?? 'anonymous';
  const projectFullName = Constants.expoConfig?.originalFullName ?? `@${owner}/${slug}`;
  const params = new URLSearchParams({ authUrl, returnUrl });
  return `https://auth.expo.io/${projectFullName}/start?${params.toString()}`;
};

export default function LoginScreen() {

  const { width } = useWindowDimensions();
  const isSmall = width < 360;      // celulares pequeños
  const isLarge = width >= 420;     // celulares grandes
  
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
      const refresh_token = url.searchParams.get('refresh_token') ?? hashParams.get('refresh_token');

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          {/* HERO */}
          <View style={styles.hero}>
            {/* LOGO + MARCA EN LA MISMA FILA */}
            <View style={styles.brandRow}>
              <Image source={require('../assets/images/logo_PeruCheck.png')} style={styles.logoInline} />
              <ThemedText style={styles.brandTitleInline}>
                PERUCHECK
              </ThemedText>
            </View>

            {/* TÍTULO PRINCIPAL */}
            <ThemedText style={styles.title}>
              Entra y consulta{'\n'}al instante
            </ThemedText>

            <ThemedText style={styles.subtitle}>
              Crea tu cuenta con Google, recibe tus consultas de cortesía y lleva el historial en un solo lugar.
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

                <Pressable
                  onPress={signInWithGoogle}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                    loading && { opacity: 0.85 },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <View style={styles.googleButtonInner}>
                      <View style={styles.iconSlot}>
                        <Image
                          source={require('../assets/images/logo_google.png')}
                          style={styles.googleIcon}
                        />
                      </View>

                      <ThemedText style={styles.primaryButtonText}>
                        Continuar con Google
                      </ThemedText>

                      <View style={styles.iconSlot} />
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

          {/* BOTTOM CHIPS */}
          <View style={styles.badgeRowBottom}>
            <BottomChip label="Sin compartir tu correo" tone={palette.primary} />
            <BottomChip label="Puedes cerrar sesión cuando quieras" tone={palette.accent} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}


function BottomChip({ label, tone }: { label: string; tone: string }) {
  return (
    <View style={[styles.bottomChip, { borderColor: tone }]}>
      <ThemedText style={[styles.bottomChipText, { color: tone }]}>{label}</ThemedText>
    </View>
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
  content: {
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 28,
    gap: 18,
  },

  hero: {
    alignItems: 'center',
    paddingTop: 12,
    gap: 10,
  },

  brand: {
    color: palette.accent,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  title: {
    color: palette.text,
    fontFamily: Fonts.rounded,
    fontSize: 34,
    lineHeight: 40,
    textAlign: 'center',
  },

  subtitle: {
    color: palette.subtext,
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 360,
    marginTop: 2,
  },

  card: {
    backgroundColor: palette.card,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: palette.border,

    // SOMBRA
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },

  cardTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '800',
  },

  cardSubtitle: {
    color: palette.subtext,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
    marginBottom: 6,
    maxWidth: 340,
  },

  primaryButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  primaryButtonPressed: {
    backgroundColor: '#1D4ED8', // azul más oscuro
    transform: [{ scale: 0.98 }],
  },

  primaryButtonText: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  errorText: {
    color: palette.danger,
    fontWeight: '800',
    marginTop: 6,
  },

  cardInfo: {
    backgroundColor: palette.card2,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: palette.border,
    // SOMBRA
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },

  infoTitle: {
    color: palette.text,
    fontWeight: '800',
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
    borderColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  checkMark: {
    color: palette.accent,
    fontWeight: '900',
    marginTop: -1,
  },

  infoText: {
    color: palette.subtext,
    fontSize: 14,
  },

  badgeRowBottom: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    marginTop: 6,
  },

  bottomChip: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },


  bottomChipText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  logo: {
    width: 64,
    height: 64,
    marginBottom: 6,
  },

  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    color: palette.accent,
    marginBottom: 6,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },

  logoInline: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  brandTitleInline: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    color: palette.accent,
    marginTop: -1,
  },

  googleButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },

  iconSlot: {
    width: 40,        // mismo ancho a izquierda y derecha
    alignItems: 'center',
  },
  googleIcon: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
  },

});
