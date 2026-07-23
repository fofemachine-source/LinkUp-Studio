begin;

-- Subscription renewals must follow the real payment/settlement date, not the
-- old due date of the charge being paid. Example: paid on 23/07 => next monthly
-- renewal on 23/08, even if the pending charge originally had another due day.

create or replace function private.subscription_next_due_date(
  p_billing_cycle text,
  p_anchor_date date
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_billing_cycle
    when 'weekly' then p_anchor_date + 7
    when 'biweekly' then p_anchor_date + 15
    when 'monthly' then (p_anchor_date + interval '1 month')::date
    when 'yearly' then (p_anchor_date + interval '1 year')::date
    else null::date
  end;
$$;

revoke all on function private.subscription_next_due_date(text, date)
from public, anon, authenticated;

grant execute on function private.subscription_next_due_date(text, date)
to service_role;

create or replace function private.reset_subscription_benefit_cycle_after_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle_start date;
begin
  v_cycle_start := coalesce(
    (new.paid_at at time zone 'America/Sao_Paulo')::date,
    new.billing_period_start,
    new.due_date
  );

  if new.status = 'paid'
     and old.status is distinct from 'paid'
     and v_cycle_start <= (now() at time zone 'America/Sao_Paulo')::date
  then
    update public.client_subscriptions
    set benefit_cycle_started_at = greatest(
      coalesce(benefit_cycle_started_at, v_cycle_start),
      v_cycle_start
    )
    where id = new.subscription_id
      and tenant_id = new.tenant_id;
  end if;

  return new;
end;
$$;

revoke all on function private.reset_subscription_benefit_cycle_after_payment()
from public, anon, authenticated;

create or replace function private.renew_subscription_after_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.client_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_payment_date date;
  v_next_due date;
  v_following_due date;
  v_has_open_due boolean := false;
begin
  if new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;

  select *
  into v_subscription
  from public.client_subscriptions
  where id = new.subscription_id
    and tenant_id = new.tenant_id
  for update;

  if not found then
    raise exception 'A assinatura vinculada a cobranca nao foi encontrada.'
      using errcode = 'P0002';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where id = v_subscription.plan_id
    and tenant_id = new.tenant_id;

  if not found then
    raise exception 'O plano vinculado a cobranca nao foi encontrado.'
      using errcode = 'P0002';
  end if;

  v_payment_date := coalesce(
    (new.paid_at at time zone 'America/Sao_Paulo')::date,
    (now() at time zone 'America/Sao_Paulo')::date
  );

  v_next_due := private.subscription_next_due_date(v_plan.billing_cycle, v_payment_date);
  v_following_due := private.subscription_next_due_date(v_plan.billing_cycle, v_next_due);

  -- Make the paid charge itself represent the effective cycle that was bought.
  -- This keeps the VIP balance/validity aligned with the payment date.
  update public.subscription_charges
  set
    billing_period_start = v_payment_date,
    billing_period_end = case
      when v_next_due is not null then v_next_due - 1
      else billing_period_end
    end,
    updated_at = now()
  where id = new.id
    and tenant_id = new.tenant_id;

  if v_next_due is not null then
    update public.client_subscriptions
    set next_due_at = v_next_due
    where id = v_subscription.id
      and tenant_id = new.tenant_id;

    if v_subscription.auto_renew
       and v_plan.automatic_renewal
       and not exists (
         select 1
         from public.subscription_charges
         where subscription_id = v_subscription.id
           and tenant_id = new.tenant_id
           and due_date = v_next_due
           and status not in ('canceled', 'refunded')
       ) then
      insert into public.subscription_charges (
        tenant_id,
        subscription_id,
        client_id,
        amount,
        due_date,
        status,
        billing_period_start,
        billing_period_end,
        description
      )
      values (
        new.tenant_id,
        v_subscription.id,
        v_subscription.client_id,
        v_subscription.price,
        v_next_due,
        case
          when v_next_due < (now() at time zone 'America/Sao_Paulo')::date
          then 'overdue'
          else 'pending'
        end,
        v_next_due,
        case when v_following_due is null then null else v_following_due - 1 end,
        'Renovacao - ' || v_plan.name
      );
    end if;
  end if;

  select exists (
    select 1
    from public.subscription_charges
    where subscription_id = v_subscription.id
      and tenant_id = new.tenant_id
      and status in ('pending', 'overdue')
      and due_date < (now() at time zone 'America/Sao_Paulo')::date
  )
  into v_has_open_due;

  if v_has_open_due then
    update public.client_subscriptions
    set status = 'overdue'
    where id = v_subscription.id
      and tenant_id = new.tenant_id;
  else
    update public.client_subscriptions
    set
      status = 'active',
      ends_at = case
        when v_plan.model = 'fixed_period' and v_plan.duration_days is not null
        then greatest(coalesce(ends_at, v_payment_date), v_payment_date) + v_plan.duration_days
        else ends_at
      end,
      sessions_total = case
        when v_plan.session_limit is null then null
        when v_plan.allow_rollover then coalesce(sessions_total, 0) + v_plan.session_limit
        else v_plan.session_limit
      end,
      sessions_used = case
        when v_plan.allow_rollover then sessions_used
        else 0
      end,
      sessions_remaining = case
        when v_plan.session_limit is null then null
        when v_plan.allow_rollover then coalesce(sessions_remaining, 0) + v_plan.session_limit
        else v_plan.session_limit
      end
    where id = v_subscription.id
      and tenant_id = new.tenant_id;
  end if;

  return new;
end;
$$;

revoke all on function private.renew_subscription_after_payment()
from public, anon, authenticated;

-- Repair subscriptions already affected by the old due-date based renewal.
with paid_cycles as (
  select
    charge.id as paid_charge_id,
    charge.tenant_id,
    charge.subscription_id,
    plan.billing_cycle,
    coalesce(
      (charge.paid_at at time zone 'America/Sao_Paulo')::date,
      charge.billing_period_start,
      charge.due_date
    ) as payment_date,
    private.subscription_next_due_date(
      plan.billing_cycle,
      coalesce(
        (charge.paid_at at time zone 'America/Sao_Paulo')::date,
        charge.billing_period_start,
        charge.due_date
      )
    ) as correct_next_due
  from public.subscription_charges as charge
  join public.client_subscriptions as subscription
    on subscription.id = charge.subscription_id
   and subscription.tenant_id = charge.tenant_id
  join public.subscription_plans as plan
    on plan.id = subscription.plan_id
   and plan.tenant_id = charge.tenant_id
  where charge.status = 'paid'
    and charge.paid_at is not null
    and plan.billing_cycle in ('weekly', 'biweekly', 'monthly', 'yearly')
),
latest_paid as (
  select distinct on (tenant_id, subscription_id)
    *
  from paid_cycles
  where correct_next_due is not null
  order by tenant_id, subscription_id, payment_date desc, paid_charge_id desc
),
updated_paid as (
  update public.subscription_charges as charge
  set
    billing_period_start = cycle.payment_date,
    billing_period_end = cycle.correct_next_due - 1,
    updated_at = now()
  from paid_cycles as cycle
  where charge.id = cycle.paid_charge_id
    and charge.tenant_id = cycle.tenant_id
    and (
      charge.billing_period_start is distinct from cycle.payment_date
      or charge.billing_period_end is distinct from cycle.correct_next_due - 1
    )
  returning charge.id
),
updated_subscription as (
  update public.client_subscriptions as subscription
  set
    next_due_at = latest.correct_next_due,
    benefit_cycle_started_at = case
      when latest.payment_date <= (now() at time zone 'America/Sao_Paulo')::date
      then greatest(coalesce(subscription.benefit_cycle_started_at, latest.payment_date), latest.payment_date)
      else subscription.benefit_cycle_started_at
    end
  from latest_paid as latest
  where subscription.id = latest.subscription_id
    and subscription.tenant_id = latest.tenant_id
    and (
      subscription.next_due_at is distinct from latest.correct_next_due
      or (
        latest.payment_date <= (now() at time zone 'America/Sao_Paulo')::date
        and subscription.benefit_cycle_started_at < latest.payment_date
      )
    )
  returning subscription.id
),
pending_to_repair as (
  select distinct on (pending.tenant_id, pending.subscription_id)
    pending.id as pending_charge_id,
    latest.tenant_id,
    latest.subscription_id,
    latest.billing_cycle,
    latest.correct_next_due
  from latest_paid as latest
  join public.subscription_charges as pending
    on pending.subscription_id = latest.subscription_id
   and pending.tenant_id = latest.tenant_id
  where pending.status in ('pending', 'overdue')
    and pending.due_date is distinct from latest.correct_next_due
    and not exists (
      select 1
      from public.subscription_charges as existing
      where existing.subscription_id = latest.subscription_id
        and existing.tenant_id = latest.tenant_id
        and existing.due_date = latest.correct_next_due
        and existing.status not in ('canceled', 'refunded')
        and existing.id <> pending.id
    )
  order by pending.tenant_id, pending.subscription_id, pending.due_date asc, pending.id
)
update public.subscription_charges as pending
set
  due_date = repair.correct_next_due,
  status = case
    when repair.correct_next_due < (now() at time zone 'America/Sao_Paulo')::date
    then 'overdue'
    else 'pending'
  end,
  billing_period_start = repair.correct_next_due,
  billing_period_end = case
    when private.subscription_next_due_date(repair.billing_cycle, repair.correct_next_due) is null
    then null
    else private.subscription_next_due_date(repair.billing_cycle, repair.correct_next_due) - 1
  end,
  updated_at = now()
from pending_to_repair as repair
where pending.id = repair.pending_charge_id
  and pending.tenant_id = repair.tenant_id;

select pg_notify('pgrst', 'reload schema');

commit;
