import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from "react-native";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { getUsageSnapshot, registerConsulta, type UsageSnapshot } from '@/lib/billing';
import { useAuth } from '@/providers/auth-provider';

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



const formatExpiry = (iso?: string | null) => {
  if (!iso) return 'Sin vencimiento';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Sin vencimiento' : d.toLocaleDateString();
};

const formatPlate = (value: string) => {
  const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  const part1 = clean.slice(0, 3);
  const part2 = clean.slice(3, 6);
  return part1 + (clean.length > 3 ? '-' : '') + part2;
};

const formatDni = (value: string) => value.replace(/\D/g, '').slice(0, 8);

type ServiceState = {
  loading: boolean;
  error?: string | null;
  data?: any;
  parsed?: any;
  query?: string;
  fetchedAt?: number;
};

type SoatData = {
  aseguradora: string;
  clase: string;
  uso: string;
  accidentes: string;
  poliza: string;
  certificado: string;
  inicio: string;
  fin: string;
  infoActualizada?: string;
};

type ItvData = {
  inicio?: string;
  fin?: string;
  estado?: string;
  vigencia?: string;
  centro?: string;
};

type SunarpOwner = {
  nombre: string;
  documento?: string;
  porcentaje?: string;
  condicion?: string;
  reniec?: ReturnType<typeof parseDniPeru> | null;
};

type SunarpData = {
  propietarios: SunarpOwner[];
  coincidencias?: SunarpOwner[];
  dniPropietario?: string;
  propietarioUsado?: string;
  placa?: string;
  vin?: string;
  partida?: string;
  oficina?: string;
  captchaDetectado?: string;
  captchaValido?: boolean;
  imagenResultado?: string;
};

type OwnerLookupState = {
  loading: boolean;
  type: 'persona' | 'empresa' | null;
  data: any | null;
  error: string | null;
  query: string | null;
};

const parseDate = (input?: string | null) => {
  if (!input) return null;
  const parts = input.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
};

const parseSoat = (raw: string): SoatData | null => {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const infoIdx = lines.findIndex((l) => l.toLowerCase().includes('información actualizada'));
  const infoActualizada =
    infoIdx >= 0 ? lines[infoIdx].split(':').slice(1).join(':').trim() || undefined : undefined;

  const headerIdx = lines.findIndex((l) => l.toLowerCase().includes('compañía aseguradora'));
  let row: string | undefined;
  if (headerIdx >= 0) {
    row = lines.slice(headerIdx + 1).find((l) => l.split(/\t+/).filter(Boolean).length >= 5);
  }
  if (!row) {
    row = lines.find((l) => l.split(/\t+/).filter(Boolean).length >= 5);
  }
  if (!row) return null;
  const parts = row.split(/\t+/).filter(Boolean);
  if (parts.length < 8) return null;
  const [aseguradora, clase, uso, accidentes, poliza, certificado, inicio, fin] = parts;
  return { aseguradora, clase, uso, accidentes, poliza, certificado, inicio, fin, infoActualizada };
};

const formatDisplayDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  return d ? d.toLocaleDateString() : dateStr;
};

const parseItv = (raw: string, full?: any): ItvData | null => {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const plateUpper = (full?.placa ?? '').toUpperCase();
  const row = lines.find((l) => (plateUpper ? l.includes(plateUpper) : /\d{2}\/\d{2}\/\d{4}/.test(l)));
  let tokens: string[] = [];
  if (row) {
    tokens = row.split(/\t+/).filter(Boolean);
  }
  // Expect: [plate, cert, desde, hasta, resultado, estado]
  const inicio = tokens[2];
  const fin = tokens[3];
  const estado = tokens[5] ?? tokens[4];

  // Fallback to first two dates in the blob
  let fallbackInicio: string | undefined;
  let fallbackFin: string | undefined;
  const dates = raw.match(/(\d{2}\/\d{2}\/\d{4})/g);
  if (dates && dates.length >= 2) {
    fallbackInicio = dates[0];
    fallbackFin = dates[1];
  }

  const centroMatch = raw.match(/CENTRO DE INSPECC?ION[^,\n]+/i);
  const vigencia =
    full?.vigente === true ? 'Vigente' : full?.vigente === false ? 'Vencido' : estado;

  if (!(inicio || fin || fallbackInicio || fallbackFin || estado || vigencia || centroMatch)) {
    return null;
  }

  return {
    inicio: inicio || fallbackInicio,
    fin: fin || fallbackFin,
    estado: estado || vigencia,
    vigencia,
    centro: centroMatch ? centroMatch[0] : undefined,
  };
};

const parseSunarp = (raw: string, full?: any): SunarpData | null => {
  const datos = full?.datos || full;
  const propietariosRaw =
    datos?.propietarios || datos?.titulares || datos?.propietario || datos?.titular || [];
  const propietariosDetalle = datos?.propietarios_detalle || datos?.propietariosDetalles || [];
  const coincidenciasRaw = datos?.dni_propietario_coincidentes || datos?.propietarios_coincidentes || [];
  const busquedaResultados = datos?.dni_propietario_buscar?.resultados || [];
  const propietarios: SunarpOwner[] = [];
  const coincidencias: SunarpOwner[] = [];

  if (Array.isArray(propietariosRaw)) {
    propietariosRaw.forEach((p) => {
      const nombre = p?.nombre || p?.nombres || p?.propietario || p?.razon_social || '';
      const documento = `${p?.documento || p?.dni || p?.ruc || p?.doc || ''}`.trim();
      const porcentaje = p?.porcentaje || p?.participacion || '';
      const condicion = p?.condicion || p?.calidad || '';
      if (nombre || documento) {
        propietarios.push({ nombre: nombre || 'Propietario', documento, porcentaje, condicion });
      }
    });
  } else if (typeof propietariosRaw === 'string' && propietariosRaw.trim()) {
    propietarios.push({ nombre: propietariosRaw.trim() });
  }

  if (Array.isArray(propietariosDetalle)) {
    propietariosDetalle.forEach((p: any) => {
      const texto = p?.texto || '';
      const partes = [p?.ap_paterno, p?.ap_materno, p?.nombres].filter(Boolean).join(' ').trim();
      const nombre = partes || texto;
      if (nombre) {
        propietarios.push({
          nombre,
          documento: `${p?.documento || ''}`.trim() || undefined,
          condicion: p?.condicion || '',
        });
      }
    });
  }

  if (Array.isArray(coincidenciasRaw)) {
    coincidenciasRaw.forEach((c: any) => {
      const nombre = [c?.nombres, c?.ap_paterno, c?.ap_materno, c?.texto]
        .filter(Boolean)
        .join(' ')
        .trim();
      const documento = `${c?.dni || c?.documento || ''}`.trim();
      if (nombre || documento) {
        coincidencias.push({ nombre: nombre || 'Coincidencia', documento });
      }
    });
  }

  if (Array.isArray(busquedaResultados) && busquedaResultados.length) {
    busquedaResultados.forEach((c: any) => {
      const nombre = [c?.nombres, c?.ap_paterno, c?.ap_materno].filter(Boolean).join(' ').trim();
      const documento = `${c?.dni || ''}`.trim();
      if (nombre || documento) {
        coincidencias.push({ nombre: nombre || 'Coincidencia', documento });
      }
    });
  }

  if (!propietarios.length) {
    const posiblesLineas = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /propietario/i.test(l));
    posiblesLineas.slice(0, 3).forEach((linea) => {
      const limpio = linea.replace(/propietario:?\s*/i, '').trim();
      if (limpio) propietarios.push({ nombre: limpio });
    });
  }

  const placa = datos?.placa || datos?.placa_rodaje || '';
  const vin = datos?.vin || datos?.vin_vehicular || datos?.numero_vin || '';
  const partida = datos?.partida || datos?.nro_partida || '';
  const oficina = datos?.oficina || datos?.zona || datos?.zona_registral || '';
  const dniPropietario = `${datos?.dni_propietario || ''}`.trim() || undefined;
  const propietarioUsado = datos?.propietario_usado_para_dni
    ? [datos.propietario_usado_para_dni?.nombres, datos.propietario_usado_para_dni?.ap_paterno, datos.propietario_usado_para_dni?.ap_materno]
      .filter(Boolean)
      .join(' ')
      .trim()
    : undefined;
  const captchaDetectado = datos?.captcha_detectado || full?.captcha_detectado;
  const captchaValido = datos?.captcha_valido ?? full?.captcha_valido;
  const imagenResultado = datos?.imagen_resultado_src || full?.imagen_resultado_src || '';

  if (!propietarios.length && !coincidencias.length && !(placa || vin || partida || oficina)) {
    return null;
  }

  return {
    propietarios,
    coincidencias,
    dniPropietario,
    propietarioUsado,
    placa,
    vin,
    partida,
    oficina,
    captchaDetectado,
    captchaValido: captchaValido === true || captchaValido === 'true',
    imagenResultado,
  };
};

