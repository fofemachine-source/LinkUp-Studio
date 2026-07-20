-- Close the integrity gaps between public customer accounts, VIP contracts,
-- appointments and commandas. This migration is intentionally forward-only:
-- it also repairs installations where the customer-account migration was
-- applied before the WhatsApp columns were available.

begin;

-- A paid contract must not expose its benefits before the first payment is
-- confirmed by the salon.
alter table public.client_subscriptions
  drop constraint if exists client_subscriptions_status_check;

alter table public.client_subscriptions
  add constraint client_subscriptions_status_check
  check (
    status in (
      'pending_activation',
      'active',
      'overdue',
      'suspended',
      'canceled',
      'expired'
    )
  ) not valid;

alter table public.client_subscriptions
  validate constraint client_subscriptions_status_check;

create or replace function private.enforce_subscription_activation_payment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'active'
     and old.status is distinct from 'active'
     and (
       (
         old.status = 'pending_activation'
         and not exists (
           select 1
           from public.subscription_charges as paid_charge
           where paid_charge.subscription_id = new.id
             and paid_charge.tenant_id = new.tenant_id
             and paid_charge.status = 'paid'
         )
       )
       or exists (
         select 1
         from public.subscription_charges as overdue_charge
         where overdue_charge.subscription_id = new.id
           and overdue_charge.tenant_id = new.tenant_id
           and overdue_charge.status in ('pending', 'overdue')
           and overdue_charge.due_date < (now() at time zone 'America/Sao_Paulo')::date
       )
     ) then
    raise exception
      'Confirme o pagamento da cobrança antes de ativar esta assinatura.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Keep the exact contract selected in the booking all the way through the
-- checkout. Composite foreign keys prevent cross-tenant references.
alter table public.appointments
  add column if not exists subscription_id uuid;

alter table public.commandas
  add column if not exists subscription_id uuid;

-- Cache the latest current-cycle start for display/legacy compatibility. The
-- enforcement below resolves the paid cycle for each booking date, so early
-- or out-of-order payments cannot move quotas incorrectly.
alter table public.client_subscriptions
  add column if not exists benefit_cycle_started_at date;

update public.client_subscriptions
set benefit_cycle_started_at = coalesce(
  benefit_cycle_started_at,
  (
    select max(coalesce(charge.billing_period_start, charge.due_date))
    from public.subscription_charges as charge
    where charge.subscription_id = client_subscriptions.id
      and charge.tenant_id = client_subscriptions.tenant_id
      and charge.status = 'paid'
      and coalesce(charge.billing_period_start, charge.due_date)
        <= (now() at time zone 'America/Sao_Paulo')::date
  ),
  starts_at
)
where benefit_cycle_started_at is null;

alter table public.client_subscriptions
  alter column benefit_cycle_started_at drop default,
  alter column benefit_cycle_started_at set not null;

create or replace function private.initialize_subscription_benefit_cycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.benefit_cycle_started_at := coalesce(
    new.benefit_cycle_started_at,
    new.starts_at,
    (now() at time zone 'America/Sao_Paulo')::date
  );
  return new;
end;
$$;

revoke all on function private.initialize_subscription_benefit_cycle()
  from public, anon, authenticated;

drop trigger if exists initialize_subscription_benefit_cycle
  on public.client_subscriptions;
create trigger initialize_subscription_benefit_cycle
before insert on public.client_subscriptions
for each row execute function private.initialize_subscription_benefit_cycle();

create or replace function private.reset_subscription_benefit_cycle_after_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid'
     and old.status is distinct from 'paid'
     and coalesce(new.billing_period_start, new.due_date)
       <= (now() at time zone 'America/Sao_Paulo')::date
  then
    update public.client_subscriptions
    set benefit_cycle_started_at = greatest(
      benefit_cycle_started_at,
      coalesce(new.billing_period_start, new.due_date)
    )
    where id = new.subscription_id
      and tenant_id = new.tenant_id;
  end if;

  return new;
end;
$$;

revoke all on function private.reset_subscription_benefit_cycle_after_payment()
  from public, anon, authenticated;

drop trigger if exists subscription_benefit_cycle_after_payment
  on public.subscription_charges;
create trigger subscription_benefit_cycle_after_payment
after update of status on public.subscription_charges
for each row execute function private.reset_subscription_benefit_cycle_after_payment();

-- The composite foreign keys below protect tenant isolation. PostgreSQL
-- requires the complete referenced column set to be unique, even though
-- client_subscriptions.id is already the table primary key.
create unique index if not exists client_subscriptions_id_tenant_uidx
  on public.client_subscriptions (id, tenant_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_subscription_tenant_fk'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_subscription_tenant_fk
      foreign key (subscription_id, tenant_id)
      references public.client_subscriptions (id, tenant_id)
      on delete set null (subscription_id)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'commandas_subscription_tenant_fk'
      and conrelid = 'public.commandas'::regclass
  ) then
    alter table public.commandas
      add constraint commandas_subscription_tenant_fk
      foreign key (subscription_id, tenant_id)
      references public.client_subscriptions (id, tenant_id)
      on delete set null (subscription_id)
      not valid;
  end if;
end;
$$;

-- Recover the explicit contract reference from online bookings created by the
-- immediately preceding application version.
with parsed as (
  select
    appointment.id,
    appointment.tenant_id,
    substring(
      appointment.notes
      from '(?i)assinatura ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
    )::uuid as subscription_id
  from public.appointments as appointment
  where appointment.subscription_id is null
    and appointment.is_vip = true
    and appointment.notes ~* 'assinatura [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
)
update public.appointments as appointment
set subscription_id = parsed.subscription_id
from parsed
join public.client_subscriptions as subscription
  on subscription.id = parsed.subscription_id
 and subscription.tenant_id = parsed.tenant_id
where appointment.id = parsed.id;

update public.commandas as commanda
set subscription_id = appointment.subscription_id
from public.appointments as appointment
where commanda.appointment_id = appointment.id
  and commanda.tenant_id = appointment.tenant_id
  and commanda.subscription_id is null
  and appointment.subscription_id is not null;

