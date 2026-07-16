alter table public.subscription_charges
  add column if not exists proof_storage_path text,
  add column if not exists proof_file_name text,
  add column if not exists proof_content_type text,
  add column if not exists proof_size_bytes bigint,
  add column if not exists proof_submitted_at timestamptz,
  add column if not exists proof_status text not null default 'none',
  add column if not exists proof_reviewed_at timestamptz,
  add column if not exists proof_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists proof_rejection_reason text,
  add column if not exists paid_by uuid references auth.users(id) on delete set null,
  add column if not exists payment_token uuid not null default gen_random_uuid(),
  add column if not exists payment_token_expires_at timestamptz not null
    default (now() + interval '2 hours');

alter table public.subscription_charges
  alter column payment_token_expires_at
  set default (now() + interval '2 hours');

update public.subscription_charges
set payment_token_expires_at = least(
  payment_token_expires_at,
  now() + interval '2 hours'
)
where status in ('pending', 'overdue')
  and proof_status in ('none', 'rejected');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_charges_proof_status_check'
      and conrelid = 'public.subscription_charges'::regclass
  ) then
    alter table public.subscription_charges
      add constraint subscription_charges_proof_status_check
      check (proof_status in ('none', 'pending_review', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_charges_proof_size_check'
      and conrelid = 'public.subscription_charges'::regclass
  ) then
    alter table public.subscription_charges
      add constraint subscription_charges_proof_size_check
      check (
        proof_size_bytes is null
        or proof_size_bytes between 1 and 5242880
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_charges_proof_consistency_check'
      and conrelid = 'public.subscription_charges'::regclass
  ) then
    alter table public.subscription_charges
      add constraint subscription_charges_proof_consistency_check
      check (
        (
          proof_status = 'none'
          and proof_storage_path is null
        )
        or (
          proof_status in ('pending_review', 'rejected')
          and proof_storage_path is not null
          and status in ('pending', 'overdue')
        )
        or (
          proof_status = 'approved'
          and proof_storage_path is not null
          and status = 'paid'
        )
      );
  end if;
end;
$$;

create index if not exists subscription_charges_pending_proof_idx
  on public.subscription_charges (tenant_id, due_date, proof_submitted_at)
  where proof_status = 'pending_review';

create unique index if not exists subscription_charges_payment_token_uidx
  on public.subscription_charges (payment_token);

with ranked_charges as (
  select
    id,
    status,
    row_number() over (
      partition by subscription_id, due_date
      order by
        case status
          when 'paid' then 0
          else 4
        end,
        case proof_status
          when 'pending_review' then 1
          when 'rejected' then 2
          else 3
        end,
        case status
          when 'overdue' then 1
          when 'pending' then 2
          else 3
        end,
        created_at,
        id
    ) as position
  from public.subscription_charges
  where status not in ('canceled', 'refunded')
)
update public.subscription_charges as charge
set
  status = 'canceled',
  notes = concat_ws(
    ' | ',
    charge.notes,
    'Cobrança duplicada cancelada pela migração de comprovantes'
  )
from ranked_charges as ranked
where ranked.id = charge.id
  and ranked.position > 1
  and charge.status in ('pending', 'overdue')
  and charge.proof_status = 'none';

do $$
begin
  if exists (
    select 1
    from public.subscription_charges
    where status not in ('canceled', 'refunded')
    group by subscription_id, due_date
    having count(*) > 1
  ) then
    raise exception
      'Existem cobranças duplicadas no mesmo vencimento que precisam de revisão manual.'
      using hint =
        'Revise cobranças pagas ou com comprovante no mesmo subscription_id e due_date antes de executar novamente esta migração.';
  end if;
end;
$$;

create unique index if not exists subscription_charges_subscription_due_uidx
  on public.subscription_charges (subscription_id, due_date)
  where status not in ('canceled', 'refunded');

create unique index if not exists client_subscriptions_id_tenant_uidx
  on public.client_subscriptions (id, tenant_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_charges_subscription_tenant_fk'
      and conrelid = 'public.subscription_charges'::regclass
  ) then
    alter table public.subscription_charges
      add constraint subscription_charges_subscription_tenant_fk
      foreign key (subscription_id, tenant_id)
      references public.client_subscriptions (id, tenant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_usages_subscription_tenant_fk'
      and conrelid = 'public.subscription_usages'::regclass
  ) then
    alter table public.subscription_usages
      add constraint subscription_usages_subscription_tenant_fk
      foreign key (subscription_id, tenant_id)
      references public.client_subscriptions (id, tenant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1
    from public.subscription_charges as charge
    left join public.client_subscriptions as subscription
      on subscription.id = charge.subscription_id
     and subscription.tenant_id = charge.tenant_id
    where subscription.id is null
  ) then
    alter table public.subscription_charges
      validate constraint subscription_charges_subscription_tenant_fk;
  end if;

  if not exists (
    select 1
    from public.subscription_usages as usage
    left join public.client_subscriptions as subscription
      on subscription.id = usage.subscription_id
     and subscription.tenant_id = usage.tenant_id
    where subscription.id is null
  ) then
    alter table public.subscription_usages
      validate constraint subscription_usages_subscription_tenant_fk;
  end if;
end;
$$;

create or replace function private.can_manage_subscription_payments(
  p_user_id uuid,
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_super_admin(p_user_id)
    or exists (
      select 1
      from public.user_roles
      where user_id = p_user_id
        and tenant_id = p_tenant_id
        and role in ('owner', 'staff')
    );
$$;

revoke all on function private.can_manage_subscription_payments(uuid, uuid)
from public, anon;
grant execute on function private.can_manage_subscription_payments(uuid, uuid)
to authenticated, service_role;

drop policy if exists "tenant members manage subscription charges"
on public.subscription_charges;
drop policy if exists "tenant members read subscription charges"
on public.subscription_charges;
drop policy if exists "subscription managers read charges"
on public.subscription_charges;
drop policy if exists "subscription managers create charges"
on public.subscription_charges;
drop policy if exists "subscription managers update charges"
on public.subscription_charges;
drop policy if exists "subscription managers delete charges"
on public.subscription_charges;

revoke update, delete on public.subscription_charges from authenticated;
grant select, insert on public.subscription_charges to authenticated;

create policy "subscription managers read charges"
on public.subscription_charges for select to authenticated
using (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
);

create policy "subscription managers create charges"
on public.subscription_charges for insert to authenticated
with check (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
);

drop policy if exists "tenant members manage client subscriptions"
on public.client_subscriptions;
drop policy if exists "tenant members read client subscriptions"
on public.client_subscriptions;
drop policy if exists "subscription managers create client subscriptions"
on public.client_subscriptions;
drop policy if exists "subscription managers update client subscriptions"
on public.client_subscriptions;
drop policy if exists "subscription managers delete client subscriptions"
on public.client_subscriptions;

revoke delete on public.client_subscriptions from authenticated;
grant select, insert, update on public.client_subscriptions to authenticated;

create policy "tenant members read client subscriptions"
on public.client_subscriptions for select to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);

create policy "subscription managers create client subscriptions"
on public.client_subscriptions for insert to authenticated
with check (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
);

create policy "subscription managers update client subscriptions"
on public.client_subscriptions for update to authenticated
using (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
)
with check (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
);

drop policy if exists "tenant members manage subscription usages"
on public.subscription_usages;
drop policy if exists "tenant members read subscription usages"
on public.subscription_usages;
drop policy if exists "tenant members create subscription usages"
on public.subscription_usages;
drop policy if exists "subscription managers update subscription usages"
on public.subscription_usages;
drop policy if exists "subscription managers delete subscription usages"
on public.subscription_usages;

revoke insert, update, delete on public.subscription_usages from authenticated;
grant select on public.subscription_usages to authenticated;

create policy "tenant members read subscription usages"
on public.subscription_usages for select to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);