const parseLicencia = (raw: string, full?: any) => {
  const datos = full?.datos || full;
  const resumen = full?.resumen || {};
  const tramites = full?.tabla_tramites || [];
  const bonificaciones = full?.tabla_bonificacion || [];
  return {
    numero: datos?.licencia || datos?.numero || '',
    clase: datos?.clase || datos?.categoria || '',
    restricciones: datos?.restricciones || resumen?.restricciones || '',
    estado: datos?.estado || resumen?.estado_licencia || '',
    vencimiento:
      datos?.fecha_revalidacion ||
      datos?.vencimiento ||
      resumen?.vigente_hasta ||
      resumen?.vencimiento ||
      '',
    nombres: datos?.nombres || datos?.nombre_completo || resumen?.administrado || '',
    puntosFirmes: resumen?.puntos_firmes || resumen?.puntosFirmes || '',
    infracciones: resumen?.infracciones_acumuladas || resumen?.infracciones || '',
    graves: resumen?.graves || '',
    muyGraves: resumen?.muy_graves || '',
    tramites,
    bonificaciones,
  };
};

const parseDniPeru = (raw: string, full?: any) => {
  const datos = full?.datos || full;
  return {
    nombres: datos?.nombres || datos?.nombre_completo || '',
    apellidoPaterno: datos?.apellido_paterno || '',
    apellidoMaterno: datos?.apellido_materno || '',
    codigoVerificacion: datos?.codigo_verificacion || '',
    direccion: datos?.direccion || '',
  };
};

const parseRedam = (raw: string, full?: any) => {
  const datos = full?.datos || full;
  const items = datos?.registros || [];
  return {
    total: Array.isArray(items) ? items.length : 0,
    detalle: Array.isArray(items) ? items.slice(0, 3) : [],
  };
};

const normalizeOwnerName = (name: string) =>
  name
    .replace(/\(.*?\)/g, ' ')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const COMPANY_TOKENS = [
  'SAC',
  'SRL',
  'EIRL',
  'SAA',
  'SA',
  'SOCIEDAD',
  'EMPRESA',
  'CORPORACION',
  'COMPANIA',
  'CIA',
  'COOPERATIVA',
  'ASOCIACION',
  'FUNDACION',
];

const isCompanyName = (name: string) => {
  const normalized = normalizeOwnerName(name).toUpperCase().replace(/Ñ/g, 'N');
  return COMPANY_TOKENS.some((token) =>
    new RegExp(`\\b${token}\\b`, 'i').test(normalized)
  );
};

const splitPersonName = (name: string) => {
  const normalized = normalizeOwnerName(name).toUpperCase();
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length < 3) return null;
  return {
    apellido_paterno: parts[0],
    apellido_materno: parts[1],
    nombres: parts.slice(2).join(' '),
  };
};

const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

const serviceConfigs: Record<
  string,
  { endpoint: string; parser?: (raw: string, full?: any) => any; field: 'placa' | 'dni'; scope: 'vehiculo' | 'persona' }
> = {
  soat: { endpoint: `${apiBase}/consulta-soat`, parser: parseSoat, field: 'placa', scope: 'vehiculo' },
  itv: { endpoint: `${apiBase}/consulta-itv`, parser: parseItv, field: 'placa', scope: 'vehiculo' },
  satlima: { endpoint: `${apiBase}/consulta-sat`, field: 'placa', scope: 'vehiculo' },
  satcallao: { endpoint: `${apiBase}/consulta-sat-callao`, field: 'placa', scope: 'vehiculo' },
  sutran: { endpoint: `${apiBase}/consulta-sutran`, field: 'placa', scope: 'vehiculo' },
  sunarp: { endpoint: `${apiBase}/consulta-vehicular`, parser: parseSunarp, field: 'placa', scope: 'vehiculo' },
  licencia: { endpoint: `${apiBase}/consulta-licencia-dni`, parser: parseLicencia, field: 'dni', scope: 'persona' },
  dniperu: { endpoint: `${apiBase}/consulta-dni-peru`, parser: parseDniPeru, field: 'dni', scope: 'persona' },
  redam: { endpoint: `${apiBase}/consulta-redam-dni`, parser: parseRedam, field: 'dni', scope: 'persona' },
};

const enrichSunarpWithDni = async (parsed: SunarpData | null): Promise<SunarpData | null> => {
  if (!parsed || !Array.isArray(parsed.propietarios) || !parsed.propietarios.length) return parsed;
  const dniConfig = serviceConfigs.dniperu;
  if (!dniConfig?.endpoint) return parsed;

  const propietarios = await Promise.all(
    parsed.propietarios.map(async (prop) => {
      const dni = formatDni(prop.documento ?? '');
      if (!dni || dni.length < 8) {
        return prop;
      }
      try {
        const res = await fetch(dniConfig.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [dniConfig.field]: dni }),
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json();
        const parsedDni = parseDniPeru(data?.resultado_crudo ?? '', data);
        const nombreDni = `${parsedDni?.nombres ?? ''} ${parsedDni?.apellidoPaterno ?? ''} ${parsedDni?.apellidoMaterno ?? ''}`.trim();
        if (nombreDni) {
          return { ...prop, nombre: prop.nombre || nombreDni, reniec: { ...parsedDni, dni } };
        }
        return { ...prop, reniec: parsedDni ?? null };
      } catch (error) {
        return prop;
      }
    })
  );

  return { ...parsed, propietarios };
};

