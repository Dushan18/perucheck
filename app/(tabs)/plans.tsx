import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getPlans, changePlan, getUsageSnapshot, type PlanOption, type UsageSnapshot } from '@/lib/billing';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/lib/supabase';

const palette = {
  primary: '#0E8BFF',
  accent: '#0CD3A2',
  danger: '#F05941',
  surface: '#0B1021',
  surfaceAlt: '#0F172A',
};

export default function PlansScreen() {
  const { session } = useAuth();
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
    return plans.map((p) => {
      const features = typeof p.features === 'object' && p.features ? p.features : {};
      return {
        ...p,
        tag: p.id === 'free' ? 'Incluido' : p.id === 'pro' ? 'Recomendado' : 'A medida',
        subtitle:
          p.daily_limit || p.monthly_limit
            ? `${p.daily_limit ?? '∞'}/día · ${p.monthly_limit ?? '∞'}/mes`
            : 'Uso según contrato',
        support: features.support ?? 'standard',
        notes: features.notes ?? '',
      };
    });
  }, [plans]);

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
    <ThemedView style={styles.screen} lightColor="#050915" darkColor="#050915">
      <ScrollView contentContainerStyle={{ gap: 14, padding: 14 }}>
        <View style={styles.header}>
          <ThemedText style={styles.overline}>Paquetes</ThemedText>
          <ThemedText type="title" style={styles.title}>
            Elige tu plan de consultas
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Plan actual: {usage?.plan?.name ?? 'Free'} · Créditos{' '}
            {usage?.remainingToday != null ? `${usage.remainingToday} hoy` : '∞'}
          </ThemedText>
        </View>

        {loading ? (
          <ActivityIndicator color={palette.primary} />
        ) : (
          mappedPlans.map((plan) => (
            <Pressable
              key={plan.id}
              style={[
                styles.planCard,
                usage?.plan?.id === plan.id && { borderColor: palette.accent },
              ]}
              onPress={() => onSelectPlan(plan.id)}
              disabled={Boolean(updating)}>
              <View style={styles.planHeader}>
                <ThemedText style={styles.planName}>{plan.name}</ThemedText>
                <View style={styles.badge}>
                  <ThemedText style={styles.badgeText}>{plan.tag}</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.planSubtitle}>{plan.subtitle}</ThemedText>
              <ThemedText style={styles.planPrice}>
                {plan.price_usd && plan.price_usd > 0 ? `$${plan.price_usd} / mes` : 'Gratis'}
              </ThemedText>
              <ThemedText style={styles.planSupport}>Soporte: {plan.support}</ThemedText>
              {plan.notes ? <ThemedText style={styles.planSupport}>Incluye: {plan.notes}</ThemedText> : null}
              <ThemedText style={styles.planAction}>
                {updating === plan.id ? 'Aplicando…' : 'Usar este plan'}
              </ThemedText>
            </Pressable>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    gap: 6,
  },
  overline: {
    color: palette.accent,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  subtitle: {
    color: '#CBD5E1',
  },
  planCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#162042',
    backgroundColor: palette.surfaceAlt,
    gap: 6,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planName: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0E8BFF',
  },
  badgeText: {
    color: '#0E8BFF',
    fontWeight: '700',
  },
  planSubtitle: {
    color: '#CBD5E1',
  },
  planPrice: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  planSupport: {
    color: '#CBD5E1',
  },
  planAction: {
    color: palette.accent,
    fontWeight: '700',
  },
});
