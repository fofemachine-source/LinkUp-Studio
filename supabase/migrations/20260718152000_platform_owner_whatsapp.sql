begin;

alter table public.platform_billing_settings
  add column if not exists platform_whatsapp_session_id text not null default 'platform-owner',
  add column if not exists platform_whatsapp_connection_status text not null default 'not_connected',
  add column if not exists platform_whatsapp_connected_phone text,
  add column if not exists platform_whatsapp_last_status_at timestamptz,
  add column if not exists platform_whatsapp_last_connection_error text,
  add column if not exists platform_whatsapp_test_phone text;

alter table public.platform_billing_settings
  drop constraint if exists platform_billing_settings_whatsapp_status_check;

alter table public.platform_billing_settings
  add constraint platform_billing_settings_whatsapp_status_check
  check (
    platform_whatsapp_connection_status in (
      'not_connected',
      'connecting',
      'qr',
      'connected',
      'disconnected',
      'logged_out',
      'connector_error'
    )
  );

update public.platform_billing_settings
set platform_whatsapp_session_id = 'platform-owner'
where id = 'global'
  and coalesce(platform_whatsapp_session_id, '') = '';

alter table public.whatsapp_message_queue
  add column if not exists sender_scope text not null default 'tenant';

alter table public.whatsapp_message_queue
  alter column tenant_id drop not null,
  alter column session_id drop not null;

alter table public.whatsapp_message_queue
  drop constraint if exists whatsapp_message_queue_session_id_check,
  drop constraint if exists whatsapp_message_queue_sender_scope_check;

alter table public.whatsapp_message_queue
  add constraint whatsapp_message_queue_sender_scope_check
  check (
    (
      sender_scope = 'tenant'
      and tenant_id is not null
      and session_id = tenant_id::text
    )
    or (
      sender_scope = 'platform'
      and tenant_id is null
      and length(coalesce(session_id, '')) > 0
    )
  );

create index if not exists whatsapp_queue_platform_sender_idx
  on public.whatsapp_message_queue (sender_scope, scheduled_for, status)
  where sender_scope = 'platform';

drop policy if exists "tenant managers read whatsapp queue"
on public.whatsapp_message_queue;

create policy "tenant managers read whatsapp queue"
on public.whatsapp_message_queue for select to authenticated
using (
  sender_scope = 'tenant'
  and private.can_manage_tenant_operations(tenant_id)
);

drop policy if exists "tenant managers insert whatsapp queue"
on public.whatsapp_message_queue;

create policy "tenant managers insert whatsapp queue"
on public.whatsapp_message_queue for insert to authenticated
with check (
  sender_scope = 'tenant'
  and private.can_manage_tenant_operations(tenant_id)
);

drop policy if exists "tenant managers update whatsapp queue"
on public.whatsapp_message_queue;

create policy "tenant managers update whatsapp queue"
on public.whatsapp_message_queue for update to authenticated
using (
  sender_scope = 'tenant'
  and private.can_manage_tenant_operations(tenant_id)
)
with check (
  sender_scope = 'tenant'
  and private.can_manage_tenant_operations(tenant_id)
);

drop policy if exists "tenant managers delete whatsapp queue"
on public.whatsapp_message_queue;

create policy "tenant managers delete whatsapp queue"
on public.whatsapp_message_queue for delete to authenticated
using (
  sender_scope = 'tenant'
  and private.can_manage_tenant_operations(tenant_id)
);

create or replace function public.enqueue_due_platform_billing_whatsapp()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  settings public.platform_billing_settings%rowtype;
  notification record;
  local_now timestamp without time zone := clock_timestamp() at time zone 'America/Sao_Paulo';
  local_today date := local_now::date;
  local_time time without time zone := local_now::time;
  days_until_due integer;
  inserted_count integer := 0;
  trial_count integer := 0;
  reminder_count integer := 0;
  overdue_count integer := 0;
  platform_session_id text;
