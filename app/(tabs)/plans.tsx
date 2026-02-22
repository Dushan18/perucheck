import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { getPlans, changePlan, getUsageSnapshot, type PlanOption, type UsageSnapshot } from '@/lib/billing';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/lib/supabase';

const palette = {
  bg: '#F6F8FC',
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
  warning: '#F59E0B',
  gold: '#D9A441',
};

export default function PlansScreen() {
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const contentMax = Math.min(720, width - 32);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase || !session?.user?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [planOptions, snapshot] = await Promise.all([
        getPlans(),
        getUsageSnapshot(session.user.id),
      ]);
      setPlans(planOptions);
      setUsage(snapshot);
      setLoading(false);
    };
    fetchData();
  }, [session?.user?.id]);

  const mappedPlans = useMemo(() => {
    const currentPlanId = usage?.plan?.id;
    const mapped = plans.map((p) => {
      return {
        ...p,
        tag: p.id === 'free' ? 'Incluido' : p.id === 'pro' ? 'Recomendado' : 'A medida',
        subtitle: `${p.total_consultas ?? '∞'} consultas · ${
          p.duration_days ? `${p.duration_days} días` : 'Sin vencimiento'
        }`,
        priceLabel:
          p.price_pen && Number(p.price_pen) > 0 ? `S/ ${Number(p.price_pen).toFixed(2)}` : 'Gratis',
      };
    });
    if (currentPlanId) {
      mapped.sort((a, b) => {
        if (a.id === currentPlanId) return -1;
        if (b.id === currentPlanId) return 1;
        return 0;
      });
    }
    return mapped;
  }, [plans, usage?.plan?.id]);

  const onSelectPlan = async (planId: string) => {
    if (!session?.user?.id) return;
    setUpdating(planId);
    try {
      await changePlan(session.user.id, planId);
      const snapshot = await getUsageSnapshot(session.user.id);
      setUsage(snapshot);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: palette.surface, dark: palette.surface }}
      headerHeight={140}
      contentStyle={styles.scrollContent}
      headerImage={
        <View style={[styles.headerHero, { maxWidth: contentMax }]}>
          <ThemedText style={styles.overline}>Paquetes</ThemedText>
          <ThemedText type="title" style={styles.title}>
            Elige tu plan
          </ThemedText>
          <ThemedText style={styles.subtitle}>Tenemos planes para todos los usuarios</ThemedText>
        </View>
      }>
      <View style={[styles.contentWrap, { maxWidth: contentMax }]}>
        <ThemedView style={styles.plansCard}>
          <View style={styles.plansHeader}>
            <ThemedText style={styles.sectionTitle}>Nuestros Planes</ThemedText>
          </View>
          {loading ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <View style={styles.planList}>
              {mappedPlans.map((plan) => (
                <Pressable
                  key={plan.id}
                  style={[
                    styles.planCard,
                    usage?.plan?.id === plan.id && {
                      borderColor: palette.accent,
                      borderWidth: 2,
                      backgroundColor: palette.surface,
                    },
                  ]}
                  onPress={() => onSelectPlan(plan.id)}
                  disabled={Boolean(updating) || usage?.plan?.id === plan.id}>
                  <View style={styles.planHeader}>
                    <ThemedText style={styles.planName}>{plan.name}</ThemedText>
                    <View style={styles.badge}>
                      <ThemedText style={styles.badgeText}>{plan.tag}</ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.planSubtitle}>{plan.subtitle}</ThemedText>
                  <ThemedText style={styles.planPrice}>{plan.priceLabel}</ThemedText>
                  <ThemedText style={styles.planAction}>
                    {updating === plan.id
                      ? 'Aplicando…'
                      : usage?.plan?.id === plan.id
                        ? 'Plan actual'
                        : 'Elegir plan'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          )}
        </ThemedView>
      </View>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 14,
    alignItems: 'center',
  },
  contentWrap: {
    width: '100%',
    gap: 14,
  },
  plansCard: {
    borderRadius: 18,
    padding: 16,
    gap: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  plansHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  muted: {
    color: palette.subtext,
  },
  planList: {
    gap: 12,
  },
  headerHero: {
    flex: 1,
    padding: 32,
    gap: 6,
    width: '100%',
    alignSelf: 'center',
  },
  overline: {
    color: palette.accent,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: Fonts.rounded,
  },
  title: {
    color: palette.text,
    fontWeight: '700',
    fontFamily: Fonts.rounded,
  },
  subtitle: {
    color: palette.subtext,
  },
  planCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceAlt,
    gap: 6,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planName: {
    color: palette.text,
    fontWeight: '700',
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
});