alter table public.appointments
  validate constraint appointments_subscription_tenant_fk;
alter table public.commandas
  validate constraint commandas_subscription_tenant_fk;

create index if not exists appointments_subscription_future_idx
  on public.appointments (subscription_id, start_at)
  where subscription_id is not null
    and is_vip = true
    and status in ('pending', 'confirmed');

create index if not exists commandas_subscription_idx
  on public.commandas (subscription_id)
  where subscription_id is not null;

-- Serialize reservations for one professional and reject overlapping slots in
-- the database, not only in the browser/server preflight query.
create or replace function private.enforce_appointment_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.status, 'confirmed') not in ('pending', 'confirmed') then
    return new;
  end if;

  if new.end_at <= new.start_at then
    raise exception 'O término do atendimento deve ser posterior ao início.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.tenant_id::text || ':' || new.professional_id::text, 0)
  );

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.tenant_id = new.tenant_id
      and appointment.professional_id = new.professional_id
      and appointment.id is distinct from new.id
      and appointment.status in ('pending', 'confirmed')
      and appointment.start_at < new.end_at
      and appointment.end_at > new.start_at
  ) then
    raise exception 'Este horário já está ocupado. Escolha outro.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_appointment_no_overlap()
  from public, anon, authenticated;

drop trigger if exists enforce_appointment_no_overlap on public.appointments;
create trigger enforce_appointment_no_overlap
before insert or update of professional_id, start_at, end_at, status
on public.appointments
for each row execute function private.enforce_appointment_no_overlap();

