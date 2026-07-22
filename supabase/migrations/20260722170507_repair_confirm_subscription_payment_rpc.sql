begin;

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
  v_payment_method text := coalesce(nullif(trim(p_payment_method), ''), 'manual');
begin
  if not private.can_manage_subscription_payments((select auth.uid()), p_tenant_id) then
    raise exception 'Seu perfil nao pode confirmar pagamentos de assinaturas.'
      using errcode = '42501';
  end if;

  select *
  into v_charge
  from public.subscription_charges
  where id = p_charge_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Cobranca de assinatura nao encontrada.' using errcode = 'P0002';
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
    raise exception 'Esta cobranca nao esta disponivel para confirmacao.'
      using errcode = 'P0001';
  end if;

  select *
  into v_subscription
  from public.client_subscriptions
  where id = v_charge.subscription_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'A assinatura vinculada a cobranca nao foi encontrada.'
      using errcode = 'P0002';
  end if;

  update public.subscription_charges
  set
    status = 'paid',
    paid_at = v_now,
    paid_by = (select auth.uid()),
    payment_method = v_payment_method,
    proof_status = case
      when proof_storage_path is not null then 'approved'
      else proof_status
    end,
    proof_reviewed_at = case
      when proof_storage_path is not null then v_now
      else proof_reviewed_at
    end,
    proof_reviewed_by = case
      when proof_storage_path is not null then (select auth.uid())
      else proof_reviewed_by
    end,
    notes = concat_ws(' | ', notes, nullif(trim(p_notes), '')),
    updated_at = v_now
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
      'payment_method', v_payment_method,
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

revoke all on function public.confirm_subscription_payment(uuid, uuid, text, text)
from public;
revoke execute on function public.confirm_subscription_payment(uuid, uuid, text, text)
from anon, service_role;
grant execute on function public.confirm_subscription_payment(uuid, uuid, text, text)
to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
