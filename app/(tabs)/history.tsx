import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type ConsultaRow = {
  id: string;
  tipo: string;
  placa: string | null;
  dni: string | null;
  created_at: string;
  resumen: string | null;
  success: boolean | null;
};

const palette = {
  primary: '#0E8BFF',
  accent: '#0CD3A2',
  danger: '#F05941',
  surface: '#0B1021',
  surfaceAlt: '#0F172A',
};

export default function HistoryScreen() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ConsultaRow[]>([]);

  const load = useCallback(async () => {
    if (!supabase || !session?.user?.id) {
      setRows([]);
      setLoading(false);
      setError('No hay sesión activa. Inicia sesión para ver tu historial.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('consultas')
        .select('id, tipo, placa, dni, created_at, resumen, success')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (dbError) throw dbError;
      setRows((data as ConsultaRow[]) ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ThemedView style={styles.screen} lightColor="#050915" darkColor="#050915">
      <View style={styles.header}>
        <ThemedText style={styles.overline}>Historial</ThemedText>
        <ThemedText type="title" style={styles.title}>
          Consultas recientes
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Ve tus últimas consultas y revisa rápidamente la placa o DNI ya consultados.
        </ThemedText>
      </View>

      <ThemedView style={styles.card}>
        <View style={styles.cardHeader}>
          <ThemedText style={styles.cardTitle}>Últimas 50 consultas</ThemedText>
          <Pressable onPress={load} style={styles.refresh}>
            <ThemedText style={styles.refreshText}>Actualizar</ThemedText>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={palette.primary} />
        ) : error ? (
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        ) : rows.length === 0 ? (
          <ThemedText style={styles.subtitle}>Aún no hay consultas guardadas.</ThemedText>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <HistoryItem item={item} />}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            scrollEnabled={false}
          />
        )}
      </ThemedView>
    </ThemedView>
  );
}

function HistoryItem({ item }: { item: ConsultaRow }) {
  const date = new Date(item.created_at);
  const label = item.placa
    ? `Placa ${item.placa}`
    : item.dni
    ? `DNI ${item.dni}`
    : 'Consulta';
  const statusColor = item.success === false ? palette.danger : palette.accent;
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={[styles.badge, { borderColor: statusColor }]}>
          <ThemedText style={[styles.badgeText, { color: statusColor }]}>{item.tipo}</ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.label}>{label}</ThemedText>
          <ThemedText style={styles.resumen}>{item.resumen || 'Sin resumen'}</ThemedText>
          <ThemedText style={styles.date}>{date.toLocaleString()}</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 18,
    gap: 12,
  },
  header: {
    gap: 6,
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
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 14,
    gap: 10,
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
    fontWeight: '700',
  },
  refresh: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  refreshText: {
    color: palette.primary,
    fontWeight: '700',
  },
  errorText: {
    color: palette.danger,
    fontWeight: '700',
  },
  row: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#162042',
    backgroundColor: palette.surfaceAlt,
  },
  rowLeft: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: '700',
  },
  label: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  resumen: {
    color: '#CBD5E1',
  },
  date: {
    color: '#94A3B8',
    fontSize: 12,
  },
});
