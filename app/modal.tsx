import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getPlans, changePlan, getUsageSnapshot, type PlanOption } from '@/lib/billing';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/lib/supabase';

const formatExpiry = (iso?: string | null) => {
  if (!iso) return 'Sin vencimiento';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Sin vencimiento' : d.toLocaleDateString();
};

export default function ModalScreen() {
  const { action } = useLocalSearchParams<{ action?: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ planName?: string; remaining?: string }>({});

  const isPaquetes = action === 'paquetes';

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [planOptions, snapshot] = await Promise.all([
        getPlans(),
        getUsageSnapshot(session?.user?.id),
      ]);
      setPlans(planOptions);
      setUsage({
        planName: snapshot.plan?.name ?? 'Free',
        remaining:
          snapshot.creditsRemaining != null
            ? `${snapshot.creditsRemaining} restantes${
                snapshot.validUntil ? ` · vence ${formatExpiry(snapshot.validUntil)}` : ''
              }`
            : 'Uso ilimitado',
      });
      setLoading(false);
    };
    fetchData();
  }, [session?.user?.id]);

  const mappedPlans = useMemo(() => {
    return plans.map((p) => {
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
  }, [plans]);

  const onSelectPlan = async (planId: string) => {
    if (!session?.user?.id || !supabase) return;
    setUpdating(planId);
    try {
      await changePlan(session.user.id, planId);
      const snapshot = await getUsageSnapshot(session.user.id);
      setUsage({
        planName: snapshot.plan?.name ?? 'Free',
        remaining:
          snapshot.creditsRemaining != null
            ? `${snapshot.creditsRemaining} restantes${
                snapshot.validUntil ? ` · vence ${formatExpiry(snapshot.validUntil)}` : ''
              }`
            : 'Uso ilimitado',
      });
    } finally {
      setUpdating(null);
    }
  };

  if (!isPaquetes) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Vista no disponible</ThemedText>
        <Pressable onPress={() => router.back()} style={styles.linkButton}>
          <ThemedText type="link">Volver</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ThemedText style={styles.overline}>Planes y paquetes</ThemedText>
          <ThemedText type="title" style={styles.title}>
            Elige tu paquete de consultas
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Tu plan actual: {usage.planName ?? 'Free'} · Créditos {usage.remaining ?? '∞'}
          </ThemedText>
        </View>

        <View style={styles.planGrid}>
          {loading ? (
            <ThemedText style={styles.subtitle}>Cargando planes…</ThemedText>
          ) : (
            mappedPlans.map((plan) => (
              <Pressable
                key={plan.id}
                style={styles.planCard}
                onPress={() => onSelectPlan(plan.id)}
                disabled={Boolean(updating)}>
                <View style={styles.planHeader}>
                  <ThemedText style={styles.planName}>{plan.name}</ThemedText>
                  <View style={styles.badge}>
                    <ThemedText style={styles.badgeText}>{plan.tag}</ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.planSubtitle}>{plan.subtitle}</ThemedText>
                <ThemedText style={styles.planPrice}>{plan.priceLabel}</ThemedText>
                <View style={styles.planFeatures} />
                <View style={styles.planFooter}>
                  <ThemedText style={styles.planAction}>
                    {updating === plan.id ? 'Aplicando…' : 'Usar este plan'}
                  </ThemedText>
                </View>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.helper}>
          <ThemedText style={styles.helperTitle}>¿Cómo funciona?</ThemedText>
          <ThemedText style={styles.helperText}>
            Cambia de plan sin salir de la app. Las consultas que hagas se guardan en tu historial y
            se descuentan de tus créditos activos automáticamente.
          </ThemedText>
        </View>

        <Pressable onPress={() => router.back()} style={styles.linkButton}>
          <ThemedText type="link">Volver</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  content: {
    gap: 16,
    paddingBottom: 24,
  },
  header: {
    gap: 6,
  },
  overline: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    marginTop: 4,
  },
  subtitle: {
    color: '#94A3B8',
  },
  planGrid: {
    gap: 12,
  },
  planCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1328',
    gap: 8,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planName: {
    fontSize: 18,
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
    fontSize: 16,
    fontWeight: '700',
  },
  planFeatures: {
    gap: 4,
  },
  feature: {
    color: '#CBD5E1',
  },
  planFooter: {
    marginTop: 8,
  },
  planAction: {
    color: '#0CD3A2',
    fontWeight: '700',
  },
  helper: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0d162f',
    gap: 6,
  },
  helperTitle: {
    fontWeight: '700',
  },
  helperText: {
    color: '#CBD5E1',
  },
  linkButton: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
});