const vehicleServices: {
  key: string;
  title: string;
  status: string;
  statusColor: string;
  detail: string;
}[] = [
    { key: 'sutran', title: 'SUTRAN', status: 'Sin inmovilización', statusColor: palette.accent, detail: 'Papeletas MTC: 0' },
    { key: 'sunarp', title: 'SUNARP', status: 'Propiedad vigente', statusColor: palette.accent, detail: 'Placa y VIN coinciden' },
    { key: 'soat', title: 'SOAT', status: 'Consulta activa', statusColor: palette.accent, detail: 'Vigencia y aseguradora' },
    { key: 'satlima', title: 'SAT Lima', status: 'Pendiente', statusColor: palette.danger, detail: 'Papeletas y deudas' },
    { key: 'satcallao', title: 'SAT Callao', status: 'Pendiente', statusColor: palette.accent, detail: 'Papeletas Callao' },
    { key: 'itv', title: 'Revisión técnica', status: 'Pendiente', statusColor: palette.warning, detail: 'Última vigencia' },
  ];

const quickActions: { label: string; icon: ComponentProps<typeof MaterialIcons>['name'] }[] = [
  { label: 'Descargar PDF', icon: 'file-download' },
  { label: 'Compartir', icon: 'share' },
  { label: 'Historial de placas', icon: 'history' },
  { label: 'Alertas por correo', icon: 'notifications-active' },
];

const timeline = [
  { title: 'Pago SAT', time: 'Hoy - 10:12', badge: 'S/. 95', tone: palette.accent },
  { title: 'Consulta SUNARP', time: 'Ayer - 18:20', badge: 'Ficha literal', tone: palette.primary },
  { title: 'Revisión técnica', time: '03 Mar - 09:10', badge: 'Aprobado', tone: palette.warning },
];

const personChecks: {
  key: string;
  title: string;
  status: string;
  statusColor: string;
  detail: string;
}[] = [
    { key: 'dniperu', title: 'DNI a nombre', status: 'Pendiente', statusColor: palette.accent, detail: 'Nombres y apellidos' },
    { key: 'licencia', title: 'Licencia MTC', status: 'Pendiente', statusColor: palette.primary, detail: 'Clase y vigencia' },
    { key: 'redam', title: 'REDAM', status: 'Pendiente', statusColor: palette.accent, detail: 'Registros vigentes' },
    { key: 'recompensas', title: 'Recompensas', status: 'Pendiente', statusColor: palette.accent, detail: 'Consulta manual' },
    { key: 'paquetes', title: 'Comprar paquetes', status: 'PeruCheck', statusColor: palette.gold, detail: 'Créditos de consultas' },
  ];

const vehicle = {
  plate: 'ABC-123',
  owner: 'Juan Pérez Rojas',
  vin: '9BWZZZ377VT004251',
  brand: 'Toyota',
  model: 'Corolla SE',
  year: '2021',
  color: 'Gris metálico',
  class: 'Sedán / Gasolina',
};
const personSample = {
  name: 'María Fernanda Torres',
  dni: '12345678',
  license: 'AIIb · vence 09/2025',
  redam: 'Sin registros',
};

