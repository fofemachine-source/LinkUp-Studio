-- Subscription WhatsApp notification rules for LinkUp Studio.
-- The matrix owns the global defaults and optional tenant overrides. Due
-- notifications are generated idempotently before the existing queue worker
-- sends them; payment confirmations are queued immediately after settlement.

begin;

create or replace function private.valid_whatsapp_day_offsets(
  p_offsets integer[],
  p_minimum integer,
  p_maximum integer
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    coalesce(cardinality(p_offsets) between 1 and 10, false)
    and not exists (
      select 1
      from unnest(p_offsets) as offset_value
      where offset_value is null
        or offset_value < p_minimum
        or offset_value > p_maximum
    )
    and cardinality(p_offsets) = (
      select count(distinct offset_value)
      from unnest(p_offsets) as offset_value
    );
$$;

revoke all on function private.valid_whatsapp_day_offsets(integer[], integer, integer)
from public, anon, authenticated;
grant execute on function private.valid_whatsapp_day_offsets(integer[], integer, integer)
to authenticated, service_role;

alter table public.whatsapp_global_templates
  add column if not exists subscription_payment_reminder_template text not null default
    '🔔 *Olá, {cliente}!*

Sua assinatura *{plano}* no(a) *{salao}* vence em *{vencimento}*.

💳 *Valor:* {valor}

Se você já realizou o pagamento, desconsidere esta mensagem.',
  add column if not exists subscription_payment_confirmation_template text not null default
    '✅ *Pagamento confirmado, {cliente}!*

Recebemos *{valor}* referente à sua assinatura *{plano}* no(a) *{salao}*.

📅 *Próximo vencimento:* {proximo_vencimento}

Obrigado pela confiança!',
  add column if not exists subscription_overdue_template text not null default
    '⚠️ *Olá, {cliente}.*

Identificamos uma pendência na assinatura *{plano}* no(a) *{salao}*.

📅 *Vencimento:* {vencimento}
💳 *Valor:* {valor}
⏳ *Atraso:* {dias_atraso} dia(s)

Entre em contato com o salão para regularizar.',
  add column if not exists subscription_payment_reminder_enabled boolean not null default false,
  add column if not exists subscription_payment_reminder_days_before integer[] not null default array[3, 1, 0],
  add column if not exists subscription_payment_confirmation_enabled boolean not null default false,
  add column if not exists subscription_overdue_enabled boolean not null default false,
  add column if not exists subscription_overdue_days_after integer[] not null default array[1, 3, 7],
  add column if not exists subscription_notification_time time without time zone not null default time '09:00';

alter table public.tenant_whatsapp_settings
  add column if not exists subscription_payment_reminder_template text not null default
    '🔔 *Olá, {cliente}!*

Sua assinatura *{plano}* no(a) *{salao}* vence em *{vencimento}*.

💳 *Valor:* {valor}

Se você já realizou o pagamento, desconsidere esta mensagem.',
  add column if not exists subscription_payment_confirmation_template text not null default
    '✅ *Pagamento confirmado, {cliente}!*

Recebemos *{valor}* referente à sua assinatura *{plano}* no(a) *{salao}*.

📅 *Próximo vencimento:* {proximo_vencimento}

Obrigado pela confiança!',
  add column if not exists subscription_overdue_template text not null default
    '⚠️ *Olá, {cliente}.*

Identificamos uma pendência na assinatura *{plano}* no(a) *{salao}*.

📅 *Vencimento:* {vencimento}
💳 *Valor:* {valor}
⏳ *Atraso:* {dias_atraso} dia(s)

Entre em contato com o salão para regularizar.',
  add column if not exists subscription_payment_reminder_enabled boolean not null default false,
  add column if not exists subscription_payment_reminder_days_before integer[] not null default array[3, 1, 0],
  add column if not exists subscription_payment_confirmation_enabled boolean not null default false,
  add column if not exists subscription_overdue_enabled boolean not null default false,
  add column if not exists subscription_overdue_days_after integer[] not null default array[1, 3, 7],
  add column if not exists subscription_notification_time time without time zone not null default time '09:00';

-- Preserve every subscription message previously edited inside a salon. The
-- values become that salon's custom copy and are used whenever the matrix sets
-- its template source to "custom".
update public.tenant_whatsapp_settings as whatsapp_settings
set
  subscription_payment_reminder_template = coalesce(
    nullif(subscription_settings.billing_message, ''),
    whatsapp_settings.subscription_payment_reminder_template
  ),
  subscription_payment_confirmation_template = coalesce(
    nullif(subscription_settings.payment_confirmation_message, ''),
    whatsapp_settings.subscription_payment_confirmation_template
  ),
  subscription_overdue_template = coalesce(
    nullif(subscription_settings.overdue_message, ''),
    whatsapp_settings.subscription_overdue_template
  )
from public.subscription_module_settings as subscription_settings
where subscription_settings.tenant_id = whatsapp_settings.tenant_id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_global_subscription_reminder_days_check'
      and conrelid = 'public.whatsapp_global_templates'::regclass
  ) then
    alter table public.whatsapp_global_templates
      add constraint whatsapp_global_subscription_reminder_days_check
      check (
        private.valid_whatsapp_day_offsets(
          subscription_payment_reminder_days_before,
          0,
          365
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_global_subscription_overdue_days_check'
      and conrelid = 'public.whatsapp_global_templates'::regclass
  ) then
    alter table public.whatsapp_global_templates
      add constraint whatsapp_global_subscription_overdue_days_check
      check (
        private.valid_whatsapp_day_offsets(
          subscription_overdue_days_after,
          1,
          365
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_whatsapp_subscription_reminder_days_check'
      and conrelid = 'public.tenant_whatsapp_settings'::regclass
  ) then
    alter table public.tenant_whatsapp_settings
      add constraint tenant_whatsapp_subscription_reminder_days_check
      check (
        private.valid_whatsapp_day_offsets(
          subscription_payment_reminder_days_before,
          0,
          365
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_whatsapp_subscription_overdue_days_check'
      and conrelid = 'public.tenant_whatsapp_settings'::regclass
  ) then
    alter table public.tenant_whatsapp_settings
      add constraint tenant_whatsapp_subscription_overdue_days_check
      check (
        private.valid_whatsapp_day_offsets(
          subscription_overdue_days_after,
          1,
          365
        )
      );
  end if;
end $$;

-- Message content and subscription cadence belong to the matrix. Tenant
-- users may still manage connection/toggles, but cannot bypass the locked UI
-- with a direct REST update.
create or replace function private.guard_matrix_whatsapp_templates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user in ('postgres', 'supabase_admin')
     or coalesce((select auth.role()), '') = 'service_role'
     or private.is_super_admin((select auth.uid()))
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Os modelos e a régua do WhatsApp são administrados pela matriz.'
      using errcode = '42501';
  end if;

  if row(
    new.message_templates_source,
    new.client_registration_template,
    new.client_booking_template,
    new.professional_booking_template,
    new.client_reminder_template,
    new.client_cancellation_template,
    new.professional_cancellation_template,
    new.client_reschedule_template,
    new.professional_reschedule_template,
    new.subscription_payment_reminder_template,
    new.subscription_payment_confirmation_template,
    new.subscription_overdue_template,
    new.subscription_payment_reminder_enabled,
    new.subscription_payment_reminder_days_before,
    new.subscription_payment_confirmation_enabled,
    new.subscription_overdue_enabled,
    new.subscription_overdue_days_after,
    new.subscription_notification_time
  ) is distinct from row(
    old.message_templates_source,
    old.client_registration_template,
    old.client_booking_template,
    old.professional_booking_template,
    old.client_reminder_template,
    old.client_cancellation_template,
    old.professional_cancellation_template,
    old.client_reschedule_template,
    old.professional_reschedule_template,
    old.subscription_payment_reminder_template,
    old.subscription_payment_confirmation_template,
    old.subscription_overdue_template,
    old.subscription_payment_reminder_enabled,
    old.subscription_payment_reminder_days_before,
    old.subscription_payment_confirmation_enabled,
    old.subscription_overdue_enabled,
    old.subscription_overdue_days_after,
    old.subscription_notification_time
  ) then
    raise exception 'Os modelos e a régua do WhatsApp são administrados pela matriz.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_matrix_whatsapp_templates()
from public, anon, authenticated;

drop trigger if exists guard_matrix_whatsapp_templates
  on public.tenant_whatsapp_settings;
drop trigger if exists guard_matrix_whatsapp_templates_insert
  on public.tenant_whatsapp_settings;
create trigger guard_matrix_whatsapp_templates_insert
before insert on public.tenant_whatsapp_settings
for each row execute function private.guard_matrix_whatsapp_templates();
create trigger guard_matrix_whatsapp_templates
before update of
  message_templates_source,
  client_registration_template,
  client_booking_template,
  professional_booking_template,
  client_reminder_template,
  client_cancellation_template,
  professional_cancellation_template,
  client_reschedule_template,
  professional_reschedule_template,
  subscription_payment_reminder_template,
  subscription_payment_confirmation_template,
  subscription_overdue_template,
  subscription_payment_reminder_enabled,
  subscription_payment_reminder_days_before,
  subscription_payment_confirmation_enabled,
  subscription_overdue_enabled,
  subscription_overdue_days_after,
  subscription_notification_time
on public.tenant_whatsapp_settings
for each row execute function private.guard_matrix_whatsapp_templates();

alter table public.whatsapp_message_queue
  add column if not exists subscription_charge_id uuid;

create unique index if not exists subscription_charges_id_tenant_uidx
  on public.subscription_charges (id, tenant_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_queue_subscription_charge_tenant_fk'
      and conrelid = 'public.whatsapp_message_queue'::regclass
  ) then
    alter table public.whatsapp_message_queue
      add constraint whatsapp_queue_subscription_charge_tenant_fk
      foreign key (subscription_charge_id, tenant_id)
      references public.subscription_charges (id, tenant_id)
      on delete set null (subscription_charge_id)
      not valid;
  end if;
end $$;

alter table public.whatsapp_message_queue
  validate constraint whatsapp_queue_subscription_charge_tenant_fk;

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
      'test'
    )
  );

create index if not exists whatsapp_queue_subscription_charge_idx
  on public.whatsapp_message_queue (subscription_charge_id, status)
  where subscription_charge_id is not null;

create index if not exists subscription_charges_whatsapp_due_idx
  on public.subscription_charges (due_date, tenant_id)
  where status in ('pending', 'overdue');

create or replace function private.whatsapp_effective_template(
  p_template_source text,
  p_field text,
  p_tenant_template text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  global_template text;
begin
  if coalesce(p_template_source, 'global') = 'custom' then
    return p_tenant_template;
  end if;

  select
    case p_field
      when 'client_registration_template' then defaults.client_registration_template
      when 'client_booking_template' then defaults.client_booking_template
      when 'professional_booking_template' then defaults.professional_booking_template
      when 'client_reminder_template' then defaults.client_reminder_template
      when 'client_cancellation_template' then defaults.client_cancellation_template
      when 'professional_cancellation_template' then defaults.professional_cancellation_template
      when 'client_reschedule_template' then defaults.client_reschedule_template
      when 'professional_reschedule_template' then defaults.professional_reschedule_template
      when 'subscription_payment_reminder_template' then defaults.subscription_payment_reminder_template
      when 'subscription_payment_confirmation_template' then defaults.subscription_payment_confirmation_template
      when 'subscription_overdue_template' then defaults.subscription_overdue_template
      else null
    end
    into global_template
  from public.whatsapp_global_templates as defaults
  where defaults.id = 'global';

  return coalesce(nullif(global_template, ''), p_tenant_template);
end;
$$;

revoke all on function private.whatsapp_effective_template(text, text, text)
from public, anon, authenticated;

create or replace function private.subscription_whatsapp_configuration(
  p_tenant_id uuid
)
returns table (
  automation_enabled boolean,
  session_id text,
  payment_reminder_enabled boolean,
  payment_reminder_days_before integer[],
  payment_confirmation_enabled boolean,
  overdue_enabled boolean,
  overdue_days_after integer[],
  notification_time time without time zone,
  payment_reminder_template text,
  payment_confirmation_template text,
  overdue_template text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    whatsapp_settings.enabled
      and coalesce(subscription_settings.whatsapp_enabled, true),
    whatsapp_settings.session_id,
    case
      when whatsapp_settings.message_templates_source = 'custom'
      then whatsapp_settings.subscription_payment_reminder_enabled
      else coalesce(defaults.subscription_payment_reminder_enabled, false)
    end,
    case
      when whatsapp_settings.message_templates_source = 'custom'
      then whatsapp_settings.subscription_payment_reminder_days_before
      else coalesce(defaults.subscription_payment_reminder_days_before, array[3, 1, 0])
    end,
    case
      when whatsapp_settings.message_templates_source = 'custom'
      then whatsapp_settings.subscription_payment_confirmation_enabled
      else coalesce(defaults.subscription_payment_confirmation_enabled, false)
    end,
    case
      when whatsapp_settings.message_templates_source = 'custom'
      then whatsapp_settings.subscription_overdue_enabled
      else coalesce(defaults.subscription_overdue_enabled, false)
    end,
    case
      when whatsapp_settings.message_templates_source = 'custom'
      then whatsapp_settings.subscription_overdue_days_after
      else coalesce(defaults.subscription_overdue_days_after, array[1, 3, 7])
    end,
    case
      when whatsapp_settings.message_templates_source = 'custom'
      then whatsapp_settings.subscription_notification_time
      else coalesce(defaults.subscription_notification_time, time '09:00')
    end,
    private.whatsapp_effective_template(
      whatsapp_settings.message_templates_source,
      'subscription_payment_reminder_template',
      whatsapp_settings.subscription_payment_reminder_template
    ),
    private.whatsapp_effective_template(
      whatsapp_settings.message_templates_source,
      'subscription_payment_confirmation_template',
      whatsapp_settings.subscription_payment_confirmation_template
    ),
    private.whatsapp_effective_template(
      whatsapp_settings.message_templates_source,
      'subscription_overdue_template',
      whatsapp_settings.subscription_overdue_template
    )
  from public.tenant_whatsapp_settings as whatsapp_settings
  left join public.subscription_module_settings as subscription_settings
    on subscription_settings.tenant_id = whatsapp_settings.tenant_id
  left join public.whatsapp_global_templates as defaults
    on defaults.id = 'global'
  where whatsapp_settings.tenant_id = p_tenant_id;
$$;

revoke all on function private.subscription_whatsapp_configuration(uuid)
from public, anon, authenticated;

create or replace function private.subscription_whatsapp_currency(p_value numeric)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select 'R$ ' || replace(coalesce(p_value, 0)::numeric(14, 2)::text, '.', ',');
$$;

revoke all on function private.subscription_whatsapp_currency(numeric)
from public, anon, authenticated;

create or replace function public.enqueue_due_subscription_whatsapp()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification record;
  local_now timestamp without time zone := clock_timestamp() at time zone 'America/Sao_Paulo';
  local_today date := local_now::date;
  local_time time without time zone := local_now::time;
  days_until_due integer;
  inserted_count integer := 0;
  reminder_count integer := 0;
  overdue_count integer := 0;
begin
  for notification in
    select
      charge.id as charge_id,
      charge.tenant_id,
      charge.subscription_id,
      charge.amount,
      charge.due_date,
      subscription.subscriber_name,
      coalesce(nullif(subscription.whatsapp, ''), nullif(client.whatsapp, '')) as whatsapp,
      plan.name as plan_name,
      tenant.name as tenant_name,
      configuration.*
    from public.subscription_charges as charge
    join public.client_subscriptions as subscription
      on subscription.id = charge.subscription_id
     and subscription.tenant_id = charge.tenant_id
    join public.subscription_plans as plan
      on plan.id = subscription.plan_id
     and plan.tenant_id = charge.tenant_id
     and plan.status = 'active'
     and plan.automatic_notifications = true
    join public.tenants as tenant
      on tenant.id = charge.tenant_id
     and coalesce(tenant.status, 'active') <> 'blocked'
    left join public.clients as client
      on client.id = subscription.client_id
     and client.tenant_id = charge.tenant_id
    cross join lateral private.subscription_whatsapp_configuration(charge.tenant_id)
      as configuration
    where charge.status in ('pending', 'overdue')
      and charge.due_date between local_today - 365 and local_today + 365
      and subscription.status not in ('canceled', 'expired')
      and configuration.automation_enabled = true
      and local_time >= configuration.notification_time
      and (
        (
          configuration.payment_reminder_enabled
          and charge.due_date >= local_today
          and charge.due_date - local_today = any(configuration.payment_reminder_days_before)
        )
        or (
          configuration.overdue_enabled
          and charge.due_date < local_today
          and local_today - charge.due_date = any(configuration.overdue_days_after)
        )
      )
      and (
        subscription.client_id is null
        or not exists (
          select 1
          from public.customer_booking_accounts as account
          where account.tenant_id = charge.tenant_id
            and account.client_id = subscription.client_id
            and account.whatsapp_consent_at is null
        )
      )
      and length(
        regexp_replace(
          coalesce(nullif(subscription.whatsapp, ''), nullif(client.whatsapp, ''), ''),
          '[^0-9]',
          '',
          'g'
        )
      ) >= 10
  loop
    days_until_due := notification.due_date - local_today;

    if notification.payment_reminder_enabled
       and days_until_due >= 0
       and days_until_due = any(notification.payment_reminder_days_before)
    then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        subscription_charge_id,
        event_type,
        recipient_kind,
        recipient_name,
        recipient_phone,
        template,
        payload,
        scheduled_for,
        idempotency_key
      )
      values (
        notification.tenant_id,
        notification.session_id,
        notification.charge_id,
        'subscription_payment_reminder',
        'client',
        notification.subscriber_name,
        regexp_replace(notification.whatsapp, '[^0-9]', '', 'g'),
        notification.payment_reminder_template,
        jsonb_build_object(
          'charge_id', notification.charge_id,
          'subscription_charge_id', notification.charge_id,
          'subscription_id', notification.subscription_id,
          'tenant_id', notification.tenant_id,
          'salao', notification.tenant_name,
          'cliente', notification.subscriber_name,
          'plano', notification.plan_name,
          'valor', private.subscription_whatsapp_currency(notification.amount),
          'vencimento', to_char(notification.due_date, 'DD/MM/YYYY'),
          'dias', days_until_due::text,
          'dias_para_vencimento', days_until_due::text
        ),
        clock_timestamp(),
        notification.charge_id::text
          || ':subscription:payment-reminder:'
          || notification.due_date::text
          || ':'
          || days_until_due::text
      )
      on conflict (idempotency_key) do nothing;

      get diagnostics inserted_count = row_count;
      reminder_count := reminder_count + inserted_count;
    end if;

    if notification.overdue_enabled
       and days_until_due < 0
       and abs(days_until_due) = any(notification.overdue_days_after)
    then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        subscription_charge_id,
        event_type,
        recipient_kind,
        recipient_name,
        recipient_phone,
        template,
        payload,
        scheduled_for,
        idempotency_key
      )
      values (
        notification.tenant_id,
        notification.session_id,
        notification.charge_id,
        'subscription_overdue',
        'client',
        notification.subscriber_name,
        regexp_replace(notification.whatsapp, '[^0-9]', '', 'g'),
        notification.overdue_template,
        jsonb_build_object(
          'charge_id', notification.charge_id,
          'subscription_charge_id', notification.charge_id,
          'subscription_id', notification.subscription_id,
          'tenant_id', notification.tenant_id,
          'salao', notification.tenant_name,
          'cliente', notification.subscriber_name,
          'plano', notification.plan_name,
          'valor', private.subscription_whatsapp_currency(notification.amount),
          'vencimento', to_char(notification.due_date, 'DD/MM/YYYY'),
          'dias', abs(days_until_due)::text,
          'dias_atraso', abs(days_until_due)::text
        ),
        clock_timestamp(),
        notification.charge_id::text
          || ':subscription:overdue:'
          || notification.due_date::text
          || ':'
          || abs(days_until_due)::text
      )
      on conflict (idempotency_key) do nothing;

      get diagnostics inserted_count = row_count;
      overdue_count := overdue_count + inserted_count;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'payment_reminders', reminder_count,
    'overdue_notices', overdue_count,
    'enqueued', reminder_count + overdue_count
  );
