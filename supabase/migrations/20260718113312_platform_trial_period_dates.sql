begin;

alter table public.platform_billing_contracts
  add column if not exists trial_starts_on date,
  add column if not exists trial_ends_on date;

update public.platform_billing_contracts
set
  trial_starts_on = coalesce(trial_starts_on, starts_on, current_period_start, current_date),
  trial_ends_on = greatest(
    coalesce(trial_ends_on, next_due_date, current_period_end, starts_on, current_date),
    coalesce(trial_starts_on, starts_on, current_period_start, current_date)
  ),
  next_due_date = coalesce(
    next_due_date,
    trial_ends_on,
    current_period_end,
    starts_on,
    current_date
  )
where status = 'trialing'
  and (
    trial_starts_on is null
    or trial_ends_on is null
    or next_due_date is null
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_billing_contracts_trial_period_check'
      and conrelid = 'public.platform_billing_contracts'::regclass
  ) then
    alter table public.platform_billing_contracts
      add constraint platform_billing_contracts_trial_period_check
      check (
        status <> 'trialing'
        or (
          trial_starts_on is not null
          and trial_ends_on is not null
          and trial_ends_on >= trial_starts_on
        )
      );
  end if;
end $$;

create index if not exists platform_billing_contracts_trial_period_idx
  on public.platform_billing_contracts (status, trial_ends_on)
  where status = 'trialing';

alter table public.platform_billing_settings
  add column if not exists whatsapp_enabled boolean not null default false,
  add column if not exists whatsapp_sender_tenant_id uuid,
  add column if not exists platform_trial_reminder_enabled boolean not null default false,
  add column if not exists platform_trial_reminder_days_before integer[] not null default array[3, 1, 0],
  add column if not exists platform_payment_reminder_enabled boolean not null default false,
  add column if not exists platform_payment_reminder_days_before integer[] not null default array[3, 1, 0],
  add column if not exists platform_payment_confirmation_enabled boolean not null default false,
  add column if not exists platform_overdue_enabled boolean not null default false,
  add column if not exists platform_overdue_days_after integer[] not null default array[1, 3, 7],
  add column if not exists platform_notification_time time without time zone not null default time '09:00',
  add column if not exists platform_trial_reminder_template text not null default
    '⏳ *Olá, {cliente}!* Seu teste grátis da *{plataforma}* termina em *{vencimento}*.

Para evitar a suspensão do acesso ao seu salão, regularize sua assinatura até essa data.

💳 Plano: *{plano}*
💰 Valor: *{valor}*',
  add column if not exists platform_payment_reminder_template text not null default
    '🔔 *Olá, {cliente}!*

Sua mensalidade da *{plataforma}* vence em *{vencimento}*.

💳 Plano: *{plano}*
💰 Valor: *{valor}*

Se o pagamento já foi realizado, desconsidere esta mensagem.',
  add column if not exists platform_payment_confirmation_template text not null default
    '✅ *Pagamento confirmado, {cliente}!*

Recebemos *{valor}* referente ao plano *{plano}* da *{plataforma}*.

📅 Próximo vencimento: *{proximo_vencimento}*

Obrigado pela confiança.',
  add column if not exists platform_overdue_template text not null default
    '⚠️ *Olá, {cliente}.*

Identificamos uma pendência na mensalidade da *{plataforma}*.

📅 Vencimento: *{vencimento}*
💰 Valor: *{valor}*
⏳ Atraso: *{dias_atraso} dia(s)*

Para evitar suspensão ou regularizar o acesso, efetue o pagamento.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_billing_settings_whatsapp_sender_fk'
      and conrelid = 'public.platform_billing_settings'::regclass
  ) then
    alter table public.platform_billing_settings
      add constraint platform_billing_settings_whatsapp_sender_fk
      foreign key (whatsapp_sender_tenant_id)
      references public.tenants(id)
      on delete set null;
  end if;
end $$;

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

alter table public.platform_billing_settings
  drop constraint if exists platform_billing_settings_trial_reminder_days_check,
  drop constraint if exists platform_billing_settings_payment_reminder_days_check,
  drop constraint if exists platform_billing_settings_overdue_days_check,
  add constraint platform_billing_settings_trial_reminder_days_check
    check (private.valid_whatsapp_day_offsets(platform_trial_reminder_days_before, 0, 365)),
  add constraint platform_billing_settings_payment_reminder_days_check
    check (private.valid_whatsapp_day_offsets(platform_payment_reminder_days_before, 0, 365)),
  add constraint platform_billing_settings_overdue_days_check
    check (private.valid_whatsapp_day_offsets(platform_overdue_days_after, 1, 365));