-- Resolve the paid quota window for the date being booked/consumed. The
-- result is date-specific, so an early future payment cannot reopen the
-- current cycle and a late old payment cannot move it backwards.
create or replace function private.resolve_subscription_benefit_cycle(
  p_subscription_id uuid,
  p_tenant_id uuid,
  p_reference_at timestamptz
)
returns table (
  cycle_start timestamptz,
  cycle_end timestamptz,
  is_paid boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.client_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_charge record;
  v_reference_date date := (
    p_reference_at at time zone 'America/Sao_Paulo'
  )::date;
  v_start_date date;
  v_end_exclusive_date date;
  v_anchor date;
  v_next_anchor date;
  v_has_charge boolean;
begin
  select subscription.*
    into v_subscription
  from public.client_subscriptions as subscription
  where subscription.id = p_subscription_id
    and subscription.tenant_id = p_tenant_id;

  if not found then
    return query select null::timestamptz, null::timestamptz, false;
    return;
  end if;

  select plan.*
    into v_plan
  from public.subscription_plans as plan
  where plan.id = v_subscription.plan_id
    and plan.tenant_id = p_tenant_id;

  if not found then
    return query select null::timestamptz, null::timestamptz, false;
    return;
  end if;

  for v_charge in
    select
      coalesce(charge.billing_period_start, charge.due_date) as period_start,
      charge.billing_period_end as period_end
    from public.subscription_charges as charge
    where charge.subscription_id = p_subscription_id
      and charge.tenant_id = p_tenant_id
      and charge.status = 'paid'
      and coalesce(charge.billing_period_start, charge.due_date) <= v_reference_date
    order by coalesce(charge.billing_period_start, charge.due_date) desc,
             charge.paid_at desc nulls last,
             charge.id desc
  loop
    v_start_date := v_charge.period_start;
    v_end_exclusive_date := case
      when v_charge.period_end is not null then v_charge.period_end + 1
      when v_plan.billing_cycle = 'weekly' then v_start_date + 7
      when v_plan.billing_cycle = 'biweekly' then v_start_date + 15
      when v_plan.billing_cycle = 'monthly'
        then (v_start_date + interval '1 month')::date
      when v_plan.billing_cycle = 'yearly'
        then (v_start_date + interval '1 year')::date
      when v_subscription.ends_at is not null then v_subscription.ends_at + 1
      else null
    end;

    if v_end_exclusive_date is null or v_reference_date < v_end_exclusive_date then
      return query
      select
        v_start_date::timestamp at time zone 'America/Sao_Paulo',
        case
          when v_end_exclusive_date is null then null::timestamptz
          else v_end_exclusive_date::timestamp at time zone 'America/Sao_Paulo'
        end,
        true;
      return;
    end if;
  end loop;

  select exists (
    select 1
    from public.subscription_charges as charge
    where charge.subscription_id = p_subscription_id
      and charge.tenant_id = p_tenant_id
  ) into v_has_charge;

  -- Free plans and legacy active contracts without any charge keep working;
  -- once financial charges exist, only their paid period can reserve benefits.
  if v_subscription.price > 0 and v_has_charge then
    return query select null::timestamptz, null::timestamptz, false;
    return;
  end if;

  v_anchor := coalesce(v_subscription.benefit_cycle_started_at, v_subscription.starts_at);
  if v_plan.billing_cycle not in ('one_time') then
    for v_index in 1..240 loop
      v_next_anchor := case v_plan.billing_cycle
        when 'weekly' then v_anchor + 7
        when 'biweekly' then v_anchor + 15
        when 'monthly' then (v_anchor + interval '1 month')::date
        when 'yearly' then (v_anchor + interval '1 year')::date
        else null
      end;
      exit when v_next_anchor is null or v_reference_date < v_next_anchor;
      v_anchor := v_next_anchor;
    end loop;
  end if;

  v_end_exclusive_date := case
    when v_plan.billing_cycle = 'weekly' then v_anchor + 7
    when v_plan.billing_cycle = 'biweekly' then v_anchor + 15
    when v_plan.billing_cycle = 'monthly' then (v_anchor + interval '1 month')::date
    when v_plan.billing_cycle = 'yearly' then (v_anchor + interval '1 year')::date
    when v_subscription.ends_at is not null then v_subscription.ends_at + 1
    else null
  end;

  if v_end_exclusive_date is not null
     and v_reference_date >= v_end_exclusive_date
  then
    return query select null::timestamptz, null::timestamptz, false;
    return;
  end if;

  return query
  select
    v_anchor::timestamp at time zone 'America/Sao_Paulo',
    case
      when v_end_exclusive_date is null then null::timestamptz
      else v_end_exclusive_date::timestamp at time zone 'America/Sao_Paulo'
    end,
    true;
end;
$$;

revoke all on function private.resolve_subscription_benefit_cycle(
  uuid, uuid, timestamptz
) from public, anon, authenticated;

-- The application shows a live available balance, while this trigger closes
-- the concurrency gap between two simultaneous booking requests.
create or replace function private.enforce_vip_booking_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.client_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_benefit public.subscription_plan_benefits%rowtype;
  v_booking_date date;
  v_is_covered boolean;
  v_reserved integer;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_cycle_paid boolean;
  v_benefit_used integer;
  v_benefit_reserved integer;
  v_day_start timestamptz;
  v_week_start timestamptz;
  v_month_start timestamptz;
  v_usage_count integer;
  v_reservation_count integer;
  v_day_count integer;
  v_week_count integer;
  v_month_count integer;
begin
  if new.subscription_id is null
     or new.is_vip is distinct from true
     or coalesce(new.status, 'confirmed') not in ('pending', 'confirmed')
  then
    return new;
  end if;

  select subscription.*
    into v_subscription
  from public.client_subscriptions as subscription
  where subscription.id = new.subscription_id
    and subscription.tenant_id = new.tenant_id
  for update;

  if not found then
    raise exception 'A assinatura vinculada ao agendamento não foi encontrada.'
      using errcode = 'P0002';
  end if;

  if v_subscription.client_id is not null
     and new.client_id is distinct from v_subscription.client_id
  then
    raise exception 'A assinatura não pertence ao cliente do agendamento.'
      using errcode = 'P0001';
  end if;

  v_booking_date := (new.start_at at time zone 'America/Sao_Paulo')::date;
  if v_subscription.status <> 'active'
     or v_subscription.starts_at > v_booking_date
     or (v_subscription.ends_at is not null and v_subscription.ends_at < v_booking_date)
  then
    raise exception 'A assinatura não está ativa na data escolhida.'
      using errcode = 'P0001';
  end if;

  select plan.*
    into v_plan
  from public.subscription_plans as plan
  where plan.id = v_subscription.plan_id
    and plan.tenant_id = new.tenant_id;

  if not found then
    raise exception 'O plano vinculado à assinatura não foi encontrado.'
      using errcode = 'P0002';
  end if;

  select benefit.*
    into v_benefit
  from public.subscription_plan_benefits as benefit
  where benefit.tenant_id = new.tenant_id
    and benefit.plan_id = v_subscription.plan_id
    and benefit.active = true
    and benefit.benefit_type = 'service'
    and benefit.service_id = new.service_id
  order by benefit.created_at, benefit.id
  limit 1;

  v_is_covered := found;

  if not v_is_covered then
    if not (coalesce(v_plan.allow_extras, false)
            or not coalesce(v_plan.included_services_only, false)) then
      raise exception 'Este serviço não está incluído na assinatura.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  select resolved.cycle_start, resolved.cycle_end, resolved.is_paid
    into v_cycle_start, v_cycle_end, v_cycle_paid
  from private.resolve_subscription_benefit_cycle(
    v_subscription.id,
    new.tenant_id,
    new.start_at
  ) as resolved;

  if not coalesce(v_cycle_paid, false) then
    raise exception 'Confirme o pagamento deste ciclo antes de reservar o benefício.'
      using errcode = 'P0001';
  end if;

  if v_subscription.sessions_remaining is not null then
    select count(*)::integer
      into v_reserved
    from public.appointments as appointment
    where appointment.subscription_id = new.subscription_id
      and appointment.id is distinct from new.id
      and appointment.is_vip = true
      and appointment.status in ('pending', 'confirmed')
      and appointment.start_at >= clock_timestamp()
      and not exists (
        select 1
        from public.subscription_usages as usage
        where usage.appointment_id = appointment.id
          and usage.subscription_id = appointment.subscription_id
      )
      and exists (
        select 1
        from public.subscription_plan_benefits as benefit
        where benefit.tenant_id = new.tenant_id
          and benefit.plan_id = v_subscription.plan_id
          and benefit.active = true
          and benefit.benefit_type = 'service'
          and benefit.service_id = appointment.service_id
      );

    if v_reserved >= v_subscription.sessions_remaining then
      raise exception 'Não há sessões VIP livres para esta reserva.'
        using errcode = 'P0001';
    end if;
  end if;

  if v_benefit.quantity is not null then
    select coalesce(sum(usage.quantity), 0)::integer
      into v_benefit_used
    from public.subscription_usages as usage
    where usage.subscription_id = v_subscription.id
      and usage.used_at >= v_cycle_start
      and (v_cycle_end is null or usage.used_at < v_cycle_end)
      and (
        usage.benefit_id = v_benefit.id
        or (usage.benefit_id is null and usage.service_id = new.service_id)
      );

    select count(*)::integer
      into v_benefit_reserved
    from public.appointments as appointment
    where appointment.subscription_id = v_subscription.id
      and appointment.id is distinct from new.id
      and appointment.service_id = new.service_id
      and appointment.is_vip = true
      and appointment.status in ('pending', 'confirmed')
      and appointment.start_at >= v_cycle_start
      and (v_cycle_end is null or appointment.start_at < v_cycle_end)
      and not exists (
        select 1
        from public.subscription_usages as usage
        where usage.appointment_id = appointment.id
          and usage.subscription_id = appointment.subscription_id
      );

    if v_benefit_used + v_benefit_reserved + 1 > v_benefit.quantity then
      raise exception 'O limite deste benefício já foi utilizado ou reservado.'
        using errcode = 'P0001';
    end if;
  end if;

  -- A booking reserves the same daily, weekly and monthly allowance that the
  -- checkout consumes later. Consumed appointments are excluded to avoid
  -- counting the same visit twice.
  v_day_start := date_trunc(
    'day', new.start_at at time zone 'America/Sao_Paulo'
  ) at time zone 'America/Sao_Paulo';
  v_week_start := date_trunc(
    'week', new.start_at at time zone 'America/Sao_Paulo'
  ) at time zone 'America/Sao_Paulo';
  v_month_start := date_trunc(
    'month', new.start_at at time zone 'America/Sao_Paulo'
  ) at time zone 'America/Sao_Paulo';

  select coalesce(sum(usage.quantity), 0)::integer
    into v_usage_count
  from public.subscription_usages as usage
  where usage.subscription_id = v_subscription.id
    and usage.used_at >= v_day_start
    and usage.used_at < v_day_start + interval '1 day';
  select count(*)::integer
    into v_reservation_count
  from public.appointments as appointment
  where appointment.subscription_id = v_subscription.id
    and appointment.id is distinct from new.id
    and appointment.is_vip = true
    and appointment.status in ('pending', 'confirmed')
    and appointment.start_at >= v_day_start
    and appointment.start_at < v_day_start + interval '1 day'
    and not exists (
      select 1 from public.subscription_usages as usage
      where usage.appointment_id = appointment.id
        and usage.subscription_id = appointment.subscription_id
    )
    and exists (
      select 1 from public.subscription_plan_benefits as benefit
      where benefit.tenant_id = new.tenant_id
        and benefit.plan_id = v_subscription.plan_id
        and benefit.active = true
        and benefit.benefit_type = 'service'
        and benefit.service_id = appointment.service_id
    );
  v_day_count := v_usage_count + v_reservation_count;

  select coalesce(sum(usage.quantity), 0)::integer
    into v_usage_count
  from public.subscription_usages as usage
  where usage.subscription_id = v_subscription.id
    and usage.used_at >= v_week_start
    and usage.used_at < v_week_start + interval '1 week';
  select count(*)::integer
    into v_reservation_count
  from public.appointments as appointment
  where appointment.subscription_id = v_subscription.id
    and appointment.id is distinct from new.id
    and appointment.is_vip = true
    and appointment.status in ('pending', 'confirmed')
    and appointment.start_at >= v_week_start
    and appointment.start_at < v_week_start + interval '1 week'
    and not exists (
      select 1 from public.subscription_usages as usage
      where usage.appointment_id = appointment.id
        and usage.subscription_id = appointment.subscription_id
    )
    and exists (
      select 1 from public.subscription_plan_benefits as benefit
      where benefit.tenant_id = new.tenant_id
        and benefit.plan_id = v_subscription.plan_id
        and benefit.active = true
        and benefit.benefit_type = 'service'
        and benefit.service_id = appointment.service_id
    );
  v_week_count := v_usage_count + v_reservation_count;

  select coalesce(sum(usage.quantity), 0)::integer
    into v_usage_count
  from public.subscription_usages as usage
  where usage.subscription_id = v_subscription.id
    and usage.used_at >= v_month_start
    and usage.used_at < v_month_start + interval '1 month';
  select count(*)::integer
    into v_reservation_count
  from public.appointments as appointment
  where appointment.subscription_id = v_subscription.id
    and appointment.id is distinct from new.id
    and appointment.is_vip = true
    and appointment.status in ('pending', 'confirmed')
    and appointment.start_at >= v_month_start
    and appointment.start_at < v_month_start + interval '1 month'
    and not exists (
      select 1 from public.subscription_usages as usage
      where usage.appointment_id = appointment.id
        and usage.subscription_id = appointment.subscription_id
    )
    and exists (
      select 1 from public.subscription_plan_benefits as benefit
      where benefit.tenant_id = new.tenant_id
        and benefit.plan_id = v_subscription.plan_id
        and benefit.active = true
        and benefit.benefit_type = 'service'
        and benefit.service_id = appointment.service_id
    );
  v_month_count := v_usage_count + v_reservation_count;

  if not v_plan.allow_multiple_same_day and v_day_count > 0 then
    raise exception 'Este plano não permite mais de uma reserva no mesmo dia.'
      using errcode = 'P0001';
  end if;
  if v_plan.max_per_day is not null and v_day_count + 1 > v_plan.max_per_day then
    raise exception 'Limite diário de utilizações atingido.' using errcode = 'P0001';
  end if;
  if v_plan.max_per_week is not null and v_week_count + 1 > v_plan.max_per_week then
    raise exception 'Limite semanal de utilizações atingido.' using errcode = 'P0001';
  end if;
  if v_plan.max_per_month is not null and v_month_count + 1 > v_plan.max_per_month then
    raise exception 'Limite mensal de utilizações atingido.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_vip_booking_reservation()
  from public, anon, authenticated;

drop trigger if exists enforce_vip_booking_reservation on public.appointments;
create trigger enforce_vip_booking_reservation
before insert or update of subscription_id, client_id, service_id, start_at, status, is_vip
on public.appointments
for each row execute function private.enforce_vip_booking_reservation();

-- Checkout/manual consumption must obey the same per-benefit quantity as the
-- public reservation flow. This also protects direct service-role inserts.
create or replace function private.enforce_subscription_benefit_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.client_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_benefit public.subscription_plan_benefits%rowtype;
  v_cycle_start timestamptz;
  v_cycle_end timestamptz;
  v_cycle_paid boolean;
  v_used integer;
  v_reserved integer;
  v_reference_at timestamptz := coalesce(new.used_at, clock_timestamp());
  v_day_start timestamptz;
  v_week_start timestamptz;
  v_month_start timestamptz;
  v_usage_count integer;
  v_reservation_count integer;
  v_day_count integer;
  v_week_count integer;
  v_month_count integer;
begin
  if new.benefit_id is null and new.service_id is null then
    return new;
  end if;

  select subscription.*
    into v_subscription
  from public.client_subscriptions as subscription
  where subscription.id = new.subscription_id
    and subscription.tenant_id = new.tenant_id
  for update;

  if not found then
    raise exception 'A assinatura do consumo não foi encontrada.'
      using errcode = 'P0002';
  end if;

  select plan.*
    into v_plan
  from public.subscription_plans as plan
  where plan.id = v_subscription.plan_id
    and plan.tenant_id = new.tenant_id;

  if not found then
    raise exception 'O plano da assinatura não foi encontrado.'
      using errcode = 'P0002';
  end if;

  select benefit.*
    into v_benefit
  from public.subscription_plan_benefits as benefit
  where benefit.tenant_id = new.tenant_id
    and benefit.plan_id = v_subscription.plan_id
    and benefit.active = true
    and benefit.benefit_type = 'service'
    and (
      (new.benefit_id is not null and benefit.id = new.benefit_id)
      or (new.benefit_id is null and benefit.service_id = new.service_id)
    )
  order by benefit.created_at, benefit.id
  limit 1;

  if not found then
    raise exception 'O benefício não pertence a esta assinatura.'
      using errcode = 'P0001';
  end if;

  if new.service_id is not null
     and v_benefit.service_id is distinct from new.service_id
  then
    raise exception 'O serviço não corresponde ao benefício informado.'
      using errcode = 'P0001';
  end if;

  select resolved.cycle_start, resolved.cycle_end, resolved.is_paid
    into v_cycle_start, v_cycle_end, v_cycle_paid
  from private.resolve_subscription_benefit_cycle(
    v_subscription.id,
    new.tenant_id,
    v_reference_at
  ) as resolved;

  if not coalesce(v_cycle_paid, false) then
    raise exception 'Confirme o pagamento deste ciclo antes de consumir o benefício.'
      using errcode = 'P0001';
  end if;

  if v_benefit.quantity is not null then

    select coalesce(sum(usage.quantity), 0)::integer
      into v_used
    from public.subscription_usages as usage
    where usage.subscription_id = new.subscription_id
      and usage.used_at >= v_cycle_start
      and (v_cycle_end is null or usage.used_at < v_cycle_end)
      and (
        usage.benefit_id = v_benefit.id
        or (usage.benefit_id is null and usage.service_id = v_benefit.service_id)
      );

    select count(*)::integer
      into v_reserved
    from public.appointments as appointment
    where appointment.subscription_id = new.subscription_id
      and appointment.id is distinct from new.appointment_id
      and appointment.service_id = v_benefit.service_id
      and appointment.is_vip = true
      and appointment.status in ('pending', 'confirmed')
      and appointment.start_at >= v_cycle_start
      and (v_cycle_end is null or appointment.start_at < v_cycle_end)
      and not exists (
        select 1 from public.subscription_usages as usage
        where usage.appointment_id = appointment.id
          and usage.subscription_id = appointment.subscription_id
      );

    if v_used + v_reserved + new.quantity > v_benefit.quantity then
      raise exception 'O limite deste benefício foi atingido neste ciclo.'
        using errcode = 'P0001';
    end if;
  end if;

  v_day_start := date_trunc(
    'day', v_reference_at at time zone 'America/Sao_Paulo'
  ) at time zone 'America/Sao_Paulo';
  v_week_start := date_trunc(
    'week', v_reference_at at time zone 'America/Sao_Paulo'
  ) at time zone 'America/Sao_Paulo';
  v_month_start := date_trunc(
    'month', v_reference_at at time zone 'America/Sao_Paulo'
  ) at time zone 'America/Sao_Paulo';

  select coalesce(sum(usage.quantity), 0)::integer
    into v_usage_count
  from public.subscription_usages as usage
  where usage.subscription_id = new.subscription_id
    and usage.used_at >= v_day_start
    and usage.used_at < v_day_start + interval '1 day';
  select count(*)::integer
    into v_reservation_count
  from public.appointments as appointment
  where appointment.subscription_id = new.subscription_id
    and appointment.id is distinct from new.appointment_id
    and appointment.is_vip = true
    and appointment.status in ('pending', 'confirmed')
    and appointment.start_at >= v_day_start
    and appointment.start_at < v_day_start + interval '1 day'
    and not exists (
      select 1 from public.subscription_usages as usage
      where usage.appointment_id = appointment.id
        and usage.subscription_id = appointment.subscription_id
    )
    and exists (
      select 1 from public.subscription_plan_benefits as benefit
      where benefit.tenant_id = new.tenant_id
        and benefit.plan_id = v_subscription.plan_id
        and benefit.active = true
        and benefit.benefit_type = 'service'
        and benefit.service_id = appointment.service_id
    );
  v_day_count := v_usage_count + v_reservation_count;

  select coalesce(sum(usage.quantity), 0)::integer
    into v_usage_count
  from public.subscription_usages as usage
  where usage.subscription_id = new.subscription_id
    and usage.used_at >= v_week_start
    and usage.used_at < v_week_start + interval '1 week';
  select count(*)::integer
    into v_reservation_count
  from public.appointments as appointment
  where appointment.subscription_id = new.subscription_id
    and appointment.id is distinct from new.appointment_id
    and appointment.is_vip = true
    and appointment.status in ('pending', 'confirmed')
    and appointment.start_at >= v_week_start
    and appointment.start_at < v_week_start + interval '1 week'
    and not exists (
      select 1 from public.subscription_usages as usage
      where usage.appointment_id = appointment.id
        and usage.subscription_id = appointment.subscription_id
    )
    and exists (
      select 1 from public.subscription_plan_benefits as benefit
      where benefit.tenant_id = new.tenant_id
        and benefit.plan_id = v_subscription.plan_id
        and benefit.active = true
        and benefit.benefit_type = 'service'
        and benefit.service_id = appointment.service_id
    );
  v_week_count := v_usage_count + v_reservation_count;

  select coalesce(sum(usage.quantity), 0)::integer
    into v_usage_count
  from public.subscription_usages as usage
  where usage.subscription_id = new.subscription_id
    and usage.used_at >= v_month_start
    and usage.used_at < v_month_start + interval '1 month';
  select count(*)::integer
    into v_reservation_count
  from public.appointments as appointment
  where appointment.subscription_id = new.subscription_id
    and appointment.id is distinct from new.appointment_id
    and appointment.is_vip = true
    and appointment.status in ('pending', 'confirmed')
    and appointment.start_at >= v_month_start
    and appointment.start_at < v_month_start + interval '1 month'
    and not exists (
      select 1 from public.subscription_usages as usage
      where usage.appointment_id = appointment.id
        and usage.subscription_id = appointment.subscription_id
    )
    and exists (
      select 1 from public.subscription_plan_benefits as benefit
      where benefit.tenant_id = new.tenant_id
        and benefit.plan_id = v_subscription.plan_id
        and benefit.active = true
        and benefit.benefit_type = 'service'
        and benefit.service_id = appointment.service_id
    );
  v_month_count := v_usage_count + v_reservation_count;

  if not v_plan.allow_multiple_same_day
     and (v_day_count > 0 or new.quantity > 1)
  then
    raise exception 'Este plano não permite mais de uma utilização no mesmo dia.'
      using errcode = 'P0001';
  end if;
  if v_plan.max_per_day is not null
     and v_day_count + new.quantity > v_plan.max_per_day
  then
    raise exception 'Limite diário de utilizações atingido.' using errcode = 'P0001';
  end if;
  if v_plan.max_per_week is not null
     and v_week_count + new.quantity > v_plan.max_per_week
  then
    raise exception 'Limite semanal de utilizações atingido.' using errcode = 'P0001';
  end if;
  if v_plan.max_per_month is not null
     and v_month_count + new.quantity > v_plan.max_per_month
  then
    raise exception 'Limite mensal de utilizações atingido.' using errcode = 'P0001';
  end if;

  new.benefit_id := v_benefit.id;
  return new;
end;
$$;

revoke all on function private.enforce_subscription_benefit_quantity()
  from public, anon, authenticated;

drop trigger if exists subscription_benefit_quantity_guard
  on public.subscription_usages;
create trigger subscription_benefit_quantity_guard
before insert on public.subscription_usages
for each row execute function private.enforce_subscription_benefit_quantity();

-- Customer credentials are never a browser concern. Public booking is served
-- by trusted server functions, so inherited anonymous grants on clients are
-- unnecessary and increase the attack surface.
revoke select, insert, update, delete on table public.clients from anon;

-- CPF is the customer login identifier. When a manager corrects it in
-- Cadastros, update the credential atomically and revoke old browser sessions;
-- otherwise the previous CPF would keep authenticating invisibly.
create or replace function private.sync_customer_booking_account_cpf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
begin
  if new.cpf is not distinct from old.cpf then
    return new;
  end if;

  select account.id
    into v_account_id
  from public.customer_booking_accounts as account
  where account.tenant_id = new.tenant_id
    and account.client_id = new.id
  for update;

  if not found then
    return new;
  end if;

  if new.cpf is null or new.cpf !~ '^[0-9]{11}$' then
    raise exception 'O CPF não pode ser removido enquanto o cliente possui acesso.'
      using errcode = 'P0001';
  end if;

  update public.customer_booking_accounts
  set
    cpf_hash = encode(extensions.digest(new.cpf, 'sha256'), 'hex'),
    failed_login_attempts = 0,
    locked_until = null
  where id = v_account_id
    and tenant_id = new.tenant_id;

  delete from public.customer_booking_sessions
  where account_id = v_account_id
    and tenant_id = new.tenant_id;

  return new;
end;
$$;

revoke all on function private.sync_customer_booking_account_cpf()
  from public, anon, authenticated;

drop trigger if exists sync_customer_booking_account_cpf
  on public.clients;
create trigger sync_customer_booking_account_cpf
before update of cpf on public.clients
for each row execute function private.sync_customer_booking_account_cpf();

-- Consent is explicit in the public registration form. Existing timestamps
-- are preserved; future accounts only receive one after an affirmative choice.
alter table public.customer_booking_accounts
  alter column whatsapp_consent_at drop not null,
  alter column whatsapp_consent_at drop default;

-- Small server-only rate-limit ledger. It protects the deliberately expensive
-- password hashing work from anonymous bursts without exposing IP addresses
-- (the application stores only a SHA-256 fingerprint).
create table if not exists public.customer_booking_rate_limits (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  scope text not null check (scope in ('register', 'login')),
  fingerprint_hash text not null check (fingerprint_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, scope, fingerprint_hash)
);

create index if not exists customer_booking_rate_limits_updated_idx
  on public.customer_booking_rate_limits (updated_at);

revoke all on table public.customer_booking_rate_limits
  from public, anon, authenticated;
grant all on table public.customer_booking_rate_limits to service_role;
alter table public.customer_booking_rate_limits enable row level security;

create or replace function public.consume_booking_customer_rate_limit(
  p_tenant_id uuid,
  p_scope text,
  p_fingerprint_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.customer_booking_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_scope not in ('register', 'login')
    or p_fingerprint_hash !~ '^[a-f0-9]{64}$'
    or p_limit < 1
    or p_window_seconds < 1
    or p_block_seconds < 1
  then
    raise exception 'INVALID_RATE_LIMIT_INPUT' using errcode = '22023';
  end if;

  if p_scope = 'register' then
    delete from public.customer_booking_rate_limits
    where updated_at < v_now - interval '7 days';
  end if;

  insert into public.customer_booking_rate_limits (
    tenant_id,
    scope,
    fingerprint_hash,
    window_started_at,
    attempts,
    updated_at
  )
  values (p_tenant_id, p_scope, p_fingerprint_hash, v_now, 0, v_now)
  on conflict (tenant_id, scope, fingerprint_hash) do nothing;

  select rate_limit.*
    into v_row
  from public.customer_booking_rate_limits as rate_limit
  where rate_limit.tenant_id = p_tenant_id
    and rate_limit.scope = p_scope
    and rate_limit.fingerprint_hash = p_fingerprint_hash
  for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return false;
  end if;

  if v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds) then
    update public.customer_booking_rate_limits
    set
      window_started_at = v_now,
      attempts = 1,
      blocked_until = null,
      updated_at = v_now
    where tenant_id = p_tenant_id
      and scope = p_scope
      and fingerprint_hash = p_fingerprint_hash;
    return true;
  end if;

  if v_row.attempts >= p_limit then
    update public.customer_booking_rate_limits
    set
      blocked_until = v_now + make_interval(secs => p_block_seconds),
      updated_at = v_now
    where tenant_id = p_tenant_id
      and scope = p_scope
      and fingerprint_hash = p_fingerprint_hash;
    return false;
  end if;

  update public.customer_booking_rate_limits
  set
    attempts = attempts + 1,
    updated_at = v_now
  where tenant_id = p_tenant_id
    and scope = p_scope
    and fingerprint_hash = p_fingerprint_hash;

  return true;
end;
$$;

revoke all on function public.consume_booking_customer_rate_limit(
  uuid, text, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.consume_booking_customer_rate_limit(
  uuid, text, text, integer, integer, integer
) to service_role;

create or replace function public.record_booking_customer_login_failure(
  p_tenant_id uuid,
  p_cpf_hash text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.customer_booking_accounts%rowtype;
  v_attempts integer;
  v_lock_minutes integer;
  v_locked_until timestamptz;
begin
  select account.*
    into v_account
  from public.customer_booking_accounts as account
  where account.tenant_id = p_tenant_id
    and account.cpf_hash = p_cpf_hash
  for update;

  if not found then
    return null;
  end if;

  v_attempts := least(coalesce(v_account.failed_login_attempts, 0) + 1, 1000);
  v_lock_minutes := case
    when v_attempts < 5 then 0
    when v_attempts < 10 then 15
    when v_attempts < 15 then 30
    when v_attempts < 20 then 60
    else 120
  end;
  v_locked_until := case
    when v_lock_minutes > 0 then clock_timestamp() + make_interval(mins => v_lock_minutes)
    else null
  end;

  update public.customer_booking_accounts
  set
    failed_login_attempts = v_attempts,
    locked_until = v_locked_until
  where id = v_account.id;

  return v_locked_until;
end;
$$;

create or replace function public.record_booking_customer_login_success(
  p_account_id uuid,
  p_tenant_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.customer_booking_accounts
  set
    failed_login_attempts = 0,
    locked_until = null,
    last_login_at = clock_timestamp()
  where id = p_account_id
    and tenant_id = p_tenant_id;

  return found;
end;
$$;

revoke all on function public.record_booking_customer_login_failure(uuid, text)
  from public, anon, authenticated;
revoke all on function public.record_booking_customer_login_success(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_booking_customer_login_failure(uuid, text)
  to service_role;
grant execute on function public.record_booking_customer_login_success(uuid, uuid)
  to service_role;

-- Salon-assisted first access for legacy/manual clients. The short-lived code
-- is shown once to an authenticated manager and only its hash is stored.
create table if not exists public.customer_booking_activation_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_booking_activation_codes_client_idx
  on public.customer_booking_activation_codes (tenant_id, client_id, expires_at desc);

revoke all on table public.customer_booking_activation_codes
  from public, anon, authenticated;
grant all on table public.customer_booking_activation_codes to service_role;
alter table public.customer_booking_activation_codes enable row level security;

create or replace function public.create_customer_booking_activation_code(
  p_tenant_id uuid,
  p_client_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_code text;
begin
  if not private.can_manage_tenant_operations(p_tenant_id) then
    raise exception 'Você não tem permissão para liberar este acesso.'
      using errcode = '42501';
  end if;

  select client.*
    into v_client
  from public.clients as client
  where client.id = p_client_id
    and client.tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if v_client.cpf is null or v_client.cpf !~ '^[0-9]{11}$' then
    raise exception 'Cadastre um CPF válido antes de liberar o primeiro acesso.'
      using errcode = 'P0001';
  end if;
  update public.customer_booking_activation_codes
  set used_at = clock_timestamp()
  where tenant_id = p_tenant_id
    and client_id = p_client_id
    and used_at is null;

  v_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  insert into public.customer_booking_activation_codes (
    tenant_id,
    client_id,
    code_hash,
    expires_at,
    created_by
  )
  values (
    p_tenant_id,
    p_client_id,
    encode(extensions.digest(v_code, 'sha256'), 'hex'),
    clock_timestamp() + interval '24 hours',
    (select auth.uid())
  );

  return v_code;
end;
$$;

revoke all on function public.create_customer_booking_activation_code(uuid, uuid)
  from public, anon;
grant execute on function public.create_customer_booking_activation_code(uuid, uuid)
  to authenticated, service_role;

-- Atomic self-registration. Existing/manual clients and password resets require
-- the salon-assisted one-time code, preventing account takeover with CPF data.
create or replace function public.register_booking_customer(
  p_tenant_id uuid,
  p_full_name text,
  p_cpf text,
  p_whatsapp text,
  p_cpf_hash text,
  p_password_hash text,
  p_whatsapp_consent boolean default false,
  p_activation_code text default null
)
returns table (
  account_id uuid,
  client_id uuid,
  full_name text,
  whatsapp text,
  cpf text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_existing_account public.customer_booking_accounts%rowtype;
  v_has_existing_account boolean := false;
  v_account_id uuid;
  v_activation public.customer_booking_activation_codes%rowtype;
begin
  if not exists (
    select 1
    from public.tenants as tenant
    where tenant.id = p_tenant_id
      and tenant.status = 'active'
  ) then
    raise exception 'BOOKING_LINK_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) < 2
    or p_cpf !~ '^[0-9]{11}$'
    or p_whatsapp !~ '^[0-9]{10,13}$'
    or p_cpf_hash !~ '^[a-f0-9]{64}$'
    or p_password_hash is null
  then
    raise exception 'INVALID_CUSTOMER_REGISTRATION' using errcode = '22023';
  end if;

  -- Serialize registrations for the same tenant/CPF and make the client plus
  -- account insertion one database transaction.
  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || p_cpf_hash, 0)
  );

  select account.*
    into v_existing_account
  from public.customer_booking_accounts as account
  where account.tenant_id = p_tenant_id
    and account.cpf_hash = p_cpf_hash
  for update;

  v_has_existing_account := found;

  if v_has_existing_account then
    select client.*
      into v_client
    from public.clients as client
    where client.tenant_id = p_tenant_id
      and client.id = v_existing_account.client_id
    for update;
  else
    select client.*
      into v_client
    from public.clients as client
    where client.tenant_id = p_tenant_id
      and client.cpf = p_cpf
    for update;
  end if;

  if found then
    if p_activation_code is null or btrim(p_activation_code) = '' then
      raise exception 'EXISTING_CUSTOMER_REQUIRES_ACTIVATION' using errcode = 'P0001';
    end if;

    select activation.*
      into v_activation
    from public.customer_booking_activation_codes as activation
    where activation.tenant_id = p_tenant_id
      and activation.client_id = v_client.id
      and activation.code_hash = encode(
        extensions.digest(
          upper(regexp_replace(p_activation_code, '[^0-9A-Fa-f]', '', 'g')),
          'sha256'
        ),
        'hex'
      )
      and activation.used_at is null
      and activation.expires_at > clock_timestamp()
    order by activation.created_at desc
    limit 1
    for update;

    if not found then
      raise exception 'INVALID_CUSTOMER_ACTIVATION' using errcode = 'P0001';
    end if;

    update public.clients
    set
      full_name = btrim(p_full_name),
      whatsapp = p_whatsapp,
      cpf = p_cpf
    where id = v_client.id
    returning * into v_client;

    update public.customer_booking_activation_codes
    set used_at = clock_timestamp()
    where id = v_activation.id;

    update public.client_subscriptions
    set
      client_id = v_client.id,
      subscriber_name = v_client.full_name,
      whatsapp = v_client.whatsapp,
      cpf = p_cpf
    where tenant_id = p_tenant_id
      and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = p_cpf
      and (client_id is null or client_id = v_client.id);

    update public.clients
    set is_subscriber = exists (
      select 1
      from public.client_subscriptions as subscription
      where subscription.tenant_id = p_tenant_id
        and subscription.client_id = v_client.id
        and subscription.status in ('pending_activation', 'active', 'overdue', 'suspended')
    )
    where id = v_client.id
      and tenant_id = p_tenant_id;
  else
    if exists (
      select 1
      from public.client_subscriptions as subscription
      where subscription.tenant_id = p_tenant_id
        and regexp_replace(coalesce(subscription.cpf, ''), '[^0-9]', '', 'g') = p_cpf
    ) then
      raise exception 'EXISTING_CUSTOMER_REQUIRES_ACTIVATION' using errcode = 'P0001';
    end if;

    insert into public.clients (
      tenant_id,
      full_name,
      whatsapp,
      cpf,
      is_subscriber
    )
    values (
      p_tenant_id,
      btrim(p_full_name),
      p_whatsapp,
      p_cpf,
      false
    )
    returning * into v_client;
  end if;

  if v_has_existing_account then
    update public.customer_booking_accounts
    set
      password_hash = p_password_hash,
      failed_login_attempts = 0,
      locked_until = null,
      whatsapp_consent_at = case
        when p_whatsapp_consent then coalesce(whatsapp_consent_at, clock_timestamp())
        else whatsapp_consent_at
      end
    where id = v_existing_account.id
      and tenant_id = p_tenant_id
    returning id into v_account_id;

    -- A password reset invalidates every previously issued browser session.
    delete from public.customer_booking_sessions
    where account_id = v_existing_account.id
      and tenant_id = p_tenant_id;
  else
    insert into public.customer_booking_accounts (
      tenant_id,
      client_id,
      cpf_hash,
      password_hash,
      whatsapp_consent_at
    )
    values (
      p_tenant_id,
      v_client.id,
      p_cpf_hash,
      p_password_hash,
      case when p_whatsapp_consent then now() else null end
    )
    returning id into v_account_id;
  end if;

  return query
  select
    v_account_id,
    v_client.id,
    v_client.full_name,
    v_client.whatsapp,
    v_client.cpf;
end;
$$;

revoke all on function public.register_booking_customer(
  uuid, text, text, text, text, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.register_booking_customer(
  uuid, text, text, text, text, text, boolean, text
) to service_role;

-- Repair the WhatsApp registration settings on databases where the earlier
-- customer migration stopped after creating the account/session tables.
alter table public.tenant_whatsapp_settings
  add column if not exists notify_client_registration boolean not null default true,
  add column if not exists client_registration_template text not null default
    'Olá, {cliente}! Seu cadastro em {salao} foi confirmado. Agora você pode entrar com seu CPF e senha para agendar com mais rapidez.';

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
      'test'
    )
  );

create or replace function private.enqueue_customer_registration_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.tenant_whatsapp_settings%rowtype;
  client_row public.clients%rowtype;
  tenant_name text;
  client_phone text;
begin
  if new.whatsapp_consent_at is null then
    return new;
  end if;

  select whatsapp_settings.*
    into settings
  from public.tenant_whatsapp_settings as whatsapp_settings
  where whatsapp_settings.tenant_id = new.tenant_id
    and whatsapp_settings.enabled = true
    and whatsapp_settings.notify_client_registration = true;

  if not found then
    return new;
  end if;

  select client.*
    into client_row
  from public.clients as client
  where client.id = new.client_id
    and client.tenant_id = new.tenant_id;

  if not found then
    return new;
  end if;

  client_phone := regexp_replace(coalesce(client_row.whatsapp, ''), '[^0-9]', '', 'g');
  if length(client_phone) < 10 then
    return new;
  end if;

  select tenant.name
    into tenant_name
  from public.tenants as tenant
  where tenant.id = new.tenant_id;

  insert into public.whatsapp_message_queue (
    tenant_id,
    session_id,
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
    settings.session_id,
    'client_registered',
    'client',
    client_row.full_name,
    client_phone,
    settings.client_registration_template,
    jsonb_build_object(
      'account_id', new.id,
      'tenant_id', new.tenant_id,
      'salao', coalesce(tenant_name, 'Salão'),
      'cliente', client_row.full_name
    ),
    now() + interval '3 seconds',
    new.id::text || ':registered:client'
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_customer_registration_whatsapp()
  from public, anon, authenticated;

drop trigger if exists enqueue_customer_registration_whatsapp
  on public.customer_booking_accounts;
create trigger enqueue_customer_registration_whatsapp
after insert on public.customer_booking_accounts
for each row execute function private.enqueue_customer_registration_whatsapp();

commit;