end;
$$;

revoke all on function public.enqueue_due_subscription_whatsapp()
from public, anon, authenticated;
grant execute on function public.enqueue_due_subscription_whatsapp()
to service_role;

create or replace function private.queue_subscription_payment_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  status_changed boolean := true;
  due_date_changed boolean := false;
  became_paid boolean := false;
  subscription public.client_subscriptions%rowtype;
  plan public.subscription_plans%rowtype;
  configuration record;
  tenant_name text;
  client_phone text;
  next_due date;
begin
  if tg_op = 'UPDATE' then
    status_changed := old.status is distinct from new.status;
    due_date_changed := old.due_date is distinct from new.due_date;
  end if;

  if due_date_changed then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = 'Aviso cancelado porque o vencimento da cobrança foi alterado.'
    where subscription_charge_id = new.id
      and event_type in (
        'subscription_payment_reminder',
        'subscription_overdue'
      )
      and status in ('pending', 'processing', 'failed');
  end if;

  if not status_changed then
    return new;
  end if;

  became_paid := new.status = 'paid';

  if new.status in ('paid', 'canceled', 'refunded') then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = case
        when new.status = 'paid'
        then 'Cobrança paga antes do aviso programado.'
        else 'Cobrança cancelada antes do aviso programado.'
      end
    where subscription_charge_id = new.id
      and event_type in (
        'subscription_payment_reminder',
        'subscription_overdue'
      )
      and status in ('pending', 'processing', 'failed');
  end if;

  if new.status in ('canceled', 'refunded') then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = 'Confirmação cancelada porque a cobrança foi estornada ou cancelada.'
    where subscription_charge_id = new.id
      and event_type = 'subscription_payment_confirmed'
      and status in ('pending', 'processing', 'failed');
  end if;

  if not became_paid then
    return new;
  end if;

  select *
  into subscription
  from public.client_subscriptions
  where id = new.subscription_id
    and tenant_id = new.tenant_id;

  if not found then
    return new;
  end if;

  -- Customers who created a booking account may explicitly refuse WhatsApp.
  -- Manually managed subscribers without an account keep the salon workflow.
  if subscription.client_id is not null
     and exists (
       select 1
       from public.customer_booking_accounts as account
       where account.tenant_id = new.tenant_id
         and account.client_id = subscription.client_id
         and account.whatsapp_consent_at is null
     )
  then
    return new;
  end if;

  select *
  into plan
  from public.subscription_plans
  where id = subscription.plan_id
    and tenant_id = new.tenant_id;

  if not found or not plan.automatic_notifications then
    return new;
  end if;

  select *
  into configuration
  from private.subscription_whatsapp_configuration(new.tenant_id);

  if not found
     or not configuration.automation_enabled
     or not configuration.payment_confirmation_enabled
  then
    return new;
  end if;

  select tenant.name
  into tenant_name
  from public.tenants as tenant
  where tenant.id = new.tenant_id
    and coalesce(tenant.status, 'active') <> 'blocked';

  if not found then
    return new;
  end if;

  select regexp_replace(
    coalesce(nullif(subscription.whatsapp, ''), nullif(client.whatsapp, ''), ''),
    '[^0-9]',
    '',
    'g'
  )
  into client_phone
  from (select 1) as singleton
  left join public.clients as client
    on client.id = subscription.client_id
   and client.tenant_id = new.tenant_id;

  if length(client_phone) < 10 then
    return new;
  end if;

  next_due := subscription.next_due_at;
  if next_due is null or next_due <= new.due_date then
    next_due := case plan.billing_cycle
      when 'weekly' then new.due_date + 7
      when 'biweekly' then new.due_date + 15
      when 'monthly' then (new.due_date + interval '1 month')::date
      when 'yearly' then (new.due_date + interval '1 year')::date
      else null
    end;
  end if;

  insert into public.whatsapp_message_queue (
    tenant_id,
    session_id,
    subscription_charge_id,
    event_type,
    recipient_kind,
    recipient_name,
    recipient_phone,
    template,
    payload,
    scheduled_for,
    idempotency_key
  )
  values (
    new.tenant_id,
    configuration.session_id,
    new.id,
    'subscription_payment_confirmed',
    'client',
    subscription.subscriber_name,
    client_phone,
    configuration.payment_confirmation_template,
    jsonb_build_object(
      'charge_id', new.id,
      'subscription_charge_id', new.id,
      'subscription_id', new.subscription_id,
      'tenant_id', new.tenant_id,
      'salao', coalesce(tenant_name, 'Salão'),
      'cliente', subscription.subscriber_name,
      'plano', plan.name,
      'valor', private.subscription_whatsapp_currency(new.amount),
      'vencimento', to_char(new.due_date, 'DD/MM/YYYY'),
      'data_pagamento', to_char(coalesce(new.paid_at, clock_timestamp()) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
      'proximo_vencimento', coalesce(to_char(next_due, 'DD/MM/YYYY'), 'Não se aplica'),
      'validade', coalesce(to_char(subscription.ends_at, 'DD/MM/YYYY'), 'Conforme o plano')
    ),
    clock_timestamp() + interval '3 seconds',
    new.id::text || ':subscription:payment-confirmed'
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function private.queue_subscription_payment_whatsapp()
from public, anon, authenticated;

drop trigger if exists zz_subscription_charge_whatsapp
  on public.subscription_charges;
create trigger zz_subscription_charge_whatsapp
after insert or update of status, due_date on public.subscription_charges
for each row execute function private.queue_subscription_payment_whatsapp();

commit;