alter table public.whatsapp_message_queue
  add column if not exists platform_billing_contract_id uuid,
  add column if not exists platform_billing_charge_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_queue_platform_billing_contract_fk'
      and conrelid = 'public.whatsapp_message_queue'::regclass
  ) then
    alter table public.whatsapp_message_queue
      add constraint whatsapp_queue_platform_billing_contract_fk
      foreign key (platform_billing_contract_id)
      references public.platform_billing_contracts(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_queue_platform_billing_charge_fk'
      and conrelid = 'public.whatsapp_message_queue'::regclass
  ) then
    alter table public.whatsapp_message_queue
      add constraint whatsapp_queue_platform_billing_charge_fk
      foreign key (platform_billing_charge_id)
      references public.platform_billing_charges(id)
      on delete set null
      not valid;
  end if;
end $$;

alter table public.whatsapp_message_queue
  validate constraint whatsapp_queue_platform_billing_contract_fk;

alter table public.whatsapp_message_queue
  validate constraint whatsapp_queue_platform_billing_charge_fk;

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
      'test'
    )
  );

create index if not exists whatsapp_queue_platform_billing_contract_idx
  on public.whatsapp_message_queue (platform_billing_contract_id, status)
  where platform_billing_contract_id is not null;

create index if not exists whatsapp_queue_platform_billing_charge_idx
  on public.whatsapp_message_queue (platform_billing_charge_id, status)
  where platform_billing_charge_id is not null;

create or replace function private.platform_billing_whatsapp_currency(p_value numeric)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'R$ ' || replace(
    replace(
      replace(to_char(coalesce(p_value, 0), 'FM999G999G999G990D00'), ',', '#'),
      '.',
      ','
    ),
    '#',
    '.'
  );
$$;

revoke all on function private.platform_billing_whatsapp_currency(numeric)
  from public, anon, authenticated;
grant execute on function private.platform_billing_whatsapp_currency(numeric)
  to service_role;

create or replace function public.enqueue_due_platform_billing_whatsapp()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  settings public.platform_billing_settings%rowtype;
  sender public.tenant_whatsapp_settings%rowtype;
  notification record;
  local_now timestamp without time zone := clock_timestamp() at time zone 'America/Sao_Paulo';
  local_today date := local_now::date;
  local_time time without time zone := local_now::time;
  days_until_due integer;
  inserted_count integer := 0;
  trial_count integer := 0;
  reminder_count integer := 0;
  overdue_count integer := 0;
