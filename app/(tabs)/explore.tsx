import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { changePlan, getPlans, getUsageSnapshot, type PlanOption, type UsageSnapshot } from '@/lib/billing';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useRouter } from 'expo-router';

const palette = {
  surface: '#FFFFFF',
  surfaceAlt: '#F3F6FB',
  border: '#cfc9c9',
  text: '#0B1220',
  subtext: '#5B6B84',
  muted: '#6B7C93',
  primary: '#1D4ED8',
  primarySoft: '#EAF1FF',
  accent: '#16A34A',
  danger: '#DC2626',
};

const formatExpiry = (iso?: string | null) => {
  if (!iso) return 'Sin vencimiento';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Sin vencimiento' : d.toLocaleDateString();
};


export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const contentMax = Math.min(720, width - 32);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);
  const [supabaseMissing, setSupabaseMissing] = useState(false);
  const [noSession, setNoSession] = useState(false);

  const userName =
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    session?.user?.email ||
    'Tu cuenta';

  const load = async () => {
    if (!supabase || !session?.user?.id) {
      setSupabaseMissing(!supabase);
      setNoSession(!session?.user?.id);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [usageSnapshot, planOptions] = await Promise.all([
      getUsageSnapshot(session.user.id),
      getPlans(),
    ]);
    setUsage(usageSnapshot);
    setPlans(planOptions);
    setSupabaseMissing(false);
    setNoSession(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [session?.user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [session?.user?.id])
  );

  const planName = usage?.plan?.name ?? 'Free';
  const creditText =
    usage?.creditsRemaining != null
      ? `${usage.creditsRemaining} restantes`
      : 'Créditos ilimitados';

  const mappedPlans = useMemo(() => {
    const currentPlanId = usage?.plan?.id;
    const currentPlan = plans.find((p) => p.id === currentPlanId) ?? plans[0];
    if (!currentPlan) return [];
    return [
      {
        ...currentPlan,
        tag:
          currentPlan.id === 'free'
            ? 'Incluido'
            : currentPlan.id === 'pro'
              ? 'Recomendado'
              : 'A medida',
        subtitle: `${currentPlan.total_consultas ?? '∞'} consultas · ${
          currentPlan.duration_days ? `${currentPlan.duration_days} días` : 'Sin vencimiento'
        }`,
        priceLabel:
          currentPlan.price_pen && Number(currentPlan.price_pen) > 0
            ? `S/ ${Number(currentPlan.price_pen).toFixed(2)}`
            : 'Gratis',
      },
    ];
  }, [plans, usage?.plan?.id]);

  const onSelectPlan = async (planId: string) => {
    if (!session?.user?.id) return;
    setUpdatingPlan(planId);
    try {
      await changePlan(session.user.id, planId);
      const snapshot = await getUsageSnapshot(session.user.id);
      setUsage(snapshot);
    } finally {
      setUpdatingPlan(null);
    }
  };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: palette.surface, dark: palette.surface }}
      headerHeight={100}
      
      headerImage={
        <View style={[styles.headerHero, { maxWidth: contentMax }]}>
          <ThemedText style={styles.heroOverline}>Perfil</ThemedText>
          <View style={styles.headerTitleRow}>
            <ThemedText type="title" style={styles.headerTitle}>
              Tu perfil y plan
            </ThemedText>
            <View style={styles.headerBadge}>
              <MaterialIcons name="verified-user" size={24} color={palette.accent} />
            </View>
          </View>
        </View>
      }>
      <View style={[styles.contentWrap, { maxWidth: contentMax }]}>
        <ThemedView style={styles.card}>
        <View style={styles.rowBetween}>
          <View>
            <ThemedText style={styles.userName}>{userName}</ThemedText>
            <ThemedText style={styles.muted}>{session?.user?.email}</ThemedText>
          </View>
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>{planName}</ThemedText>
          </View>
        </View>
        {supabaseMissing ? (
          <ThemedText style={styles.errorText}>
            Configura tus variables de Supabase para ver tu perfil e historial.
          </ThemedText>
        ) : (
          <>
            {noSession ? (
              <ThemedText style={styles.errorText}>
                No hay sesión activa. Inicia sesión para ver tu perfil.
              </ThemedText>
            ) : (
              <>
                <View style={styles.statsRow}>
                  <Stat label="Créditos" value={creditText} />
                  <Stat label="Usadas" value={usage?.creditsUsed ?? 0} />
                  <Stat
                    label="Vence"
                    value={usage?.validUntil ? formatExpiry(usage.validUntil) : '—'}
                  />
                </View>
                <Pressable style={styles.signOut} onPress={signOut}>
                  <MaterialIcons name="logout" size={18} color="#fff" />
                  <ThemedText style={styles.signOutText}>Cerrar sesión</ThemedText>
                </Pressable>
              </>
            )}
          </>
        )}
        </ThemedView>

        <ThemedView style={styles.card}>
        <View style={styles.rowBetween}>
          <ThemedText style={styles.sectionTitle}>Plan Actual</ThemedText>
        </View>
        {loading ? (
          <ActivityIndicator color={palette.primary} />
        ) : supabaseMissing ? (
          <ThemedText style={styles.errorText}>Sin conexión a Supabase.</ThemedText>
        ) : (
          <View style={styles.planList}>
            {mappedPlans.map((plan) => (
              <Pressable
                key={plan.id}
                style={[
                  styles.planCard,
                  usage?.plan?.id === plan.id && { borderColor: palette.accent },
                ]}
                onPress={() => router.push('/(tabs)/plans')}>
                <View style={styles.rowBetween}>
                  <ThemedText style={styles.planName}>{plan.name}</ThemedText>
                  <View style={styles.tinyBadge}>
                    <ThemedText style={styles.tinyBadgeText}>{plan.tag}</ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.planSubtitle}>{plan.subtitle}</ThemedText>
                <ThemedText style={styles.planPrice}>{plan.priceLabel}</ThemedText>
                <ThemedText style={styles.planAction}>Cambio de plan</ThemedText>
              </Pressable>
            ))}
          </View>
        )}
        </ThemedView>
      </View>
    </ParallaxScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statBox}>
      <ThemedText style={styles.muted}>{label}</ThemedText>
      <ThemedText style={styles.statValue}>{String(value)}</ThemedText>
    </View>
  );
}


