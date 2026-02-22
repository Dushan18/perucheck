import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
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

export default function HistoryScreen() {
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const contentMax = Math.min(720, width - 32);
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
        .limit(20);
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
    <ParallaxScrollView
      headerBackgroundColor={{ light: palette.surface, dark: palette.surface }}
      headerHeight={150}
      contentStyle={styles.scrollContent}
      headerImage={
        <View style={[styles.headerHero, { maxWidth: contentMax }]}>
          <ThemedText style={styles.overline}>Historial</ThemedText>
          <ThemedText type="title" style={styles.title}>
            Consultas recientes
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Ve tus últimas consultas y revisa rápidamente la placa o DNI ya consultados.
          </ThemedText>
        </View>
      }>
      <View style={[styles.contentWrap, { maxWidth: contentMax }]}>
        <ThemedView style={styles.card}>
          <View style={styles.cardHeader}>
            <ThemedText style={styles.cardTitle}>Últimas 20 consultas</ThemedText>
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
      </View>
    </ParallaxScrollView>
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
        <View
          style={[
            styles.badge,
            { borderColor: statusColor, backgroundColor: `${statusColor}1A` },
          ]}>
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
  scrollContent: {
    paddingVertical: 18,
    paddingHorizontal: 30,
    gap: 12,
    alignItems: 'center',
  },
  contentWrap: {
    width: '100%',
    marginTop: 12,
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
    fontFamily: Fonts.rounded,
    fontWeight: '700',
    maxWidth: 320,
  },
  subtitle: {
    color: palette.subtext,
    maxWidth: 360,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: palette.text,
    fontWeight: '700',
  },
  refresh: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
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
    borderColor: palette.border,
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
    color: palette.text,
    fontWeight: '700',
  },
  resumen: {
    color: palette.subtext,
  },
  date: {
    color: palette.muted,
    fontSize: 12,
  },
});

