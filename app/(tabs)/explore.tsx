import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { changePlan, getPlans, getUsageSnapshot, type PlanOption, type UsageSnapshot } from '@/lib/billing';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

const palette = {
  primary: '#0E8BFF',
  accent: '#0CD3A2',
  warning: '#F6A609',
  surface: '#0B1021',
  surfaceAlt: '#0F172A',
};

type ConsultaRow = {
  id: string;
  tipo: string;
  placa: string | null;
  dni: string | null;
  created_at: string;
  success: boolean | null;
  resumen: string | null;
};

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [history, setHistory] = useState<ConsultaRow[]>([]);
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
    const [usageSnapshot, planOptions, historyRes] = await Promise.all([
      getUsageSnapshot(session.user.id),
      getPlans(),
      supabase
        .from('consultas')
        .select('id, tipo, placa, dni, created_at, success, resumen')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    setUsage(usageSnapshot);
    setPlans(planOptions);
    setHistory((historyRes.data as ConsultaRow[] | null) ?? []);
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
    usage?.remainingToday != null
      ? `${usage.remainingToday} consultas hoy · ${usage.remainingMonth ?? '∞'} en el mes`
      : 'Créditos ilimitados';

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
      headerBackgroundColor={{ light: '#0A1837', dark: '#0B122A' }}
      headerImage={
        <View style={styles.headerHero}>
          <View style={styles.headerBadge}>
            <MaterialIcons name="verified-user" size={24} color={palette.accent} />
          </View>
          <ThemedText type="title" style={styles.headerTitle}>
            Tu perfil y plan
          </ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            Consulta tus créditos, cambia de plan y revisa tu historial de consultas guardado en
            Supabase.
          </ThemedText>
        </View>
      }>
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
                  <Stat label="Hoy" value={usage?.dailyUsed ?? 0} />
                  <Stat label="Mes" value={usage?.monthlyUsed ?? 0} />
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
          <ThemedText style={styles.sectionTitle}>Planes</ThemedText>
          <ThemedText style={styles.muted}>Actualiza tu suscripción</ThemedText>
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
                onPress={() => onSelectPlan(plan.id)}
                disabled={Boolean(updatingPlan)}>
                <View style={styles.rowBetween}>
                  <ThemedText style={styles.planName}>{plan.name}</ThemedText>
                  <View style={styles.tinyBadge}>
                    <ThemedText style={styles.tinyBadgeText}>{plan.tag}</ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.planSubtitle}>{plan.subtitle}</ThemedText>
                <ThemedText style={styles.planPrice}>
                  {plan.price_usd && plan.price_usd > 0 ? `$${plan.price_usd} / mes` : 'Gratis'}
                </ThemedText>
                <ThemedText style={styles.planSupport}>Soporte: {plan.support}</ThemedText>
                {plan.notes ? (
                  <ThemedText style={styles.planSupport}>Incluye: {plan.notes}</ThemedText>
                ) : null}
                <ThemedText style={styles.planAction}>
                  {updatingPlan === plan.id ? 'Aplicando…' : 'Elegir plan'}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <View style={styles.rowBetween}>
          <ThemedText style={styles.sectionTitle}>Historial (últimas 20)</ThemedText>
          <ThemedText style={styles.muted}>Guardado en Supabase</ThemedText>
        </View>
        {loading ? (
          <ActivityIndicator color={palette.primary} />
        ) : supabaseMissing ? (
          <ThemedText style={styles.errorText}>Sin conexión a Supabase.</ThemedText>
        ) : history.length === 0 ? (
          <ThemedText style={styles.muted}>Aún no hay consultas guardadas.</ThemedText>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <HistoryRow item={item} />}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        )}
      </ThemedView>
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

function HistoryRow({ item }: { item: ConsultaRow }) {
  const date = new Date(item.created_at);
  const label = item.placa ? `Placa ${item.placa}` : item.dni ? `DNI ${item.dni}` : '';
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyIcon}>
        <MaterialIcons
          name={item.success === false ? 'error' : 'check-circle'}
          size={20}
          color={item.success === false ? '#F05941' : palette.accent}
        />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={styles.historyTitle}>{item.tipo}</ThemedText>
        <ThemedText style={styles.historySubtitle}>
          {item.resumen || label || 'Sin detalle'}
        </ThemedText>
        <ThemedText style={styles.historyDate}>{date.toLocaleString()}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerHero: {
    flex: 1,
    padding: 32,
    gap: 10,
  },
  headerBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#0E8BFF22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.rounded,
    color: '#F8FAFC',
    maxWidth: 320,
  },
  headerSubtitle: {
    color: '#CBD5E1',
    maxWidth: 360,
  },
  card: {
    borderRadius: 18,
    padding: 18,
    gap: 12,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: '#162042',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  muted: {
    color: '#94A3B8',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.primary,
  },
  badgeText: {
    color: palette.primary,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#162042',
    backgroundColor: '#0b1328',
    gap: 4,
  },
  statValue: {
    color: '#F8FAFC',
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
    backgroundColor: '#0E1931',
  },
  signOutText: {
    color: '#fff',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  planList: {
    gap: 10,
  },
  planCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#162042',
    backgroundColor: '#0B1426',
    gap: 6,
  },
  planName: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  tinyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0E8BFF',
  },
  tinyBadgeText: {
    color: '#0E8BFF',
    fontSize: 12,
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
  historyRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#162042',
    backgroundColor: '#0B1426',
  },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0E1931',
  },
  historyTitle: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  historySubtitle: {
    color: '#CBD5E1',
  },
  historyDate: {
    color: '#94A3B8',
    fontSize: 12,
  },
  errorText: {
    color: '#F05941',
    fontWeight: '700',
  },
});
