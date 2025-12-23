import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import * as Linking from 'expo-linking';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';

const palette = {
  primary: '#0E8BFF',
  accent: '#0CD3A2',
  danger: '#F05941',
  surface: '#0B1021',
  muted: '#1F2937',
};

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'enter-phone' | 'enter-code'>('enter-phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendOtp = async () => {
    if (!supabase) {
      setError('Configura tus variables de Supabase antes de continuar.');
      return;
    }
    const phoneClean = phone.trim();
    if (!phoneClean) {
      setError('Ingresa tu número con +51.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone: phoneClean });
      if (otpError) {
        setError(otpError.message);
        return;
      }
      setStage('enter-code');
      setMessage('Código enviado. Revisa tu SMS.');
      setCooldown(30);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo enviar el código.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!supabase) {
      setError('Configura tus variables de Supabase antes de continuar.');
      return;
    }
    const phoneClean = phone.trim();
    const codeClean = code.trim();
    if (!phoneClean || codeClean.length < 4) {
      setError('Ingresa el código completo.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: phoneClean,
        token: codeClean,
        type: 'sms',
      });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      setMessage('Código validado, iniciando sesión…');
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo validar el código.');
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => {
    setStage('enter-phone');
    setCode('');
    setMessage(null);
    setError(null);
    setCooldown(0);
  };

  const signInWithGoogle = async () => {
    if (!supabase) {
      setError('Configura tus variables de Supabase antes de continuar.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const redirectTo = Linking.createURL('/');
      const { data, error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (googleError) {
        setError(googleError.message);
      } else if (!data?.url) {
        setError('No se pudo iniciar sesión con Google.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Error al iniciar sesión con Google.');
    } finally {
      setLoading(false);
    }
  };

  const showMissingConfig = !hasSupabaseConfig;
  const maskedPhone =
    phone.trim().length > 4
      ? `${phone.trim().slice(0, 4)} **** ${phone.trim().slice(-2)}`
      : phone.trim();

  return (
    <ThemedView style={styles.screen} lightColor="#050915" darkColor="#050915">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <View style={styles.header}>
            <ThemedText style={styles.overline}>Autenticación segura</ThemedText>
            <ThemedText type="title" style={styles.title}>
              Ingresa con SMS
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Usa tu número celular para recibir un código de verificación. Sesiones se guardan
              usando Supabase Auth.
            </ThemedText>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <ThemedText style={styles.cardTitle}>
                {stage === 'enter-phone' ? 'Número de celular' : 'Código SMS'}
              </ThemedText>
              <ThemedText style={styles.cardHint}>Supabase Auth · Phone OTP</ThemedText>
            </View>

            {showMissingConfig ? (
              <ThemedText style={styles.errorText}>
                Agrega EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en tu entorno para
                activar el login.
              </ThemedText>
            ) : (
              <>
                {stage === 'enter-phone' ? (
                  <>
                    <ThemedText style={styles.label}>Teléfono (incluye +51)</ThemedText>
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+51 900 000 000"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="phone-pad"
                      style={styles.input}
                    />
                    <Pressable style={styles.primaryButton} onPress={sendOtp} disabled={loading}>
                      {loading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <ThemedText style={styles.primaryButtonText}>Enviar código</ThemedText>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <>
                    <ThemedText style={styles.label}>Código de 6 dígitos</ThemedText>
                    <View style={styles.codeRow}>
                      {Array.from({ length: 6 }).map((_, idx) => {
                        const char = code[idx] ?? '';
                        return (
                          <View key={idx} style={styles.codeBox}>
                            <ThemedText style={styles.codeText}>{char}</ThemedText>
                          </View>
                        );
                      })}
                    </View>
                    <TextInput
                      value={code}
                      onChangeText={setCode}
                      placeholder="000000"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      maxLength={6}
                      style={styles.hiddenInput}
                      autoFocus
                    />
                    <Pressable style={styles.primaryButton} onPress={verifyOtp} disabled={loading}>
                      {loading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <ThemedText style={styles.primaryButtonText}>Validar código</ThemedText>
                      )}
                    </Pressable>
                    <View style={styles.codeActions}>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={resetFlow}
                        disabled={loading}>
                        <ThemedText style={styles.secondaryText}>Cambiar número</ThemedText>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.secondaryButton,
                          cooldown > 0 && styles.secondaryButtonDisabled,
                        ]}
                        onPress={sendOtp}
                        disabled={loading || cooldown > 0}>
                        <ThemedText style={styles.secondaryText}>
                          {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
                        </ThemedText>
                      </Pressable>
                    </View>
                    {maskedPhone ? (
                      <ThemedText style={styles.helperItem}>
                        Código enviado a {maskedPhone}. Revísalo y escribe los 6 dígitos.
                      </ThemedText>
                    ) : null}
                  </>
                )}
              </>
            )}

            {message && <ThemedText style={styles.message}>{message}</ThemedText>}
            {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

            {!showMissingConfig && (
              <Pressable style={styles.googleButton} onPress={signInWithGoogle} disabled={loading}>
                <ThemedText style={styles.googleText}>Continuar con Google</ThemedText>
              </Pressable>
            )}
          </View>

          <View style={styles.helperCard}>
            <ThemedText style={styles.helperTitle}>Notas rápidas</ThemedText>
            <ThemedText style={styles.helperItem}>
              • Usa un número real; Supabase envía el código por SMS.
            </ThemedText>
            <ThemedText style={styles.helperItem}>
              • Las sesiones se guardan en AsyncStorage y se refrescan automáticamente.
            </ThemedText>
            <ThemedText style={styles.helperItem}>
              • Después de iniciar sesión, se redirige a la vista principal.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
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
    backgroundColor: palette.surface,
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
  cardHint: {
    color: '#94A3B8',
  },
  label: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
    backgroundColor: '#0F162A',
    color: '#E5E7EB',
    fontSize: 18,
    letterSpacing: 1.2,
    fontFamily: Fonts.rounded,
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
  secondaryButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryText: {
    color: '#E5E7EB',
    fontWeight: '700',
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
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  codeBox: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    backgroundColor: '#0F162A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeText: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButtonDisabled: {
    backgroundColor: palette.muted,
    opacity: 0.7,
  },
  googleButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  googleText: {
    color: '#0E8BFF',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