begin
  select *
  into settings
  from public.platform_billing_settings
  where id = 'global';

  if not found
     or not settings.enabled
     or not settings.whatsapp_enabled then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'platform_whatsapp_disabled'
    );
  end if;

  platform_session_id := coalesce(nullif(settings.platform_whatsapp_session_id, ''), 'platform-owner');

  if settings.platform_whatsapp_connection_status <> 'connected' then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'platform_whatsapp_not_connected'
    );
  end if;

  if local_time < settings.platform_notification_time then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'before_notification_time'
    );
  end if;

  if settings.platform_trial_reminder_enabled then
    for notification in
      select
        contract.id as contract_id,
        contract.tenant_id as billed_tenant_id,
        contract.trial_ends_on,
        contract.amount_snapshot,
        plan.name as plan_name,
        tenant.name as tenant_name,
        coalesce(nullif(customer.legal_name, ''), tenant.name) as customer_name,
        regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g') as phone
      from public.platform_billing_contracts as contract
      join public.platform_billing_plans as plan
        on plan.id = contract.plan_id
      join public.tenants as tenant
        on tenant.id = contract.tenant_id
       and coalesce(tenant.status, 'active') <> 'blocked'
      left join public.tenant_billing_provider_customers as customer
        on customer.tenant_id = contract.tenant_id
       and customer.provider = 'asaas'
       and customer.environment = settings.environment
      where contract.status = 'trialing'
        and contract.trial_ends_on between local_today and local_today + 365
        and contract.trial_ends_on - local_today = any(settings.platform_trial_reminder_days_before)
        and length(regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g')) >= 10
    loop
      days_until_due := notification.trial_ends_on - local_today;

      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        sender_scope,
        platform_billing_contract_id,
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
        null,
        platform_session_id,
        'platform',
        notification.contract_id,
        'platform_trial_reminder',
        'responsible',
        notification.customer_name,
        notification.phone,
        settings.platform_trial_reminder_template,
        jsonb_build_object(
          'platform_billing_contract_id', notification.contract_id,
          'tenant_id', notification.billed_tenant_id,
          'billed_tenant_id', notification.billed_tenant_id,
          'salao', notification.tenant_name,
          'cliente', notification.customer_name,
          'plataforma', 'LinkUp Studio',
          'plano', notification.plan_name,
          'valor', private.platform_billing_whatsapp_currency(notification.amount_snapshot),
          'vencimento', to_char(notification.trial_ends_on, 'DD/MM/YYYY'),
          'dias', days_until_due::text,
          'dias_para_vencimento', days_until_due::text
        ),
        clock_timestamp(),
        notification.contract_id::text
          || ':platform:trial-reminder:'
          || notification.trial_ends_on::text
          || ':'
          || days_until_due::text
      )
      on conflict (idempotency_key) do nothing;

      get diagnostics inserted_count = row_count;
      trial_count := trial_count + inserted_count;
    end loop;
  end if;

  for notification in
    select
      charge.id as charge_id,
      charge.contract_id,
      charge.tenant_id as billed_tenant_id,
      charge.amount,
      charge.due_date,
      charge.status,
      plan.name as plan_name,
      tenant.name as tenant_name,
      coalesce(nullif(customer.legal_name, ''), tenant.name) as customer_name,
      regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g') as phone
    from public.platform_billing_charges as charge
    join public.platform_billing_contracts as contract
      on contract.id = charge.contract_id
     and contract.tenant_id = charge.tenant_id
    join public.platform_billing_plans as plan
      on plan.id = charge.plan_id
    join public.tenants as tenant
      on tenant.id = charge.tenant_id
    left join public.tenant_billing_provider_customers as customer
      on customer.tenant_id = charge.tenant_id
     and customer.provider = 'asaas'
     and customer.environment = settings.environment
    where charge.environment = settings.environment
      and charge.status in ('pending', 'overdue')
      and charge.due_date between local_today - 365 and local_today + 365
      and length(regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g')) >= 10
  loop
    days_until_due := notification.due_date - local_today;

    if settings.platform_payment_reminder_enabled
       and days_until_due >= 0
       and days_until_due = any(settings.platform_payment_reminder_days_before)
    then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        sender_scope,
        platform_billing_contract_id,
        platform_billing_charge_id,
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
        null,
        platform_session_id,
        'platform',
        notification.contract_id,
        notification.charge_id,
        'platform_billing_reminder',
        'responsible',
        notification.customer_name,
        notification.phone,
        settings.platform_payment_reminder_template,
        jsonb_build_object(
          'platform_billing_contract_id', notification.contract_id,
          'platform_billing_charge_id', notification.charge_id,
          'charge_id', notification.charge_id,
          'tenant_id', notification.billed_tenant_id,
          'billed_tenant_id', notification.billed_tenant_id,
          'salao', notification.tenant_name,
          'cliente', notification.customer_name,
          'plataforma', 'LinkUp Studio',
          'plano', notification.plan_name,
          'valor', private.platform_billing_whatsapp_currency(notification.amount),
          'vencimento', to_char(notification.due_date, 'DD/MM/YYYY'),
          'dias', days_until_due::text,
          'dias_para_vencimento', days_until_due::text
        ),
        clock_timestamp(),
        notification.charge_id::text
          || ':platform:billing-reminder:'
          || notification.due_date::text
          || ':'
          || days_until_due::text
      )
      on conflict (idempotency_key) do nothing;

      get diagnostics inserted_count = row_count;
      reminder_count := reminder_count + inserted_count;
    end if;

    if settings.platform_overdue_enabled
       and days_until_due < 0
       and abs(days_until_due) = any(settings.platform_overdue_days_after)
    then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        sender_scope,
        platform_billing_contract_id,
        platform_billing_charge_id,
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
        null,
        platform_session_id,
        'platform',
        notification.contract_id,
        notification.charge_id,
        'platform_billing_overdue',
        'responsible',
        notification.customer_name,
        notification.phone,
        settings.platform_overdue_template,
        jsonb_build_object(
          'platform_billing_contract_id', notification.contract_id,
          'platform_billing_charge_id', notification.charge_id,
          'charge_id', notification.charge_id,
          'tenant_id', notification.billed_tenant_id,
          'billed_tenant_id', notification.billed_tenant_id,
          'salao', notification.tenant_name,
          'cliente', notification.customer_name,
          'plataforma', 'LinkUp Studio',
          'plano', notification.plan_name,
          'valor', private.platform_billing_whatsapp_currency(notification.amount),
          'vencimento', to_char(notification.due_date, 'DD/MM/YYYY'),
          'dias', abs(days_until_due)::text,
          'dias_atraso', abs(days_until_due)::text
        ),
        clock_timestamp(),
        notification.charge_id::text
          || ':platform:billing-overdue:'
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
    'trial_reminders', trial_count,
    'payment_reminders', reminder_count,
    'overdue_notices', overdue_count,
    'enqueued', trial_count + reminder_count + overdue_count
  );