alter function public.register_subscription_usage(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, text, text, timestamptz
) security definer;

create or replace function private.enforce_subscription_usage_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'authenticated'
     and not (
       private.is_tenant_member((select auth.uid()), new.tenant_id)
       or private.is_super_admin((select auth.uid()))
     ) then
    raise exception 'Seu perfil não pode registrar consumo nesta assinatura.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_subscription_usage_access()
from public, anon, authenticated;
grant execute on function private.enforce_subscription_usage_access()
to service_role;

drop trigger if exists subscription_usage_access_guard
on public.subscription_usages;

create trigger subscription_usage_access_guard
before insert on public.subscription_usages
for each row execute function private.enforce_subscription_usage_access();

create or replace function private.enforce_subscription_charge_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('paid', 'refunded')
     and coalesce((select auth.role()), '') = 'authenticated' then
    raise exception
      'Crie a cobrança pendente e use o fluxo controlado para confirmar o pagamento.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists subscription_charge_insert_guard
on public.subscription_charges;

create trigger subscription_charge_insert_guard
before insert on public.subscription_charges
for each row execute function private.enforce_subscription_charge_insert();

create or replace function private.enforce_subscription_payment_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'paid' then
    raise exception
      'Uma cobrança paga não pode voltar de status sem um fluxo de estorno controlado.'
      using errcode = 'P0001';
  end if;

  if new.status in ('paid', 'refunded')
     and coalesce((select auth.role()), '') <> 'service_role'
     and not private.can_manage_subscription_payments((select auth.uid()), new.tenant_id) then
    raise exception 'Seu perfil não pode confirmar ou estornar pagamentos.'
      using errcode = '42501';
  end if;

  if new.status = 'paid' and old.status not in ('pending', 'overdue') then
    raise exception 'Somente cobranças pendentes ou vencidas podem ser confirmadas.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists subscription_charge_payment_guard
