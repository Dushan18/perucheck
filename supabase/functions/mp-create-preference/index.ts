import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { corsHeaders } from '../_shared/cors.ts';

type CreatePreferenceBody = {
  planId?: string;
  returnUrl?: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
  const mpWebhookUrl = Deno.env.get('MP_WEBHOOK_URL') ?? '';
  const mpEnv = (Deno.env.get('MP_ENV') ?? 'prod').toLowerCase();
  const mpCurrencyId = Deno.env.get('MP_CURRENCY_ID') ?? 'PEN';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return json({ error: 'Supabase no configurado' }, 500);
  }
  if (!mpAccessToken) {
    return json({ error: 'Mercado Pago no configurado' }, 500);
  }

  let payload: CreatePreferenceBody = {};
  try {
    payload = (await req.json()) ?? {};
  } catch {
    return json({ error: 'Body inválido' }, 400);
  }

  const planId = payload.planId?.trim();
  const returnUrl = payload.returnUrl?.trim();
  if (!planId || !returnUrl) {
    return json({ error: 'planId y returnUrl son obligatorios' }, 400);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: 'No autorizado' }, 401);
  }
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: plan, error: planError } = await admin
    .from('plans')
    .select('id, name, price_pen, total_consultas, duration_days')
    .eq('id', planId)
    .maybeSingle();

  if (planError || !plan) {
    return json({ error: 'Plan no encontrado' }, 404);
  }

  const planPrice = Number(plan.price_pen ?? 0);
  if (!planPrice || planPrice <= 0) {
    return json({ error: 'El plan seleccionado no requiere pago' }, 400);
  }

  const preferenceBody = {
    items: [
      {
        title: plan.name,
        quantity: 1,
        unit_price: planPrice,
        currency_id: mpCurrencyId,
      },
    ],
    back_urls: {
      success: returnUrl,
      pending: returnUrl,
      failure: returnUrl,
    },
    auto_return: 'approved',
    notification_url: mpWebhookUrl || undefined,
    metadata: {
      plan_id: plan.id,
      user_id: userId,
      total_consultas: plan.total_consultas,
      duration_days: plan.duration_days,
    },
    external_reference: `${userId}:${plan.id}`,
  };

  const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mpAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preferenceBody),
  });

  if (!mpRes.ok) {
    const errorText = await mpRes.text().catch(() => '');
    return json(
      { error: `Mercado Pago error ${mpRes.status}: ${errorText || 'sin detalle'}` },
      502
    );
  }

  const pref = await mpRes.json();
  const initPoint =
    mpEnv === 'sandbox' ? pref?.sandbox_init_point ?? pref?.init_point : pref?.init_point;

  if (!initPoint) {
    return json({ error: 'Respuesta de Mercado Pago inválida' }, 502);
  }

  return json({
    initPoint,
    preferenceId: pref?.id ?? null,
    sandbox: mpEnv === 'sandbox',
  });
});
