# perucheck

## Pagos con Mercado Pago (planes)

Esta app usa Mercado Pago Checkout Pro a través de **Supabase Edge Functions**. Se implementaron:

- `mp-create-preference`: crea la preferencia y devuelve `initPoint`.
- `mp-webhook`: valida el pago y acredita el plan en `user_credits`.

### Variables requeridas (Supabase Secrets)

Configura estos secretos en Supabase:

- `MP_ACCESS_TOKEN`
- `MP_WEBHOOK_URL` (ej. `https://<project-ref>.functions.supabase.co/mp-webhook`)
- `MP_ENV` (`prod` o `sandbox`)
- `MP_CURRENCY_ID` (por defecto `PEN`)

### Despliegue de funciones

```
supabase functions deploy mp-create-preference
supabase functions deploy mp-webhook
```

### Migración requerida

Se agregó `supabase/migrations/20260309_0001_mp_payments.sql` para registrar pagos y evitar duplicados.