on public.subscription_charges;

create trigger subscription_charge_payment_guard
before update of status
on public.subscription_charges
for each row execute function private.enforce_subscription_payment_transition();

create or replace function private.enforce_subscription_activation_payment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'active'
     and old.status is distinct from 'active'
     and exists (
       select 1
       from public.subscription_charges
       where subscription_id = new.id
         and tenant_id = new.tenant_id
         and status in ('pending', 'overdue')
         and due_date < (now() at time zone 'America/Sao_Paulo')::date
     ) then
    raise exception
      'Confirme o pagamento da cobrança antes de reativar esta assinatura.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists client_subscription_activation_payment_guard
on public.client_subscriptions;

create trigger client_subscription_activation_payment_guard
before update of status
on public.client_subscriptions
for each row execute function private.enforce_subscription_activation_payment();

create or replace function private.renew_subscription_after_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription public.client_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_next_due date;
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
    raise exception 'A assinatura vinculada à cobrança não foi encontrada.'
      using errcode = 'P0002';
  end if;

  select *
  into v_plan
  from public.subscription_plans
  where id = v_subscription.plan_id
    and tenant_id = new.tenant_id;

  if not found then
    raise exception 'O plano vinculado à cobrança não foi encontrado.'
      using errcode = 'P0002';
  end if;

  v_next_due := case v_plan.billing_cycle
    when 'weekly' then new.due_date + 7
    when 'biweekly' then new.due_date + 15
    when 'monthly' then (new.due_date + interval '1 month')::date
    when 'yearly' then (new.due_date + interval '1 year')::date
    else null
  end;

  if v_next_due is not null then
    update public.client_subscriptions
    set next_due_at = greatest(coalesce(next_due_at, v_next_due), v_next_due)
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
        new.due_date,
        v_next_due - 1,
        'Renovação · ' || v_plan.name
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
        then greatest(coalesce(ends_at, new.due_date), new.due_date) + v_plan.duration_days
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

drop trigger if exists subscription_charge_renewal
on public.subscription_charges;

create trigger subscription_charge_renewal
after update of status on public.subscription_charges
for each row execute function private.renew_subscription_after_payment();

create or replace function private.block_overdue_subscription_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.subscription_charges
    where subscription_id = new.subscription_id
      and tenant_id = new.tenant_id
      and status in ('pending', 'overdue')
      and due_date < (now() at time zone 'America/Sao_Paulo')::date
  ) then
    raise exception
      'A assinatura possui uma renovação vencida e não pode consumir sessões.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists subscription_usage_overdue_guard
on public.subscription_usages;

create trigger subscription_usage_overdue_guard
before insert on public.subscription_usages
for each row execute function private.block_overdue_subscription_usage();

