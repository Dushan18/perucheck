import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { corsHeaders } from '../_shared/cors.ts';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const parsePaymentId = async (req: Request) => {
  const url = new URL(req.url);
  const search = url.searchParams;

  let body: any = null;
  if (req.method !== 'GET') {
    body = await req.json().catch(() => null);
  }

  const topic =
    search.get('topic') ||
    search.get('type') ||
    body?.type ||
    body?.topic ||
    body?.action;

  const id =
    search.get('id') ||
    search.get('data.id') ||
    body?.data?.id ||
    body?.id ||
    null;

  return { topic, id, rawBody: body };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN') ?? '';

  if (!supabaseUrl || !supabaseServiceKey || !mpAccessToken) {
    return json({ error: 'Configuración incompleta' }, 500);
  }

  const { topic, id } = await parsePaymentId(req);
  if (!id) {
    return json({ ok: true, ignored: true });
  }

  if (topic && !String(topic).includes('payment')) {
    return json({ ok: true, ignored: true, topic });
  }

  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${mpAccessToken}` },
  });

  if (!paymentRes.ok) {
    const errorText = await paymentRes.text().catch(() => '');
    return json(
      { error: `No se pudo validar el pago: ${paymentRes.status} ${errorText}` },
      502
    );
  }

  const payment = await paymentRes.json();
  const status = payment?.status;
  const metadata = payment?.metadata ?? {};
  const userId = metadata?.user_id ?? null;
  const planId = metadata?.plan_id ?? null;
  const amount = Number(payment?.transaction_amount ?? 0);
  const currencyId = payment?.currency_id ?? null;

  if (status !== 'approved') {
    return json({ ok: true, status });
  }

  if (!userId || !planId) {
    return json({ error: 'Pago sin metadata suficiente' }, 400);
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);

  const { data: existing } = await admin
    .from('mp_payments')
    .select('id')
    .eq('payment_id', String(id))
    .maybeSingle();

  if (existing) {
    return json({ ok: true, status: 'duplicate' });
  }

  const { data: plan, error: planError } = await admin
    .from('plans')
    .select('id, total_consultas, duration_days, price_pen')
    .eq('id', planId)
    .maybeSingle();

  if (planError || !plan) {
    return json({ error: 'Plan no encontrado' }, 404);
  }

  const planPrice = Number(plan.price_pen ?? 0);
  if (planPrice > 0 && amount > 0 && Math.abs(planPrice - amount) > 0.01) {
    return json({ error: 'Monto no coincide con plan' }, 400);
  }

  await admin.from('mp_payments').insert({
    payment_id: String(id),
    user_id: userId,
    plan_id: planId,
    status,
    amount,
    currency_id: currencyId,
    metadata,
  });

  const duration = typeof plan.duration_days === 'number' ? plan.duration_days : 30;
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + duration);

  await admin.from('user_credits').insert({
    user_id: userId,
    plan_id: planId,
    total_consultas: plan.total_consultas ?? 0,
    consultas_usadas: 0,
    valid_until: validUntil.toISOString(),
  });

  return json({ ok: true, status: 'credited' });
});