const styles = StyleSheet.create({
  headerHero: {
    flex: 1,
    padding: 32,
    gap: 10,
    width: '100%',
    alignSelf: 'center',
  },
  contentWrap: {
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerBadge: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroOverline: {
      color: palette.accent,
      fontSize: 14,
      letterSpacing: 1,
      textTransform: 'uppercase',
      fontFamily: Fonts.rounded,
    },
  headerTitle: {
    fontFamily: Fonts.rounded,
    color: palette.text,
    maxWidth: 320,
  },
  headerSubtitle: {
    color: palette.subtext,
    maxWidth: 360,
  },
  card: {
    borderRadius: 18,
    padding: 18,
    gap: 12,
    backgroundColor: palette.surface,
    borderWidth: 2,
    borderColor: palette.border,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  muted: {
    color: palette.subtext,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.primary,
    backgroundColor: `${palette.primary}1A`,
  },
  badgeText: {
    color: palette.primary,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'column',
    gap: 10,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceAlt,
    gap: 4,
  },
  statValue: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 16,
  },
  signOut: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: palette.primary,
  },
  signOutText: {
    color: '#fff',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  planList: {
    gap: 10,
  },
  planCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceAlt,
    gap: 6,
  },
  planName: {
    color: palette.text,
    fontWeight: '700',
  },
  tinyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.primary,
    backgroundColor: `${palette.primary}1A`,
  },
  tinyBadgeText: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  planSubtitle: {
    color: palette.subtext,
  },
  planPrice: {
    color: palette.text,
    fontWeight: '700',
  },
  planAction: {
    color: palette.accent,
    fontWeight: '700',
  },
  errorText: {
    color: palette.danger,
    fontWeight: '700',
  },
});