create or replace function private.normalize_subscription_payment_proof()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new_proof boolean := false;
  v_became_paid boolean := false;
begin
  if tg_op = 'INSERT' then
    v_new_proof := new.proof_storage_path is not null;
    v_became_paid := new.status = 'paid';
  else
    v_new_proof :=
      new.proof_storage_path is not null
      and new.proof_storage_path is distinct from old.proof_storage_path;
    v_became_paid := new.status = 'paid' and old.status <> 'paid';
  end if;

  if v_new_proof and new.status <> 'paid' then
    new.proof_status := 'pending_review';
    new.proof_submitted_at := coalesce(new.proof_submitted_at, now());
    new.proof_reviewed_at := null;
    new.proof_reviewed_by := null;
    new.proof_rejection_reason := null;
  end if;

  if v_became_paid and new.proof_storage_path is not null then
    new.proof_status := 'approved';
    new.proof_reviewed_at := coalesce(new.proof_reviewed_at, now());
    new.proof_reviewed_by := coalesce(new.proof_reviewed_by, auth.uid());
    new.proof_rejection_reason := null;
  end if;

  if new.proof_status = 'rejected' then
    new.proof_reviewed_at := coalesce(new.proof_reviewed_at, now());
    new.proof_reviewed_by := coalesce(new.proof_reviewed_by, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists subscription_charge_proof_normalization
on public.subscription_charges;

create trigger subscription_charge_proof_normalization
before insert or update of status, proof_storage_path, proof_status
on public.subscription_charges
for each row execute function private.normalize_subscription_payment_proof();

create or replace function public.confirm_subscription_payment(
  p_tenant_id uuid,
  p_charge_id uuid,
  p_payment_method text default 'pix',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.subscription_charges%rowtype;
  v_subscription public.client_subscriptions%rowtype;
  v_now timestamptz := now();
begin
  if not private.can_manage_subscription_payments((select auth.uid()), p_tenant_id) then
    raise exception 'Seu perfil não pode confirmar pagamentos de assinaturas.'
      using errcode = '42501';
  end if;

  select *
  into v_charge
  from public.subscription_charges
  where id = p_charge_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Cobrança de assinatura não encontrada.' using errcode = 'P0002';
  end if;

  if v_charge.status = 'paid' then
    return jsonb_build_object(
      'id', v_charge.id,
      'status', 'paid',
      'already_paid', true,
      'subscription_id', v_charge.subscription_id
    );
  end if;

  if v_charge.status not in ('pending', 'overdue') then
    raise exception 'Esta cobrança não está disponível para confirmação.'
      using errcode = 'P0001';
  end if;

  update public.subscription_charges
  set
    status = 'paid',
    paid_at = v_now,
    paid_by = (select auth.uid()),
    payment_method = coalesce(nullif(trim(p_payment_method), ''), 'manual'),
    notes = concat_ws(' | ', notes, nullif(trim(p_notes), '')),
    updated_at = v_now
  where id = p_charge_id
    and tenant_id = p_tenant_id;

  select *
  into v_subscription
  from public.client_subscriptions
  where id = v_charge.subscription_id
    and tenant_id = p_tenant_id;

  if not found then
    raise exception 'A assinatura vinculada à cobrança não foi encontrada.'
      using errcode = 'P0002';
  end if;

  insert into public.financial_audit_log (
    tenant_id,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    reason,
    source_entity_type,
    source_entity_id
  )
  values (
    p_tenant_id,
    'subscription_charge',
    p_charge_id,
    'subscription_payment_confirmed',
    jsonb_build_object(
      'status', v_charge.status,
      'amount', v_charge.amount,
      'due_date', v_charge.due_date,
      'proof_status', v_charge.proof_status
    ),
    jsonb_build_object(
      'status', 'paid',
      'paid_at', v_now,
      'payment_method', coalesce(nullif(trim(p_payment_method), ''), 'manual'),
      'proof_status',
        case when v_charge.proof_storage_path is null then v_charge.proof_status else 'approved' end,
      'sessions_remaining', v_subscription.sessions_remaining
    ),
    coalesce(nullif(trim(p_notes), ''), 'Pagamento da assinatura confirmado'),
    'client_subscription',
    v_charge.subscription_id
  );

  return jsonb_build_object(
    'id', p_charge_id,
    'status', 'paid',
    'already_paid', false,
    'subscription_id', v_charge.subscription_id,
    'subscription_status', v_subscription.status,
    'sessions_total', v_subscription.sessions_total,
    'sessions_remaining', v_subscription.sessions_remaining,
    'next_due_at', v_subscription.next_due_at
  );
end;
$$;

create or replace function public.reject_subscription_payment_proof(
  p_tenant_id uuid,
  p_charge_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.subscription_charges%rowtype;
begin
  if not private.can_manage_subscription_payments((select auth.uid()), p_tenant_id) then
    raise exception 'Seu perfil não pode revisar comprovantes de assinaturas.'
      using errcode = '42501';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Informe o motivo da rejeição.' using errcode = '22000';
  end if;

  select *
  into v_charge
  from public.subscription_charges
  where id = p_charge_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Cobrança de assinatura não encontrada.' using errcode = 'P0002';
  end if;

  if v_charge.status not in ('pending', 'overdue')
     or v_charge.proof_status <> 'pending_review' then
    raise exception 'Este comprovante não está aguardando revisão.' using errcode = 'P0001';
  end if;

  update public.subscription_charges
  set
    proof_status = 'rejected',
    proof_reviewed_at = now(),
    proof_reviewed_by = (select auth.uid()),
    proof_rejection_reason = trim(p_reason),
    updated_at = now()
  where id = p_charge_id
    and tenant_id = p_tenant_id;

  insert into public.financial_audit_log (
    tenant_id,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    reason,
    source_entity_type,
    source_entity_id
  )
  values (
    p_tenant_id,
    'subscription_charge',
    p_charge_id,
    'subscription_payment_proof_rejected',
    jsonb_build_object(
      'status', v_charge.status,
      'amount', v_charge.amount,
      'due_date', v_charge.due_date,
      'proof_status', v_charge.proof_status
    ),
    jsonb_build_object('proof_status', 'rejected'),
    trim(p_reason),
    'client_subscription',
    v_charge.subscription_id
  );

  return jsonb_build_object(
    'id', p_charge_id,
    'proof_status', 'rejected'
  );
end;
$$;

revoke all on function public.confirm_subscription_payment(uuid, uuid, text, text) from public;
revoke all on function public.reject_subscription_payment_proof(uuid, uuid, text) from public;
revoke execute on function public.confirm_subscription_payment(uuid, uuid, text, text)
from anon, service_role;
revoke execute on function public.reject_subscription_payment_proof(uuid, uuid, text)
from anon, service_role;
grant execute on function public.confirm_subscription_payment(uuid, uuid, text, text)
to authenticated;
grant execute on function public.reject_subscription_payment_proof(uuid, uuid, text)
to authenticated;

drop policy if exists "super admins read subscription financial audit"
on public.financial_audit_log;
create policy "super admins read subscription financial audit"
on public.financial_audit_log for select to authenticated
using (private.is_super_admin((select auth.uid())));

drop policy if exists "super admins append subscription financial audit"
on public.financial_audit_log;
create policy "super admins append subscription financial audit"
on public.financial_audit_log for insert to authenticated
with check (private.is_super_admin((select auth.uid())));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'subscription-payment-proofs',
  'subscription-payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "subscription managers read payment proofs" on storage.objects;
drop policy if exists "subscription managers upload payment proofs" on storage.objects;
drop policy if exists "subscription managers update payment proofs" on storage.objects;
drop policy if exists "subscription managers delete payment proofs" on storage.objects;

create policy "subscription managers read payment proofs"
on storage.objects for select to authenticated
using (
  bucket_id = 'subscription-payment-proofs'
  and case
    when (storage.foldername(name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.can_manage_subscription_payments(
      (select auth.uid()),
      ((storage.foldername(name))[1])::uuid
    )
    else false
  end
);

comment on column public.subscription_charges.proof_storage_path is
  'Private path in the subscription-payment-proofs bucket for the client payment proof.';
comment on column public.subscription_charges.proof_status is
  'Review state for a client-submitted payment proof.';
