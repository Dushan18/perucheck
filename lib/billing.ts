import { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type PlanRow = {
  id: string;
  name: string;
  created_at: string | null;
  total_consultas: number | null;
  duration_days: number | null;
  price_pen: number | null;
};

export type PlanOption = PlanRow & {
  tag?: string;
  subtitle?: string;
};

export type UserCreditRow = {
  id: string;
  user_id: string;
  plan_id: string;
  total_consultas: number;
  consultas_usadas: number;
  valid_from: string | null;
  valid_until: string;
  created_at: string | null;
};

export type UsageSnapshot = {
  plan: PlanRow | null;
  credit: UserCreditRow | null;
  creditsTotal: number | null;
  creditsUsed: number;
  creditsRemaining: number | null;
  validUntil: string | null;
};

export type ConsultaTipo =
  | 'sunarp'
  | 'soat'
  | 'licencia'
  | 'vehicular_full'
  | 'papeletas'
  | 'redam';

const serviceTipoMap: Record<string, ConsultaTipo> = {
  soat: 'soat',
  itv: 'vehicular_full',
  sunarp: 'sunarp',
  sutran: 'papeletas',
  satlima: 'papeletas',
  satcallao: 'papeletas',
  licencia: 'licencia',
  dniperu: 'vehicular_full',
  redam: 'redam',
};

export const mapServiceToConsultaTipo = (serviceKey: string): ConsultaTipo => {
  return serviceTipoMap[serviceKey] ?? 'vehicular_full';
};

export async function ensureUserBootstrap(session: Session | null) {
  if (!supabase || !session?.user) return;
  const { id: userId, user_metadata: meta, email } = session.user;

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profile && !profileError) {
      await supabase.from('profiles').insert({
        user_id: userId,
        full_name: meta?.full_name ?? meta?.name ?? email ?? 'Usuario',
        phone: meta?.phone_number ?? meta?.phone ?? null,
      });
    }
  } catch (error) {
    console.warn('ensureUserBootstrap error', error);
  }
}

export async function getPlans(): Promise<PlanOption[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('plans')
    .select('id, name, created_at, total_consultas, duration_days, price_pen')
    .order('price_pen', { ascending: true });
  return (data as PlanOption[] | null) ?? [];
}

export async function changePlan(userId: string, planId: string) {
  if (!supabase || !userId) return;
  const { data: plan } = await supabase
    .from('plans')
    .select('id, total_consultas, duration_days')
    .eq('id', planId)
    .maybeSingle();

  if (!plan) return;

  const duration = typeof plan.duration_days === 'number' ? plan.duration_days : 30;
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + duration);

  await supabase.from('user_credits').insert({
    user_id: userId,
    plan_id: planId,
    total_consultas: plan.total_consultas ?? 0,
    consultas_usadas: 0,
    valid_until: validUntil.toISOString(),
  });
}

export async function getUsageSnapshot(userId?: string): Promise<UsageSnapshot> {
  if (!supabase || !userId) {
    return {
      plan: null,
      credit: null,
      creditsTotal: null,
      creditsUsed: 0,
      creditsRemaining: null,
      validUntil: null,
    };
  }

  const nowIso = new Date().toISOString();
  const { data: credit } = await supabase
    .from('user_credits')
    .select('id, user_id, plan_id, total_consultas, consultas_usadas, valid_from, valid_until, created_at')
    .eq('user_id', userId)
    .gte('valid_until', nowIso)
    .order('valid_until', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let plan: PlanRow | null = null;
  if (credit?.plan_id) {
    const { data } = await supabase
      .from('plans')
      .select('id, name, created_at, total_consultas, duration_days, price_pen')
      .eq('id', credit.plan_id)
      .maybeSingle();
    plan = (data as PlanRow | null) ?? null;
  }

  const creditsTotal = credit?.total_consultas ?? plan?.total_consultas ?? null;
  const creditsUsed = credit?.consultas_usadas ?? 0;
  const hasCreditRow = Boolean(credit);
  const creditsRemaining =
    creditsTotal != null ? Math.max(0, creditsTotal - creditsUsed) : hasCreditRow ? null : 0;
  const validUntil = credit?.valid_until ?? null;

  return {
    plan,
    credit: (credit as UserCreditRow | null) ?? null,
    creditsTotal,
    creditsUsed,
    creditsRemaining,
    validUntil,
  };
}

type RegisterConsultaInput = {
  userId: string;
  serviceKey: string;
  placa?: string | null;
  dni?: string | null;
  payload?: any;
  respuesta?: any;
  resumen?: string | null;
  success?: boolean;
  errorCode?: string | null;
  durationMs?: number | null;
  rawPath?: string | null;
};

export async function registerConsulta(input: RegisterConsultaInput) {
  if (!supabase || !input.userId) return;
  const tipo = mapServiceToConsultaTipo(input.serviceKey);
  const row = {
    user_id: input.userId,
    tipo,
    placa: input.placa ? input.placa.toUpperCase() : null,
    dni: input.dni ?? null,
    payload: input.payload ?? null,
    respuesta: input.respuesta ?? null,
    resumen: input.resumen ?? `${input.serviceKey} ${input.placa ?? input.dni ?? ''}`.trim(),
    success: input.success ?? true,
    error_code: input.errorCode ?? null,
    duracion_ms: input.durationMs ?? null,
    raw_path: input.rawPath ?? null,
  };

  try {
    const { data: consumeOk, error: consumeError } = await supabase.rpc('consume_credit');
    if (consumeError) {
      console.warn('consume_credit error', consumeError);
    } else if (consumeOk === false) {
      console.warn('consume_credit denied; skipping consulta insert');
      return;
    }

    await supabase.from('consultas').insert(row);
  } catch (error) {
    console.warn('registerConsulta error', error);
  }
}