begin
  select *
  into settings
  from public.platform_billing_settings
  where id = 'global';

  if not found
     or not settings.enabled
     or not settings.whatsapp_enabled
     or settings.whatsapp_sender_tenant_id is null then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'platform_whatsapp_disabled'
    );
  end if;

  if local_time < settings.platform_notification_time then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'before_notification_time'
    );
  end if;

  select *
  into sender
  from public.tenant_whatsapp_settings
  where tenant_id = settings.whatsapp_sender_tenant_id
    and enabled = true;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'sender_whatsapp_not_enabled'
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
        settings.whatsapp_sender_tenant_id,
        sender.session_id,
        notification.contract_id,
        'platform_trial_reminder',
        'responsible',
        notification.customer_name,
        notification.phone,
        settings.platform_trial_reminder_template,
        jsonb_build_object(
          'platform_billing_contract_id', notification.contract_id,
          'tenant_id', notification.billed_tenant_id,
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
        settings.whatsapp_sender_tenant_id,
        sender.session_id,
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
        settings.whatsapp_sender_tenant_id,
        sender.session_id,
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
  sender public.tenant_whatsapp_settings%rowtype;
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
     or settings.whatsapp_sender_tenant_id is null
     or new.environment <> settings.environment
  then
    return new;
  end if;

  select *
  into sender
  from public.tenant_whatsapp_settings
  where tenant_id = settings.whatsapp_sender_tenant_id
    and enabled = true;

  if not found then
    return new;
  end if;

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
    settings.whatsapp_sender_tenant_id,
    sender.session_id,
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

drop trigger if exists zz_platform_billing_charge_whatsapp
  on public.platform_billing_charges;
create trigger zz_platform_billing_charge_whatsapp
after insert or update of status, due_date on public.platform_billing_charges
for each row execute function private.queue_platform_billing_payment_whatsapp();

create or replace function public.apply_platform_billing_suspensions(
  p_as_of date default current_date
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select distinct
      c.tenant_id,
      c.contract_id,
      c.id as charge_id
    from public.platform_billing_charges c
    cross join public.platform_billing_settings s
    join public.platform_billing_contracts bc on bc.id = c.contract_id
    where s.id = 'global'
      and s.enabled
      and s.auto_suspend
      and c.environment = s.environment
      and c.status = 'overdue'
      and c.due_date + s.grace_days < p_as_of
      and bc.status in ('trialing', 'active', 'past_due')
      and not exists (
        select 1
        from public.platform_billing_charges paid
        where paid.tenant_id = c.tenant_id
          and paid.environment = s.environment
          and paid.status in ('confirmed', 'received')
          and paid.access_applied_at is not null
          and paid.access_reversed_at is null
          and paid.coverage_end >= p_as_of
      )
  loop
    update public.platform_billing_contracts
    set
      status = 'suspended',
      suspended_at = coalesce(suspended_at, now()),
      past_due_since = coalesce(past_due_since, p_as_of)
    where id = v_row.contract_id
      and status in ('trialing', 'active', 'past_due');

    if found then
      update public.tenants t
      set
        status = 'blocked',
        status_reason = 'billing_overdue',
        billing_blocked_at = coalesce(t.billing_blocked_at, now())
      where t.id = v_row.tenant_id
        and (
          t.status <> 'blocked'
          or t.status_reason in ('billing_overdue', 'billing_refund')
        );

      insert into public.platform_billing_audit_log (
        tenant_id,
        contract_id,
        charge_id,
        action,
        entity_type,
        entity_id,
        source,
        after_data
      )
      values (
        v_row.tenant_id,
        v_row.contract_id,
        v_row.charge_id,
        'contract_suspended_for_overdue',
        'contract',
        v_row.contract_id,
        'worker',
        jsonb_build_object('asOf', p_as_of)
      );

      v_count := v_count + 1;
    end if;
  end loop;

  for v_row in
    select
      c.tenant_id,
      c.id as contract_id,
      c.trial_starts_on,
      c.trial_ends_on,
      s.environment
    from public.platform_billing_contracts c
    cross join public.platform_billing_settings s
    where s.id = 'global'
      and s.enabled
      and s.auto_suspend
      and c.status = 'trialing'
      and c.trial_ends_on is not null
      and c.trial_ends_on < p_as_of
      and not exists (
        select 1
        from public.platform_billing_charges paid
        where paid.tenant_id = c.tenant_id
          and paid.environment = s.environment
          and paid.status in ('confirmed', 'received')
          and paid.access_applied_at is not null
          and paid.access_reversed_at is null
          and paid.coverage_end >= p_as_of
      )
  loop
    update public.platform_billing_contracts
    set
      status = 'suspended',
      suspended_at = coalesce(suspended_at, now()),
      past_due_since = coalesce(past_due_since, v_row.trial_ends_on)
    where id = v_row.contract_id
      and status = 'trialing';

    if found then
      update public.tenants t
      set
        status = 'blocked',
        status_reason = 'billing_overdue',
        billing_blocked_at = coalesce(t.billing_blocked_at, now()),
        plan_expires_at = case
          when v_row.trial_ends_on is null
            then t.plan_expires_at
          else least(
            coalesce(t.plan_expires_at, (v_row.trial_ends_on + 1)::timestamptz - interval '1 second'),
            (v_row.trial_ends_on + 1)::timestamptz - interval '1 second'
          )
        end
      where t.id = v_row.tenant_id
        and (
          t.status <> 'blocked'
          or t.status_reason in ('billing_overdue', 'billing_refund')
        );

      insert into public.platform_billing_audit_log (
        tenant_id,
        contract_id,
        action,
        entity_type,
        entity_id,
        source,
        after_data
      )
      values (
        v_row.tenant_id,
        v_row.contract_id,
        'contract_suspended_for_trial_expired',
        'contract',
        v_row.contract_id,
        'worker',
        jsonb_build_object(
          'asOf', p_as_of,
          'trialStartsOn', v_row.trial_starts_on,
          'trialEndsOn', v_row.trial_ends_on
        )
      );

      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;

revoke execute on function public.apply_platform_billing_suspensions(date)
  from public, anon, authenticated;
grant execute on function public.apply_platform_billing_suspensions(date)
  to service_role;

commit;