function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${tone}22`, borderColor: tone, maxWidth: '100%' }]}>
      <ThemedText style={[styles.badgeText, { color: tone, flexWrap: 'wrap' }]}>
        {label}
      </ThemedText>
    </View>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <ThemedText style={styles.fieldValue}>{value}</ThemedText>
    </View>
  );
}

function PlateInputCard({
  value,
  onChange,
  onSubmit,
  onSelectPlate,
}: {
  value: string;
  onChange: (plate: string) => void;
  onSubmit: () => void;
  onSelectPlate: (plate: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const formattedPlate = useMemo(() => formatPlate(value), [value]);
  const displayChars = useMemo(() => {
    const cleaned = formattedPlate.replace(/[^A-Za-z0-9]/g, '');
    return cleaned.padEnd(6, ' ').slice(0, 6).split('');
  }, [formattedPlate]);

  return (
    <View style={styles.inputCard}>
      <View style={styles.inputCardHeader}>
        <ThemedText style={styles.inputLabel}>Placa peruana</ThemedText>
        <Badge label="Formato ABC-123" tone={palette.primary} />
      </View>

      <View style={styles.inputOverlayWrapper}>
        <Pressable
          style={styles.plateBoxes}
          onPress={() => inputRef.current?.focus()}
          accessibilityRole="text">
          {displayChars.slice(0, 3).map((char, idx) => (
            <View key={`p1-${idx}`} style={styles.plateBox}>
              <ThemedText style={styles.plateBoxText}>{char || '•'}</ThemedText>
            </View>
          ))}
          <View style={styles.plateDash}>
            <ThemedText style={styles.plateDashText}>-</ThemedText>
          </View>
          {displayChars.slice(3).map((char, idx) => (
            <View key={`p2-${idx}`} style={styles.plateBox}>
              <ThemedText style={styles.plateBoxText}>{char || '•'}</ThemedText>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={inputRef}
          value={formattedPlate}
          onChangeText={(text) => onChange(formatPlate(text))}
          autoCapitalize="characters"
          placeholder="ABC-123"
          placeholderTextColor="#9CA3AF"
          style={styles.inputOverlay}
          maxLength={7}
          keyboardType="default"
          importantForAutofill="yes"
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
        onPress={onSubmit}>
        <MaterialIcons name="search" size={22} color="#fff" />
        <ThemedText style={styles.primaryButtonText}>Consultar</ThemedText>
      </Pressable>
    </View>
  );
}

function PersonInputCard({
  value,
  onChange,
  onSubmit,
  onSelectDoc,
}: {
  value: string;
  onChange: (doc: string) => void;
  onSubmit: () => void;
  onSelectDoc: (doc: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const formatted = useMemo(() => formatDni(value), [value]);
  const displayChars = useMemo(() => formatted.padEnd(8, ' ').slice(0, 8).split(''), [formatted]);

  return (
    <View style={styles.inputCard}>
      <View style={styles.inputCardHeader}>
        <ThemedText style={styles.inputLabel}>Documento / DNI</ThemedText>
        <Badge label="8 dígitos" tone={palette.gold} />
      </View>

      <View style={styles.inputOverlayWrapper}>
        <Pressable
          style={styles.plateBoxes}
          onPress={() => inputRef.current?.focus()}
          accessibilityRole="text">
          {displayChars.map((char, idx) => (
            <View key={idx} style={styles.plateBox}>
              <ThemedText style={styles.plateBoxText}>{char || '•'}</ThemedText>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={inputRef}
          value={formatted}
          onChangeText={(text) => onChange(formatDni(text))}
          placeholder="12345678"
          placeholderTextColor="#9CA3AF"
          style={styles.inputOverlay}
          maxLength={8}
          keyboardType="number-pad"
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
        onPress={onSubmit}>
        <MaterialIcons name="search" size={22} color="#fff" />
        <ThemedText style={styles.primaryButtonText}>Consultar</ThemedText>
      </Pressable>

      <View style={styles.quickChips}>
        {['12345678', '87654321', '44556677'].map((doc) => (
          <Pressable key={doc} style={styles.chip} onPress={() => onSelectDoc(doc)}>
            <MaterialIcons name="person-search" size={14} color={palette.gold} />
            <ThemedText style={styles.chipText}>{doc}</ThemedText>
          </Pressable>
        ))}
      </View>
      <ThemedText style={styles.inputHint}>
        Usa DNI o documento; luego puedes abrir REDAM, licencia o recompensas.
      </ThemedText>
    </View>
  );
}

function renderGenericServiceState(state?: ServiceState, onRefresh?: () => void) {
  if (!state || (!state.data && !state.loading && !state.error)) {
    return <ThemedText style={styles.serviceDetail}>Pulsa para consultar</ThemedText>;
  }
  if (state.loading) return <ActivityIndicator color={palette.primary} />;
  if (state.error) return <ThemedText style={styles.errorText}>{state.error}</ThemedText>;
  const data = state.data;
  if (!data) return <ThemedText style={styles.serviceDetail}>Sin datos</ThemedText>;

  const info: string[] = [];
  if (data.tiene_informacion) info.push('Con información');
  if (data.sin_informacion) info.push('Sin información');
  const fecha =
    data.fecha_vencimiento || data.fin_vigencia || data.vigencia || data.vencimiento || null;
  if (fecha) info.push(`Vence: ${fecha}`);
  if (data.placa) info.push(`Placa: ${data.placa}`);

  return (
    <View style={styles.soatContent}>
      {info.length ? (
        info.map((line) => (
          <ThemedText key={line} style={styles.soatLine}>
            {line}
          </ThemedText>
        ))
      ) : (
        <ThemedText style={styles.serviceDetail}>Consulta para ver detalles</ThemedText>
      )}
      {onRefresh ? (
        <Pressable style={styles.secondaryButton} onPress={onRefresh}>
          <ThemedText style={styles.secondaryText}>Actualizar</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function renderSoatState(state?: ServiceState, onRefresh?: () => void) {
  if (!state || (!state.data && !state.loading && !state.error)) {
    return null;
  }
  if (state.loading) return <ActivityIndicator color={palette.primary} />;
  if (state.error) return <ThemedText style={styles.errorText}>{state.error}</ThemedText>;
  const parsed: SoatData | null | undefined = state.parsed;
  if (!parsed) return <ThemedText style={styles.serviceDetail}>Sin datos SOAT</ThemedText>;

  return (
    <View style={styles.soatContent}>
      <ThemedText style={styles.soatLine}>
        {parsed.aseguradora} · {parsed.clase}
      </ThemedText>
      <ThemedText style={styles.soatLine}>
        Vigencia: {formatDisplayDate(parsed.inicio)} - {formatDisplayDate(parsed.fin)}
      </ThemedText>
      <View style={styles.soatBadges}>
        <Badge label={`${parsed.accidentes} accidentes`} tone={palette.gold} />
        <Badge label={`Cert ${parsed.certificado}`} tone={palette.primary} />
      </View>
      {onRefresh ? (
        <Pressable style={styles.secondaryButton} onPress={onRefresh}>
          <ThemedText style={styles.secondaryText}>Actualizar SOAT</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function renderSunarpState(state?: ServiceState, onRefresh?: () => void) {
  if (!state || (!state.data && !state.loading && !state.error)) {
    return <ThemedText style={styles.serviceDetail}>Pulsa para consultar</ThemedText>;
  }
  if (state.loading) return <ActivityIndicator color={palette.primary} />;
  if (state.error) return <ThemedText style={styles.errorText}>{state.error}</ThemedText>;
  const parsed: SunarpData | null | undefined = state.parsed;
  if (!parsed) return renderGenericServiceState(state, onRefresh);
  const hasImage = Boolean(parsed.imagenResultado);

  return (
    <View style={styles.soatContent}>
      {hasImage ? (
        <Image source={{ uri: parsed.imagenResultado }} style={styles.sunarpImage} contentFit="contain" />
      ) : (
        <ThemedText style={styles.serviceDetail}>Sin imagen de SUNARP en la respuesta</ThemedText>
      )}
      {hasImage ? (
        <ThemedText style={styles.personDetail}>Imagen del resultado SUNARP generada en la consulta.</ThemedText>
      ) : null}
      {onRefresh ? (
        <Pressable style={styles.secondaryButton} onPress={onRefresh}>
          <ThemedText style={styles.secondaryText}>Actualizar SUNARP</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function renderPersonServiceState(
  key: string,
  state?: ServiceState,
  onRefresh?: () => void
) {
  if (key === 'paquetes') {
    return (
      <View style={styles.soatContent}>
        <ThemedText style={styles.personDetail}>Paquetes PeruCheck</ThemedText>
        <ThemedText style={styles.personDetail}>
          Compra créditos para consultas vehiculares y de persona.
        </ThemedText>
        <Pressable style={styles.secondaryButton}>
          <ThemedText style={styles.secondaryText}>Ver planes</ThemedText>
        </Pressable>
      </View>
    );
  }
  if (!state || (!state.data && !state.loading && !state.error)) {
    return <ThemedText style={styles.personDetail}>Pulsa para consultar</ThemedText>;
  }
  if (state.loading) return <ActivityIndicator color={palette.primary} />;
  if (state.error) return <ThemedText style={styles.errorText}>{state.error}</ThemedText>;

  if (key === 'licencia' && state.parsed) {
    return (
      <View style={styles.soatContent}>
        <ThemedText style={styles.personDetail}>
          {state.parsed.nombres || 'Titular'} · {state.parsed.clase || 'Clase'}
        </ThemedText>
        <ThemedText style={styles.personDetail}>
          Vence: {formatDisplayDate(state.parsed.vencimiento)}
        </ThemedText>
        <View style={styles.metaRow}>
          {state.parsed.estado ? (
            <View style={styles.metaPill}>
              <ThemedText style={styles.metaText}>{state.parsed.estado}</ThemedText>
            </View>
          ) : null}
          {state.parsed.puntosFirmes ? (
            <View style={styles.metaPill}>
              <ThemedText style={styles.metaText}>Puntos: {state.parsed.puntosFirmes}</ThemedText>
            </View>
          ) : null}
          {state.parsed.infracciones ? (
            <View style={styles.metaPill}>
              <ThemedText style={styles.metaText}>Infracciones: {state.parsed.infracciones}</ThemedText>
            </View>
          ) : null}
          {state.parsed.graves ? (
            <View style={styles.metaPill}>
              <ThemedText style={styles.metaText}>Graves: {state.parsed.graves}</ThemedText>
            </View>
          ) : null}
          {state.parsed.muyGraves ? (
            <View style={styles.metaPill}>
              <ThemedText style={styles.metaText}>Muy graves: {state.parsed.muyGraves}</ThemedText>
            </View>
          ) : null}
        </View>
        {Array.isArray(state.parsed.tramites) && state.parsed.tramites.length ? (
          <View style={styles.listCard}>
            <ThemedText style={styles.personDetail}>Trámites recientes</ThemedText>
            {state.parsed.tramites.slice(0, 3).map((t: any, idx: number) => (
              <View key={idx} style={styles.rowBetween}>
                <ThemedText style={styles.personDetail}>
                  {t['TRAMITE'] || 'Trámite'} · {t['CATEGORIA'] || t['CATEGORÍA'] || ''}
                </ThemedText>
                <ThemedText style={styles.personDetail}>
                  {formatDisplayDate(t['FECHA VENCIMIENTO'] || t['VENCIMIENTO'])}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : null}
        {Array.isArray(state.parsed.bonificaciones) && state.parsed.bonificaciones.length ? (
          <View style={styles.listCard}>
            <ThemedText style={styles.personDetail}>Bonificaciones</ThemedText>
            {state.parsed.bonificaciones.slice(0, 3).map((b: any, idx: number) => (
              <View key={idx} style={styles.rowBetween}>
                <ThemedText style={styles.personDetail}>
                  Hasta {formatDisplayDate(b['VIGENTE HASTA'])}
                </ThemedText>
                <ThemedText style={styles.personDetail}>
                  Disp: {b['DISPONIBLE'] ?? 0} · Usado: {b['UTILIZADO'] ?? 0}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : null}
        {onRefresh ? (
          <Pressable style={styles.secondaryButton} onPress={onRefresh}>
            <ThemedText style={styles.secondaryText}>Actualizar licencia</ThemedText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (key === 'dniperu' && state.parsed) {
    return (
      <View style={styles.soatContent}>
        <ThemedText style={styles.personDetail}>
          {state.parsed.nombres} {state.parsed.apellidoPaterno} {state.parsed.apellidoMaterno}
        </ThemedText>
        {state.parsed.codigoVerificacion ? (
          <Badge label={`Verif: ${state.parsed.codigoVerificacion}`} tone={palette.primary} />
        ) : null}
        {state.parsed.direccion ? (
          <ThemedText style={styles.personDetail}>{state.parsed.direccion}</ThemedText>
        ) : null}
      </View>
    );
  }

  if (key === 'redam' && state.parsed) {
    return (
      <View style={styles.soatContent}>
        <ThemedText style={styles.personDetail}>Registros: {state.parsed.total ?? 0}</ThemedText>
        {Array.isArray(state.parsed.detalle) &&
          state.parsed.detalle.map((item: any, idx: number) => (
            <ThemedText key={idx} style={styles.personDetail}>
              • {JSON.stringify(item)}
            </ThemedText>
          ))}
        {onRefresh ? (
          <Pressable style={styles.secondaryButton} onPress={onRefresh}>
            <ThemedText style={styles.secondaryText}>Actualizar REDAM</ThemedText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return renderGenericServiceState(state, onRefresh);
}

function renderItvState(state?: ServiceState, onRefresh?: () => void) {
  if (!state || (!state.data && !state.loading && !state.error)) {
    return null;
  }
  if (state.loading) return <ActivityIndicator color={palette.primary} />;
  if (state.error) return <ThemedText style={styles.errorText}>{state.error}</ThemedText>;
  const parsed: ItvData | null | undefined = state.parsed;
  if (!parsed) return renderGenericServiceState(state, onRefresh);
  const tone =
    parsed.estado && parsed.estado.toLowerCase().includes('vig')
      ? palette.accent
      : parsed.estado && parsed.estado.toLowerCase().includes('venc')
        ? palette.danger
        : palette.warning;
  return (
    <View style={styles.soatContent}>
      <ThemedText style={styles.soatLine}>
        Vigencia: {formatDisplayDate(parsed.inicio)} - {formatDisplayDate(parsed.fin)}
      </ThemedText>
      {parsed.estado ? <Badge label={parsed.estado} tone={tone} /> : null}
      {parsed.centro ? <ThemedText style={styles.soatLine}>{parsed.centro}</ThemedText> : null}
      {onRefresh ? (
        <Pressable style={styles.secondaryButton} onPress={onRefresh}>
          <ThemedText style={styles.secondaryText}>Actualizar RTV</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function HomeScreen() {
  //responsive
  const { width } = useWindowDimensions();
  const contentMax = Math.min(280, width - 64);


  const router = useRouter();
  const { session } = useAuth();
  const [plateInput, setPlateInput] = useState(formatPlate(vehicle.plate));
  const formattedPlate = useMemo(() => formatPlate(plateInput), [plateInput]);
  const [personaDoc, setPersonaDoc] = useState(personSample.dni);
  const [mode, setMode] = useState<'vehiculo' | 'persona'>('vehiculo');
  const [serviceState, setServiceState] = useState<Record<string, ServiceState>>(() => {
    return Object.keys(serviceConfigs).reduce(
      (acc, key) => ({ ...acc, [key]: { loading: false, data: null, error: null } }),
      {} as Record<string, ServiceState>
    );
  });
  const [showOwnerDetails, setShowOwnerDetails] = useState(false);
  const sunarpData = serviceState['sunarp']?.parsed as SunarpData | null | undefined;
  const sunarpOwnersBase =
    (sunarpData?.coincidencias && sunarpData.coincidencias.length > 0
      ? sunarpData.coincidencias
      : sunarpData?.propietarios) || [];
  const sunarpFallbackOwner =
    sunarpOwnersBase.length === 0
      ? [
          sunarpData?.propietarioUsado?.trim(),
          sunarpData?.dniPropietario?.trim() &&
            `(${sunarpData?.dniPropietario?.trim()})`,
        ]
          .filter(Boolean)
          .join(' ')
          .trim()
      : '';
  const sunarpOwnerLines = (
    sunarpOwnersBase.length
      ? sunarpOwnersBase
          .map((owner) => {
            const name = owner.nombre?.trim();
            const doc = owner.documento?.trim();
            if (name && doc) return `${name} (${doc})`;
            return name || doc || null;
          })
          .filter(Boolean)
      : sunarpFallbackOwner
        ? [sunarpFallbackOwner]
        : []
  ) as string[];
  const sunarpOwnersCount = sunarpOwnerLines.length;
  const sunarpOwnerSummary = sunarpOwnerLines.slice(0, 2).join(' · ');
  const [ownerLookup, setOwnerLookup] = useState<OwnerLookupState>({
    loading: false,
    type: null,
    data: null,
    error: null,
    query: null,
  });
  const sunarpPrimaryOwner = sunarpOwnersBase[0];
  const sunarpPrimaryName =
    sunarpPrimaryOwner?.nombre?.trim() ||
    sunarpPrimaryOwner?.documento?.trim() ||
    sunarpFallbackOwner ||
    '';
  const sunarpPrimaryNameRaw = sunarpPrimaryOwner?.nombre?.trim() || '';
  const ownerNameClean = useMemo(
    () => normalizeOwnerName(sunarpPrimaryName),
    [sunarpPrimaryName]
  );
  const ownerType = ownerNameClean
    ? isCompanyName(ownerNameClean)
      ? 'empresa'
      : 'persona'
    : null;
  const ownerDisplayType = ownerLookup.type ?? ownerType;
  const ownerLookupTitle =
    ownerDisplayType === 'empresa'
      ? 'RUC'
      : ownerDisplayType === 'persona'
        ? 'DNI'
        : 'Propietario';
  const ownerLookupPrimary = ownerLookup.loading
    ? 'Consultando...'
    : ownerLookup.error
      ? ownerLookup.error
      : ownerDisplayType === 'empresa'
        ? ownerLookup.data?.ruc || 'Sin resultados'
        : ownerDisplayType === 'persona'
          ? ownerLookup.data?.dni || 'Sin resultados'
          : 'Consulta pendiente';
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const resetServiceStateForScope = useCallback(
    (scope: 'vehiculo' | 'persona') => {
      setServiceState((prev) => {
        const next = { ...prev };
        Object.keys(serviceConfigs).forEach((key) => {
          if (serviceConfigs[key]?.scope === scope) {
            next[key] = { loading: false, data: null, parsed: null, error: null, query: undefined };
          }
        });
        return next;
      });
    },
    []
  );

  const refreshUsage = useCallback(async () => {
    if (!session?.user?.id) return;
    setUsageLoading(true);
    try {
      const snapshot = await getUsageSnapshot(session.user.id);
      setUsage(snapshot);
    } finally {
      setUsageLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  useEffect(() => {
    if (!ownerNameClean) {
      setOwnerLookup({ loading: false, type: null, data: null, error: null, query: null });
      return;
    }
    const queryKey = `ambos:${ownerNameClean}`;
    let shouldFetch = true;
    setOwnerLookup((prev) => {
      if (prev.query === queryKey && (prev.data || prev.error) && !prev.loading) {
        shouldFetch = false;
        return prev;
      }
      return { loading: true, type: null, data: null, error: null, query: queryKey };
    });
    if (!shouldFetch) return;
    const controller = new AbortController();
    const run = async () => {
      try {
        const tryNames = [
          sunarpPrimaryNameRaw,
          ownerNameClean,
        ].filter((n, idx, arr) => n && arr.indexOf(n) === idx);
        const nombresSplit = splitPersonName(ownerNameClean);

        const sunatPromise = (async () => {
          for (const nombre of tryNames) {
            const res = await fetch(`${apiBase}/consulta-sunat-ruc-nombre`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nombre }),
              signal: controller.signal,
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(`Error ${res.status}: ${text || 'sin detalle'}`);
            }
            const json = await res.json();
            const result = Array.isArray(json?.resultados) ? json.resultados[0] : null;
            if (result) return result;
          }
          return null;
        })();

        const dniPromise = (async () => {
          if (!nombresSplit) return null;
          const res = await fetch(`${apiBase}/consulta-dni-nombres`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nombresSplit),
            signal: controller.signal,
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Error ${res.status}: ${text || 'sin detalle'}`);
          }
          const json = await res.json();
          return Array.isArray(json?.resultados) ? json.resultados[0] : null;
        })();

        const [sunatResult, dniResult] = await Promise.all([sunatPromise, dniPromise]);

        if (sunatResult) {
          setOwnerLookup({
            loading: false,
            type: 'empresa',
            data: {
              ruc: sunatResult?.ruc,
              razon_social: sunatResult?.razon_social,
              ubicacion: sunatResult?.ubicacion,
              estado: sunatResult?.estado,
            },
            error: null,
            query: queryKey,
          });
          return;
        }

        if (dniResult) {
          setOwnerLookup({
            loading: false,
            type: 'persona',
            data: {
              dni: dniResult?.dni,
              ap_paterno: dniResult?.ap_paterno,
              ap_materno: dniResult?.ap_materno,
              nombres: dniResult?.nombres,
              fecha_nacimiento: dniResult?.fecha_nacimiento,
              ubigeo_domicilio: dniResult?.ubigeo_domicilio,
              direccion: dniResult?.direccion,
            },
            error: null,
            query: queryKey,
          });
          return;
        }

        setOwnerLookup({
          loading: false,
          type: null,
          data: null,
          error: 'Sin resultados por nombres.',
          query: queryKey,
        });
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setOwnerLookup({
          loading: false,
          type: null,
          data: null,
          error: err?.message ?? 'Error consultando.',
          query: queryKey,
        });
      }
    };
    run();
    return () => controller.abort();
  }, [ownerNameClean, sunarpPrimaryNameRaw]);

  const hasCredits = useCallback(() => {
    if (!usage) return true;
    if (usage.creditsRemaining == null) return true;
    return usage.creditsRemaining > 0;
  }, [usage]);

  const guardCredits = useCallback(() => {
    if (hasCredits()) return true;
    Alert.alert(
      'Sin créditos',
      'Se agotaron las consultas de tu plan. Compra un paquete para seguir consultando.'
    );
    return false;
  }, [hasCredits]);

  const handleConsult = () => {
    if (!formattedPlate || formattedPlate.length < 7) {
      Alert.alert('Placa incompleta', 'Completa los 6 caracteres para continuar.');
      return;
    }
    if (!guardCredits()) return;
    Keyboard.dismiss();
    setShowOwnerDetails(false);
    setOwnerLookup({ loading: false, type: null, data: null, error: null, query: null });
    resetServiceStateForScope('vehiculo');
    Haptics.selectionAsync();
    fetchAllVehicleServices();
  };

  const handleService = (key: string, title: string) => {
    Haptics.selectionAsync();
    router.push({ pathname: '/modal', params: { view: key, plate: formattedPlate, title, scope: mode } });
  };

  const handleAction = (action: string) => {
    Haptics.selectionAsync();
    if (action === 'paquetes') {
      router.push('/(tabs)/plans');
      return;
    }
    router.push({ pathname: '/modal', params: { action, plate: formattedPlate, scope: 'vehiculo' } });
  };

  const setService = (key: string, partial: Partial<ServiceState>) => {
    setServiceState((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { loading: false, data: null, error: null }), ...partial },
    }));
  };

  const fetchService = async (key: string, value?: string, opts?: { force?: boolean }) => {
    const config = serviceConfigs[key];
    if (!config) return;
    if (!guardCredits()) return;
    const queryValue =
      value ??
      (config.field === 'placa' ? formattedPlate.replace('-', '') : formatDni(personaDoc));
    if (!queryValue || queryValue.length < (config.field === 'placa' ? 6 : 8)) {
      Alert.alert(
        config.field === 'placa' ? 'Placa incompleta' : 'DNI incompleto',
        config.field === 'placa'
          ? 'Completa la placa para consultar.'
          : 'Ingresa los 8 dígitos del DNI.'
      );
      return;
    }
    const current = serviceState[key];
    if (
      !opts?.force &&
      current &&
      current.query === queryValue &&
      current.data &&
      !current.error &&
      !current.loading
    ) {
      // Ya tenemos datos para esta placa; evitar costo extra.
      return;
    }
    if (current?.loading) return;

    const startedAt = Date.now();
    let data: any = null;
    let parsed: any = null;
    let success = false;
    let errorMessage: string | null = null;
    let requestPayload: Record<string, any> = { [config.field]: queryValue };

    setService(key, { loading: true, error: null, query: queryValue });
    Haptics.selectionAsync();
    try {
      requestPayload = {
        [config.field]: queryValue,
        ...(key === 'sunarp' ? { extraer_propietarios: true } : {}),
      };
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Error ${res.status}: ${text || 'sin detalle'}`);
      }
      data = await res.json();
      parsed = config.parser ? config.parser(data?.resultado_crudo ?? '', data) : null;
      if (key === 'sunarp') {
        parsed = await enrichSunarpWithDni(parsed);
      }
      success = true;
      setService(key, {
        loading: false,
        data,
        parsed,
        error: null,
        query: queryValue,
        fetchedAt: Date.now(),
      });
    } catch (err: any) {
      errorMessage = err?.message ?? 'Error consultando';
      setService(key, {
        loading: false,
        data: null,
        parsed: null,
        error: errorMessage,
        query: queryValue,
        fetchedAt: Date.now(),
      });
    } finally {
      if (session?.user?.id) {
        await registerConsulta({
          userId: session.user.id,
          serviceKey: key,
          placa: config.field === 'placa' ? queryValue : null,
          dni: config.field === 'dni' ? queryValue : null,
          payload: requestPayload,
          respuesta: data,
          resumen:
            config.field === 'placa'
              ? `${key.toUpperCase()} ${formattedPlate}`
              : `${key.toUpperCase()} ${queryValue}`,
          success,
          errorCode: success ? null : errorMessage,
          durationMs: Date.now() - startedAt,
          rawPath: config.endpoint,
        });
        await refreshUsage();
      }
    }
  };

  const fetchAllVehicleServices = async () => {
    const keys = Object.keys(serviceConfigs);
    await Promise.all(
      keys
        .filter((k) => serviceConfigs[k].scope === 'vehiculo')
        .map((k) => fetchService(k, formattedPlate.replace('-', ''), { force: true }))
    );
  };

  const fetchAllPersonServices = async () => {
    const dni = formatDni(personaDoc);
    await Promise.all(
      Object.keys(serviceConfigs)
        .filter((k) => serviceConfigs[k].scope === 'persona')
        .map((k) => fetchService(k, dni, { force: true }))
    );
  };

  const handlePersonConsult = () => {
    const doc = formatDni(personaDoc);
    if (doc.length !== 8) {
      Alert.alert('Documento incompleto', 'Ingresa los 8 dígitos del DNI.');
      return;
    }
    if (!guardCredits()) return;
    Keyboard.dismiss();
    resetServiceStateForScope('persona');
    Haptics.selectionAsync();
    fetchAllPersonServices();
  };

  return (

    <ParallaxScrollView
      headerBackgroundColor={{ light: palette.surface, dark: palette.surface }}
      headerImage={
        <View style={styles.headerHero}>
          <Image
            style={styles.heroLogo}
            contentFit="contain"
          />
          <View style={styles.headerCopy}>
            <ThemedText style={styles.heroOverline}>CIVICAR · Reportes</ThemedText>
            <ThemedText type="title" style={[styles.heroTitle, { maxWidth: contentMax }]}>
              Reportes móviles de vehículos y personas
            </ThemedText>
            <ThemedText style={[styles.heroSubtitle, { maxWidth: contentMax }]}>
              Consulta vehículos y personas con datos oficiales (SUNARP, SAT, SOAT, MTC, REDAM y más) en tu app PeruCheck.
            </ThemedText>
          </View>
        </View>
      }>
      <ThemedView style={styles.card}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Créditos y plan</ThemedText>
          <Badge label={usage?.plan?.name ?? 'Free'} tone={hasCredits() ? palette.accent : palette.danger} />
        </View>
        <ThemedText style={styles.sectionHint}>
          {usageLoading
            ? 'Actualizando créditos…'
            : usage
              ? `${usage.creditsRemaining != null ? `${usage.creditsRemaining} restantes` : 'Créditos ilimitados'}${usage.validUntil ? ` · vence ${formatExpiry(usage.validUntil)}` : ''
              }`
              : 'Sin información de créditos'}
        </ThemedText>
        <View style={styles.usageRow}>
          <Pressable style={styles.secondaryButton} onPress={() => handleAction('paquetes')}>
            <ThemedText style={styles.secondaryText}>Comprar paquetes</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
      <ThemedView style={styles.card}>
        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modePill, mode === 'vehiculo' && styles.modePillActive]}
            onPress={() => setMode('vehiculo')}>
            <MaterialIcons
              name="directions-car-filled"
              size={20}
              color={mode === 'vehiculo' ? '#fff' : '#314158'}
            />
            <ThemedText
              style={[
                styles.modeText,
                { color: mode === 'vehiculo' ? '#fff' : '#314158' },
              ]}>
              Vehículos
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.modePill, mode === 'persona' && styles.modePillActive]}
            onPress={() => setMode('persona')}>
            <MaterialIcons
              name="person"
              size={20}
              color={mode === 'persona' ? '#fff' : '#314158'}
            />
            <ThemedText
              style={[
                styles.modeText,
                { color: mode === 'persona' ? '#fff' : '#314158' },
              ]}>
              Personas
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>

      {mode === 'vehiculo' ? (
        <>
          <ThemedView style={styles.card}>
            <PlateInputCard
              value={formattedPlate}
              onChange={(val) => setPlateInput(val)}
              onSubmit={handleConsult}
              onSelectPlate={(plate) => setPlateInput(formatPlate(plate))}
            />
            <View style={styles.summaryRow}>

              <Pressable
                style={[styles.summaryBlock, { backgroundColor: palette.surfaceAlt }]}
                disabled={!sunarpOwnersCount}
                onPress={() => setShowOwnerDetails((prev) => !prev)}>
                <View style={styles.summaryIconBoxSecondary}>
                  <MaterialIcons name="verified" size={20} color={palette.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.summaryLabel}>Propietario(s)</ThemedText>
                  <ThemedText
                    style={[
                      styles.summaryValue,
                      { color: sunarpOwnerSummary ? '#070707' : palette.muted },
                    ]}>
                    {sunarpOwnerSummary || 'Consulta pendiente'}
                  </ThemedText>
                  {showOwnerDetails && sunarpOwnerLines.length ? (
                    <View style={styles.ownerList}>
                      {sunarpOwnerLines.map((line, idx) => (
                        <ThemedText key={idx} style={styles.ownerLine}>
                          • {line}
                        </ThemedText>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Pressable>
              <View style={[styles.summaryBlock, { backgroundColor: palette.surfaceAlt }]}>
                <View style={styles.summaryIconBox}>
                  <MaterialIcons
                    name={
                      ownerType === 'empresa'
                        ? 'business'
                        : ownerType === 'persona'
                          ? 'person'
                          : 'info'
                    }
                    size={20}
                    color={palette.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.summaryLabel}>{ownerLookupTitle}</ThemedText>
                  <ThemedText
                    style={[
                      styles.summaryValue,
                      { color: ownerLookupPrimary ? '#070707' : palette.muted },
                    ]}>
                  {ownerLookupPrimary}
                </ThemedText>
                {ownerLookup.loading ? (
                  <ActivityIndicator color={palette.primary} style={{ marginTop: 4 }} />
                ) : null}
              </View>
            </View>
            </View>
          </ThemedView>

          <ThemedView style={styles.card}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Entidades control</ThemedText>
              <ThemedText style={styles.sectionHint}>
                SUTRAN, SUNARP, SAT Lima/Callao, SOAT, RT
              </ThemedText>
            </View>
            <View style={{ marginTop: 12 }}>
              {vehicleServices.map((service) => (
                <Pressable
                  key={service.key}
                  style={styles.serviceCard}
                  accessibilityRole="button"
                  onPress={() =>
                    serviceConfigs[service.key]
                      ? fetchService(service.key, undefined, { force: false })
                      : handleService(service.key, service.title)
                  }>
                  <View style={styles.serviceHeader}>
                    <ThemedText style={styles.serviceTitle}>{service.title}</ThemedText>
                    <Badge label={service.status} tone={service.statusColor} />
                  </View>
                  <ThemedText style={styles.serviceDetail}>
                    {service.key === 'sunarp' && sunarpData
                      ? `Propietarios: ${sunarpOwnersCount}`
                      : service.detail}
                  </ThemedText>
                  {service.key === 'soat'
                    ? renderSoatState(serviceState['soat'], () =>
                      fetchService('soat', undefined, { force: true })
                    )
                    : service.key === 'itv'
                      ? renderItvState(serviceState['itv'], () =>
                        fetchService('itv', undefined, { force: true })
                      )
                      : service.key === 'sunarp'
                        ? renderSunarpState(serviceState['sunarp'], () =>
                          fetchService('sunarp', undefined, { force: true })
                        )
                        : renderGenericServiceState(serviceState[service.key], () =>
                          fetchService(service.key, undefined, { force: true })
                        )}
                </Pressable>
              ))}
            </View>
          </ThemedView>

        </>
      ) : (
        <>
          <ThemedView style={styles.card}>
            <PersonInputCard
              value={personaDoc}
              onChange={setPersonaDoc}
              onSubmit={handlePersonConsult}
              onSelectDoc={(doc) => setPersonaDoc(formatDni(doc))}
            />
          </ThemedView>

          <ThemedView style={styles.card}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Panel personas</ThemedText>
              <ThemedText style={styles.sectionHint}>DNI, licencia MTC, REDAM, recompensas</ThemedText>
            </View>
            <View style={styles.personGrid}>
              {personChecks.map((person) => (
                <Pressable
                  key={person.key}
                  style={styles.personCard}
                  onPress={() =>
                    serviceConfigs[person.key]
                      ? fetchService(person.key, formatDni(personaDoc), { force: false })
                      : handleService(person.key, person.title)
                  }>
                  <View style={styles.personHeader}>
                    <ThemedText style={styles.personTitle}>{person.title}</ThemedText>
                    <Badge label={person.status} tone={person.statusColor} />
                  </View>
                  {renderPersonServiceState(
                    person.key,
                    serviceState[person.key],
                    () => fetchService(person.key, formatDni(personaDoc), { force: true })
                  )}
                </Pressable>
              ))}
            </View>
          </ThemedView>
        </>
      )}
    </ParallaxScrollView>

  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingVertical: 18,      // 👈 solo arriba y abajo
    paddingHorizontal: 10,    // 👈 menos espacio lateral
    gap: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,

    // sombra suave (iOS)
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },

    // sombra suave (Android)
    elevation: 2,
  },

  heroTitle: {
    //maxWidth: 280,
    lineHeight: 34,
    fontFamily: Fonts.rounded,
    color: palette.text,
  },
  heroSubtitle: {
    color: palette.subtext,
    //maxWidth: 360,
  },
  heroOverline: {
    color: palette.accent,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: Fonts.rounded,
  },

  headerHero: {
    flex: 1,
    padding: 32,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#ffffff'
  },

  heroLogo: {
    width: 96,
    height: 96,
    position: 'absolute',
    bottom: 16,
    right: 18,
    opacity: 0.08,
  },
  headerCopy: {
    flex: 1,
    gap: 8,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 10,
  },
  modePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceAlt,
  },

  modePillActive: {
    backgroundColor: palette.primary,   // 👈 sólido azul
    borderColor: palette.primary,
  },

  modeText: {
    fontWeight: '700',
    color: palette.text,
  },

  inputCard: {
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  inputLabel: {
    color: palette.muted,
    fontSize: 13,
    letterSpacing: 0.2,
    fontWeight: '600',
  },
  inputCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  plateBoxes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plateBox: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plateBoxText: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  plateDashText: {
    color: palette.muted,
    fontWeight: '800',
    fontSize: 18,
  },

  plateDash: {
    width: 18,
    alignItems: 'center',
  },
  inputOverlayWrapper: {
    position: 'relative',
  },
  inputOverlay: {
    position: 'absolute',
    inset: 0,
    opacity: 0,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,

    shadowColor: palette.primary,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  quickChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipText: {
    color: palette.text,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  inputHint: {
    color: '#94A3B8',
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: 'column',
    gap: 12,
  },
  summaryBlock: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: 'row',
    gap: 12,
  },

  summaryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#0E8BFF22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryIconBoxSecondary: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#0CD3A222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#232426',
    fontSize: 13,
  },
  summaryValue: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',     // 👈 clave
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.text,
  },
  sectionHint: {
    color: palette.subtext,
  },
  usageMeta: {
    color: palette.subtext,
  },

  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  fieldsGrid: {
    gap: 10,
  },
  fieldRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  fieldLabel: {
    color: '#94A3B8',
    fontSize: 13,
  },
  fieldValue: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    flexWrap: 'wrap',
  },
  serviceCard: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 8,
    marginBottom: 14,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceTitle: {
    fontWeight: '700',
    color: palette.text,
  },
  serviceDetail: {
    color: palette.subtext
  },
  serviceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  serviceLink: {
    color: palette.primary,
    fontWeight: '600',
  },
  personGrid: {
    flexDirection: 'column',
    gap: 12,
  },
  personCard: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 8,
  },
  personHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  personTitle: {
    color: palette.text,
    fontWeight: '700',
  },
  personDetail: {
    color: palette.subtext,
  },
  personFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerRow: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#0B1426',
    borderWidth: 1,
    borderColor: '#162042',
    gap: 2,
  },
  ownerName: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  ownerList: {
    marginTop: 4,
    gap: 2,
  },
  ownerLine: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  ownerMeta: {
    color: '#94A3B8',
    fontSize: 13,
  },
  ownerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#162042',
    backgroundColor: '#0E1931',
  },
  metaText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  listCard: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#0B1426',
    borderWidth: 1,
    borderColor: '#162042',
    gap: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  soatContent: {
    gap: 6,
    marginTop: 4,
  },
  soatLine: {
    color: palette.text,
    fontWeight: '500',
  },
  soatBadges: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    width: '55%',
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    backgroundColor: '#0E1931',
  },
  secondaryText: {
    color: '#E5E7EB',
    fontWeight: '700',
  },
  errorText: {
    color: palette.danger,
    fontWeight: '700',
  },
  sunarpImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginTop: 8,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: '#162042',
    minWidth: '45%',
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#0E8BFF22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    color: '#E5E7EB',
    fontWeight: '600',
  },
  timeline: {
    gap: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: palette.primary,
    backgroundColor: '#0B1021',
  },
  timelineTitle: {
    color: '#E5E7EB',
    fontWeight: '700',
  },
  timelineTime: {
    color: '#94A3B8',
    fontSize: 13,
  },
});
