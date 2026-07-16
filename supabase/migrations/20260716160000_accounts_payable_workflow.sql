begin;

-- Operação de Contas a Pagar sobre o razão financeiro existente.
-- Uma obrigação pendente afeta a DRE por competência, mas só afeta o caixa após a baixa.

alter table public.cash_movements
  add column if not exists supplier_name text,
  add column if not exists document_number text,
  add column if not exists series_id uuid,
  add column if not exists installment_number integer,
  add column if not exists installment_count integer,
  add column if not exists proof_url text,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists paid_by uuid references auth.users(id) on delete set null,
  add column if not exists canceled_by uuid references auth.users(id) on delete set null,
  add column if not exists canceled_at timestamptz,
  add column if not exists cancellation_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_installment_shape_check'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_installment_shape_check check (
        (installment_number is null and installment_count is null)
        or
        (
          installment_number between 1 and installment_count
          and installment_count between 1 and 120
        )
      ) not valid;
  end if;
end
$$;

alter table public.cash_movements
  validate constraint cash_movements_installment_shape_check;

create index if not exists cash_movements_tenant_payables_due_idx
  on public.cash_movements (tenant_id, due_date, status)
  where kind = 'out' and status in ('pending', 'scheduled');
create index if not exists cash_movements_series_idx
  on public.cash_movements (series_id, installment_number)
  where series_id is not null;
create index if not exists cash_movements_supplier_idx
  on public.cash_movements (tenant_id, lower(supplier_name))
  where supplier_name is not null;

