-- Automatic reply for messages received by each tenant's connected WhatsApp.
-- The persistent connector is the only caller allowed to enqueue these replies.

alter table public.tenant_whatsapp_settings
  add column if not exists inbound_auto_reply_enabled boolean not null default false,
  add column if not exists inbound_auto_reply_cooldown_minutes integer not null default 0,
  add column if not exists inbound_auto_reply_template text not null default
    'Olá! 👋 Recebemos sua mensagem no(a) *{salao}*.

Para consultar horários e fazer seu agendamento, acesse:
{link_agendamento}

Se precisar de ajuda, nossa equipe responderá por aqui.';

alter table public.tenant_whatsapp_settings
  drop constraint if exists tenant_whatsapp_settings_inbound_auto_reply_cooldown_check;

alter table public.tenant_whatsapp_settings
  add constraint tenant_whatsapp_settings_inbound_auto_reply_cooldown_check
  check (inbound_auto_reply_cooldown_minutes between 0 and 43200);

comment on column public.tenant_whatsapp_settings.inbound_auto_reply_enabled is
  'Envia resposta automática quando uma mensagem individual chega ao WhatsApp conectado da loja.';
comment on column public.tenant_whatsapp_settings.inbound_auto_reply_cooldown_minutes is
  'Intervalo mínimo entre respostas automáticas para o mesmo telefone. Zero responde a cada nova mensagem.';
comment on column public.tenant_whatsapp_settings.inbound_auto_reply_template is
  'Modelo da resposta automática de entrada. Variáveis: {salao} e {link_agendamento}.';

alter table public.whatsapp_message_queue
  drop constraint if exists whatsapp_message_queue_event_type_check;

alter table public.whatsapp_message_queue
  add constraint whatsapp_message_queue_event_type_check
  check (
    event_type in (
      'client_registered',
      'appointment_created',
      'appointment_reminder',
      'appointment_cancelled',
      'appointment_rescheduled',
      'subscription_payment_reminder',
      'subscription_payment_confirmed',
      'subscription_overdue',
      'platform_trial_reminder',
      'platform_billing_reminder',
      'platform_billing_payment_confirmed',
      'platform_billing_overdue',
      'inbound_auto_reply',
      'test'
    )
  );

create index if not exists whatsapp_queue_inbound_reply_cooldown_idx
  on public.whatsapp_message_queue (
    tenant_id,
    recipient_phone,
    created_at desc
  )
  where event_type = 'inbound_auto_reply'
    and status in ('pending', 'processing', 'sent');

create or replace function public.enqueue_whatsapp_inbound_auto_reply(
  p_tenant_id uuid,
  p_recipient_phone text,
  p_provider_message_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings record;
  v_tenant record;
  v_phone text := regexp_replace(coalesce(p_recipient_phone, ''), '[^0-9]', '', 'g');
  v_message_id text := left(trim(coalesce(p_provider_message_id, '')), 500);
  v_idempotency_key text;
  v_queue_id uuid;
begin
  if p_tenant_id is null or v_message_id = '' then
    return jsonb_build_object('enqueued', false, 'reason', 'invalid_message');
  end if;

  v_phone := regexp_replace(v_phone, '^00+', '');
  if length(v_phone) in (10, 11) then
    v_phone := '55' || v_phone;
  end if;
  if length(v_phone) not in (12, 13) or left(v_phone, 2) <> '55' then
    return jsonb_build_object('enqueued', false, 'reason', 'invalid_phone');
  end if;

  -- Serializes rapid messages from the same contact so the cooldown check is atomic.
  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || v_phone, 0)
  );

  select
    settings.enabled,
    settings.session_id,
    settings.inbound_auto_reply_enabled,
    settings.inbound_auto_reply_cooldown_minutes,
    settings.inbound_auto_reply_template
  into v_settings
  from public.tenant_whatsapp_settings as settings
  where settings.tenant_id = p_tenant_id;

  if not found or not coalesce(v_settings.enabled, false) then
    return jsonb_build_object('enqueued', false, 'reason', 'automation_disabled');
  end if;
  if not coalesce(v_settings.inbound_auto_reply_enabled, false) then
    return jsonb_build_object('enqueued', false, 'reason', 'auto_reply_disabled');
  end if;

  select tenant.name, tenant.slug, tenant.status
  into v_tenant
  from public.tenants as tenant
  where tenant.id = p_tenant_id;

  if not found or coalesce(v_tenant.status, 'active') = 'blocked' then
    return jsonb_build_object('enqueued', false, 'reason', 'tenant_unavailable');
  end if;

  if coalesce(v_settings.inbound_auto_reply_cooldown_minutes, 0) > 0
     and exists (
       select 1
       from public.whatsapp_message_queue as recent
       where recent.tenant_id = p_tenant_id
         and recent.sender_scope = 'tenant'
         and recent.event_type = 'inbound_auto_reply'
         and recent.recipient_phone = v_phone
         and recent.status in ('pending', 'processing', 'sent')
         and coalesce(recent.sent_at, recent.created_at) >=
           now() - make_interval(mins => v_settings.inbound_auto_reply_cooldown_minutes)
     ) then
    return jsonb_build_object('enqueued', false, 'reason', 'cooldown');
  end if;

  v_idempotency_key := 'inbound-auto-reply:' || p_tenant_id::text || ':' || v_message_id;

  insert into public.whatsapp_message_queue (
    tenant_id,
    session_id,
    sender_scope,
    event_type,
    recipient_kind,
    recipient_phone,
    template,
    payload,
    status,
    scheduled_for,
    max_attempts,
    idempotency_key
  ) values (
    p_tenant_id,
    coalesce(nullif(v_settings.session_id, ''), p_tenant_id::text),
    'tenant',
    'inbound_auto_reply',
    'client',
    v_phone,
    v_settings.inbound_auto_reply_template,
    jsonb_build_object(
      'salao', coalesce(v_tenant.name, 'LinkUp Studio'),
      'tenant_slug', coalesce(v_tenant.slug, ''),
      'provider_message_id', v_message_id
    ),
    'pending',
    now(),
    3,
    v_idempotency_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_queue_id;

  if v_queue_id is null then
    return jsonb_build_object('enqueued', false, 'reason', 'duplicate');
  end if;

  return jsonb_build_object(
    'enqueued', true,
    'reason', 'queued',
    'queue_id', v_queue_id
  );
end;
$$;

revoke all on function public.enqueue_whatsapp_inbound_auto_reply(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.enqueue_whatsapp_inbound_auto_reply(uuid, text, text)
to service_role;

comment on function public.enqueue_whatsapp_inbound_auto_reply(uuid, text, text) is
  'Internal connector RPC that atomically queues a tenant inbound WhatsApp auto reply.';