end;
$function$;

revoke all on function public.enqueue_due_platform_billing_whatsapp()
  from public, anon, authenticated;
grant execute on function public.enqueue_due_platform_billing_whatsapp()
  to service_role;

create or replace function private.queue_platform_billing_payment_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  settings public.platform_billing_settings%rowtype;
  contract public.platform_billing_contracts%rowtype;
  plan public.platform_billing_plans%rowtype;
  tenant public.tenants%rowtype;
  customer public.tenant_billing_provider_customers%rowtype;
  status_changed boolean := true;
  due_date_changed boolean := false;
  became_paid boolean := false;
  customer_phone text;
  paid_at timestamptz;
  next_due date;
  platform_session_id text;
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
      last_error = 'Aviso cancelado porque o vencimento da cobrança B2B foi alterado.'
    where platform_billing_charge_id = new.id
      and event_type in ('platform_billing_reminder', 'platform_billing_overdue')
      and status in ('pending', 'processing', 'failed');
  end if;

  if not status_changed then
    return new;
  end if;

  if new.status in (
    'confirmed',
    'received',
    'cancelled',
    'refunded',
    'partially_refunded',
    'disputed'
  ) then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = case
        when new.status in ('confirmed', 'received')
          then 'Cobrança B2B paga antes do aviso programado.'
        else 'Cobrança B2B cancelada ou estornada antes do aviso programado.'
      end
    where platform_billing_charge_id = new.id
      and event_type in ('platform_billing_reminder', 'platform_billing_overdue')
      and status in ('pending', 'processing', 'failed');
  end if;

  if new.status in ('cancelled', 'refunded', 'partially_refunded', 'disputed') then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = 'Confirmação B2B cancelada porque a cobrança foi cancelada ou estornada.'
    where platform_billing_charge_id = new.id
      and event_type = 'platform_billing_payment_confirmed'
      and status in ('pending', 'processing', 'failed');
  end if;

  became_paid :=
    new.status in ('confirmed', 'received')
    and (
      tg_op = 'INSERT'
      or old.status not in ('confirmed', 'received')
    );

  if not became_paid then
    return new;
  end if;

  select *
  into settings
  from public.platform_billing_settings
  where id = 'global';

  if not found
     or not settings.enabled
     or not settings.whatsapp_enabled
     or not settings.platform_payment_confirmation_enabled
     or settings.platform_whatsapp_connection_status <> 'connected'
     or new.environment <> settings.environment
  then
    return new;
  end if;

  platform_session_id := coalesce(nullif(settings.platform_whatsapp_session_id, ''), 'platform-owner');

  select *
  into contract
  from public.platform_billing_contracts
  where id = new.contract_id;

  if not found then
    return new;
  end if;

  select *
  into plan
  from public.platform_billing_plans
  where id = new.plan_id;

  select *
  into tenant
  from public.tenants
  where id = new.tenant_id;

  select *
  into customer
  from public.tenant_billing_provider_customers
  where tenant_id = new.tenant_id
    and provider = 'asaas'
    and environment = settings.environment;

  customer_phone := regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g');
  if length(customer_phone) < 10 then
    return new;
  end if;

  paid_at := coalesce(new.received_at, new.confirmed_at, clock_timestamp());
  next_due := coalesce(contract.next_due_date, new.coverage_end + 1);

  insert into public.whatsapp_message_queue (
    tenant_id,
    session_id,
    sender_scope,
    platform_billing_contract_id,
    platform_billing_charge_id,
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
    null,
    platform_session_id,
    'platform',
    new.contract_id,
    new.id,
    'platform_billing_payment_confirmed',
    'responsible',
    coalesce(nullif(customer.legal_name, ''), tenant.name, 'Cliente'),
    customer_phone,
    settings.platform_payment_confirmation_template,
    jsonb_build_object(
      'platform_billing_contract_id', new.contract_id,
      'platform_billing_charge_id', new.id,
      'charge_id', new.id,
      'tenant_id', new.tenant_id,
      'billed_tenant_id', new.tenant_id,
      'salao', coalesce(tenant.name, 'Salão'),
      'cliente', coalesce(nullif(customer.legal_name, ''), tenant.name, 'Cliente'),
      'plataforma', 'LinkUp Studio',
      'plano', coalesce(plan.name, 'Plano'),
      'valor', private.platform_billing_whatsapp_currency(new.amount),
      'vencimento', to_char(new.due_date, 'DD/MM/YYYY'),
      'data_pagamento', to_char(paid_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
      'proximo_vencimento', coalesce(to_char(next_due, 'DD/MM/YYYY'), 'Não se aplica')
    ),
    clock_timestamp() + interval '3 seconds',
    new.id::text || ':platform:payment-confirmed'
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$function$;

revoke all on function private.queue_platform_billing_payment_whatsapp()
  from public, anon, authenticated;

commit;