create or replace function public.create_payable_series(
  p_tenant_id uuid,
  p_description text,
  p_supplier_name text,
  p_amount numeric,
  p_category_id uuid,
  p_account_id uuid,
  p_competence_date date,
  p_first_due_date date,
  p_occurrences integer,
  p_interval_months integer,
  p_document_number text,
  p_payment_method text,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category public.financial_categories%rowtype;
  v_series_id uuid := gen_random_uuid();
  v_occurrences integer := greatest(1, coalesce(p_occurrences, 1));
  v_interval integer := greatest(1, coalesce(p_interval_months, 1));
  v_due_date date;
  v_competence_date date;
  v_movement_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_index integer;
begin
  if not private.is_tenant_member((select auth.uid()), p_tenant_id) then
    raise exception 'Acesso negado para esta empresa.' using errcode = '42501';
  end if;

  if nullif(trim(p_description), '') is null then
    raise exception 'Informe a descrição da conta.' using errcode = '22000';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor deve ser maior que zero.' using errcode = '22003';
  end if;

  if v_occurrences > 120 then
    raise exception 'O limite é de 120 lançamentos por série.' using errcode = '22003';
  end if;

  if p_first_due_date is null or p_competence_date is null then
    raise exception 'Informe competência e primeiro vencimento.' using errcode = '22007';
  end if;

  select *
  into v_category
  from public.financial_categories
  where id = p_category_id
    and tenant_id = p_tenant_id
    and movement_kind = 'out'
    and active;

  if not found then
    raise exception 'Categoria de despesa inválida.' using errcode = '22000';
  end if;

  if p_account_id is not null and not exists (
    select 1
    from public.financial_accounts
    where id = p_account_id
      and tenant_id = p_tenant_id
      and active
  ) then
    raise exception 'Conta financeira inválida.' using errcode = '22000';
  end if;

  for v_index in 1..v_occurrences
  loop
    v_due_date := (p_first_due_date + make_interval(months => (v_index - 1) * v_interval))::date;
    v_competence_date := (
      p_competence_date + make_interval(months => (v_index - 1) * v_interval)
    )::date;

    insert into public.cash_movements (
      tenant_id,
      kind,
      amount,
      description,
      category,
      category_id,
      account_id,
      movement_date,
      competence_date,
      due_date,
      status,
      payment_method,
      source,
      reference_type,
      reference_id,
      affects_cash,
      affects_dre,
      origin_label,
      supplier_name,
      document_number,
      series_id,
      installment_number,
      installment_count,
      notes
    )
    values (
      p_tenant_id,
      'out',
      round(p_amount, 2),
      trim(p_description) ||
        case when v_occurrences > 1 then ' · ' || v_index || '/' || v_occurrences else '' end,
      v_category.name,
      v_category.id,
      p_account_id,
      v_due_date,
      v_competence_date,
      v_due_date,
      'pending',
      nullif(trim(p_payment_method), ''),
      'manual',
      'payable',
      v_series_id,
      true,
      true,
      case when v_occurrences > 1 then 'Conta a pagar recorrente' else 'Conta a pagar manual' end,
      nullif(trim(p_supplier_name), ''),
      nullif(trim(p_document_number), ''),
      case when v_occurrences > 1 then v_series_id else null end,
      case when v_occurrences > 1 then v_index else null end,
      case when v_occurrences > 1 then v_occurrences else null end,
      nullif(trim(p_notes), '')
    )
    returning id into v_movement_id;

    v_ids := v_ids || jsonb_build_array(v_movement_id);

    insert into public.financial_audit_log (
      tenant_id,
      entity_type,
      entity_id,
      action,
      new_data,
      reason,
      source_entity_type,
      source_entity_id
    )
    values (
      p_tenant_id,
      'cash_movement',
      v_movement_id,
      'payable_created',
      jsonb_build_object(
        'amount', round(p_amount, 2),
        'due_date', v_due_date,
        'competence_date', v_competence_date,
        'supplier_name', nullif(trim(p_supplier_name), ''),
        'installment_number', case when v_occurrences > 1 then v_index else null end,
        'installment_count', case when v_occurrences > 1 then v_occurrences else null end
      ),
      'Conta a pagar criada',
      'payable_series',
      v_series_id
    );
  end loop;

  return jsonb_build_object(
    'series_id', v_series_id,
    'occurrences', v_occurrences,
    'movement_ids', v_ids
  );
end;
$$;

create or replace function public.update_payable(
  p_tenant_id uuid,
  p_movement_id uuid,
  p_description text,
  p_supplier_name text,
  p_amount numeric,
  p_category_id uuid,
  p_account_id uuid,
  p_competence_date date,
  p_due_date date,
  p_document_number text,
  p_payment_method text,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.cash_movements%rowtype;
  v_category public.financial_categories%rowtype;
begin
  if not private.is_tenant_member((select auth.uid()), p_tenant_id) then
    raise exception 'Acesso negado para esta empresa.' using errcode = '42501';
  end if;

  select *
  into v_old
  from public.cash_movements
  where id = p_movement_id
    and tenant_id = p_tenant_id
    and kind = 'out'
  for update;

  if not found then
    raise exception 'Conta a pagar não encontrada.' using errcode = 'P0002';
  end if;

  if v_old.status not in ('pending', 'scheduled') then
    raise exception 'Somente contas pendentes podem ser editadas.' using errcode = 'P0001';
  end if;

  if v_old.reference_type = 'commission' then
    raise exception 'Comissões devem ser alteradas no módulo de Comissões.' using errcode = 'P0001';
  end if;

  if nullif(trim(p_description), '') is null or p_amount is null or p_amount <= 0 then
    raise exception 'Descrição e valor são obrigatórios.' using errcode = '22000';
  end if;

  if p_competence_date is null or p_due_date is null then
    raise exception 'Informe competência e vencimento.' using errcode = '22007';
  end if;

  select *
  into v_category
  from public.financial_categories
  where id = p_category_id
    and tenant_id = p_tenant_id
    and movement_kind = 'out'
    and active;

  if not found then
    raise exception 'Categoria de despesa inválida.' using errcode = '22000';
  end if;

  if p_account_id is not null and not exists (
    select 1
    from public.financial_accounts
    where id = p_account_id
      and tenant_id = p_tenant_id
      and active
  ) then
    raise exception 'Conta financeira inválida.' using errcode = '22000';
  end if;

  update public.cash_movements
  set
    amount = round(p_amount, 2),
    description = trim(p_description),
    supplier_name = nullif(trim(p_supplier_name), ''),
    category = v_category.name,
    category_id = v_category.id,
    account_id = p_account_id,
    competence_date = p_competence_date,
    due_date = p_due_date,
    movement_date = p_due_date,
    document_number = nullif(trim(p_document_number), ''),
    payment_method = nullif(trim(p_payment_method), ''),
    notes = nullif(trim(p_notes), ''),
    updated_at = now()
  where id = p_movement_id;

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
    'cash_movement',
    p_movement_id,
    'payable_updated',
    to_jsonb(v_old),
    jsonb_build_object(
      'amount', round(p_amount, 2),
      'description', trim(p_description),
      'due_date', p_due_date,
      'competence_date', p_competence_date
    ),
    'Conta a pagar editada',
    'payable',
    p_movement_id
  );

  return jsonb_build_object('id', p_movement_id, 'status', v_old.status);
end;
$$;

create or replace function public.settle_payable(
  p_tenant_id uuid,
  p_movement_id uuid,
  p_account_id uuid,
  p_payment_method text,
  p_payment_date date,
  p_proof_url text,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payable public.cash_movements%rowtype;
  v_now timestamptz := now();
begin
  if not private.is_tenant_member((select auth.uid()), p_tenant_id) then
    raise exception 'Acesso negado para esta empresa.' using errcode = '42501';
  end if;

  select *
  into v_payable
  from public.cash_movements
  where id = p_movement_id
    and tenant_id = p_tenant_id
    and kind = 'out'
  for update;

  if not found then
    raise exception 'Conta a pagar não encontrada.' using errcode = 'P0002';
  end if;

  if v_payable.reference_type = 'commission' then
    raise exception 'Pague esta obrigação pela Prestação de Contas de Comissões.' using errcode = 'P0001';
  end if;

  if v_payable.status not in ('pending', 'scheduled') then
    raise exception 'Esta conta não está disponível para pagamento.' using errcode = 'P0001';
  end if;

  if p_account_id is null or nullif(trim(p_payment_method), '') is null then
    raise exception 'Informe a conta e a forma de pagamento.' using errcode = '22000';
  end if;

  if not exists (
    select 1
    from public.financial_accounts
    where id = p_account_id
      and tenant_id = p_tenant_id
      and active
  ) then
    raise exception 'Conta financeira inválida.' using errcode = '22000';
  end if;

  update public.cash_movements
  set
    status = 'paid',
    account_id = p_account_id,
    payment_method = trim(p_payment_method),
    movement_date = coalesce(p_payment_date, current_date),
    paid_at = v_now,
    paid_by = (select auth.uid()),
    proof_url = coalesce(nullif(trim(p_proof_url), ''), proof_url),
    notes = concat_ws(' | ', notes, nullif(trim(p_notes), '')),
    updated_at = v_now
  where id = p_movement_id;

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
    'cash_movement',
    p_movement_id,
    'payable_paid',
    to_jsonb(v_payable),
    jsonb_build_object(
      'status', 'paid',
      'payment_date', coalesce(p_payment_date, current_date),
      'payment_method', trim(p_payment_method),
      'account_id', p_account_id
    ),
    coalesce(nullif(trim(p_notes), ''), 'Conta a pagar quitada'),
    'payable',
    p_movement_id
  );

  return jsonb_build_object(
    'id', p_movement_id,
    'status', 'paid',
    'amount', v_payable.amount,
    'paid_at', v_now
  );
end;
$$;

create or replace function public.cancel_payable(
  p_tenant_id uuid,
  p_movement_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payable public.cash_movements%rowtype;
  v_now timestamptz := now();
begin
  if not private.is_tenant_member((select auth.uid()), p_tenant_id) then
    raise exception 'Acesso negado para esta empresa.' using errcode = '42501';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '22000';
  end if;

  select *
  into v_payable
  from public.cash_movements
  where id = p_movement_id
    and tenant_id = p_tenant_id
    and kind = 'out'
  for update;

  if not found then
    raise exception 'Conta a pagar não encontrada.' using errcode = 'P0002';
  end if;

  if v_payable.reference_type = 'commission' then
    raise exception 'Comissões devem ser tratadas no módulo de Comissões.' using errcode = 'P0001';
  end if;

  if v_payable.status not in ('pending', 'scheduled') then
    raise exception 'Somente contas pendentes podem ser canceladas.' using errcode = 'P0001';
  end if;

  update public.cash_movements
  set
    status = 'canceled',
    canceled_at = v_now,
    canceled_by = (select auth.uid()),
    cancellation_reason = trim(p_reason),
    updated_at = v_now
  where id = p_movement_id;

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
    'cash_movement',
    p_movement_id,
    'payable_canceled',
    to_jsonb(v_payable),
    jsonb_build_object('status', 'canceled'),
    trim(p_reason),
    'payable',
    p_movement_id
  );

  return jsonb_build_object('id', p_movement_id, 'status', 'canceled');
end;
$$;

revoke all on function public.create_payable_series(uuid, text, text, numeric, uuid, uuid, date, date, integer, integer, text, text, text) from public, anon;
grant execute on function public.create_payable_series(uuid, text, text, numeric, uuid, uuid, date, date, integer, integer, text, text, text) to authenticated, service_role;
revoke all on function public.update_payable(uuid, uuid, text, text, numeric, uuid, uuid, date, date, text, text, text) from public, anon;
grant execute on function public.update_payable(uuid, uuid, text, text, numeric, uuid, uuid, date, date, text, text, text) to authenticated, service_role;
revoke all on function public.settle_payable(uuid, uuid, uuid, text, date, text, text) from public, anon;
grant execute on function public.settle_payable(uuid, uuid, uuid, text, date, text, text) to authenticated, service_role;
revoke all on function public.cancel_payable(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_payable(uuid, uuid, text) to authenticated, service_role;

commit;
