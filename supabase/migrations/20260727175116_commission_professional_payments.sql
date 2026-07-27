begin;

-- Comissão da etapa 2: somente serviços concluídos, profissional correto,
-- percentual congelado no lançamento e pagamentos totais ou parciais.

alter table public.commission_entries
  add column if not exists paid_amount numeric(14,2) not null default 0;

update public.commission_entries
set paid_amount = commission_amount
where status = 'paid'
  and coalesce(paid_amount, 0) = 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'commission_entries_paid_amount_check'
      and conrelid = 'public.commission_entries'::regclass
  ) then
    alter table public.commission_entries
      add constraint commission_entries_paid_amount_check
      check (paid_amount >= 0 and paid_amount <= commission_amount)
      not valid;
  end if;
end
$$;

alter table public.commission_entries
  validate constraint commission_entries_paid_amount_check;

-- Uma comissão pode ser quitada em mais de uma prestação. O vínculo único
-- antigo impedia pagamento parcial e é substituído pela soma auditável dos itens.
alter table public.commission_settlement_items
  drop constraint if exists commission_settlement_items_commission_entry_id_key;

create index if not exists commission_settlement_items_entry_idx
  on public.commission_settlement_items (commission_entry_id, created_at desc);

create or replace function private.professional_is_owner(
  p_tenant_id uuid,
  p_professional_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.professionals professional
    left join public.user_roles role
      on role.user_id = professional.auth_user_id
     and role.tenant_id = professional.tenant_id
     and role.role = 'owner'::public.app_role
    where professional.id = p_professional_id
      and professional.tenant_id = p_tenant_id
      and (
        professional.access_profile = 'owner'
        or role.user_id is not null
      )
  );
$function$;

revoke all on function private.professional_is_owner(uuid, uuid)
from public, anon;
grant execute on function private.professional_is_owner(uuid, uuid)
to authenticated, service_role;

-- O percentual editado no cadastro continua sendo a fonte do próximo serviço.
-- Lançamentos já criados não são recalculados por este sincronismo.
create or replace function public.sync_professional_commission_rule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rule_id uuid;
  v_percentage numeric(7,4) := greatest(0, least(100, coalesce(new.commission_pct, 0)));
begin
  select rule.id
  into v_rule_id
  from public.commission_rules rule
  where rule.tenant_id = new.tenant_id
    and rule.rule_scope = 'professional'
    and rule.item_kind = 'service'
    and rule.professional_id = new.id
    and rule.active
  order by rule.updated_at desc
  limit 1;

  if v_rule_id is null then
    insert into public.commission_rules (
      tenant_id,
      rule_scope,
      item_kind,
      professional_id,
      percentage,
      active,
      change_reason
    )
    values (
      new.tenant_id,
      'professional',
      'service',
      new.id,
      v_percentage,
      true,
      'Percentual sincronizado do cadastro do profissional'
    );
  else
    update public.commission_rules
    set
      percentage = v_percentage,
      change_reason = 'Percentual alterado no cadastro do profissional',
      updated_at = now()
    where id = v_rule_id;
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_professional_commission_rule()
from public, anon, authenticated;

create or replace function public.validate_professional_commission_pct()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.commission_pct is not null
    and (
      new.commission_pct::text = 'NaN'
      or new.commission_pct < 0
      or new.commission_pct > 100
    ) then
    raise exception 'O percentual de comissão deve estar entre 0 e 100.' using errcode = '22003';
  end if;
  return new;
end;
$function$;

drop trigger if exists professionals_validate_commission_pct
on public.professionals;
create trigger professionals_validate_commission_pct
before insert or update of commission_pct on public.professionals
for each row execute function public.validate_professional_commission_pct();

drop trigger if exists professionals_sync_commission_rule
on public.professionals;
create trigger professionals_sync_commission_rule
after insert or update of commission_pct on public.professionals
for each row execute function public.sync_professional_commission_rule();

-- Reexecutar o fechamento de uma comanda deve preservar o percentual e o
-- valor historicamente congelados. Nenhum produto gera comissão neste módulo.
create or replace function public.generate_commissions_for_commanda(
  p_commanda_id uuid,
  p_tenant_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_commanda public.commandas%rowtype;
  v_item public.commanda_items%rowtype;
  v_rule record;
  v_existing public.commission_entries%rowtype;
  v_entry public.commission_entries%rowtype;
  v_category_id uuid;
  v_gross numeric(14,2);
  v_amount numeric(14,2);
  v_count integer := 0;
  v_is_owner boolean;
begin
  select *
  into v_commanda
  from public.commandas
  where id = p_commanda_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Comanda não encontrada ou acesso negado.' using errcode = 'P0002';
  end if;

  if v_commanda.status <> 'closed' then
    raise exception 'A comissão somente pode ser gerada para uma comanda fechada.' using errcode = 'P0001';
  end if;

  select category.id
  into v_category_id
  from public.financial_categories category
  where category.tenant_id = p_tenant_id
    and category.name = 'Comissões'
  limit 1;

  for v_item in
    select item.*
    from public.commanda_items item
    where item.commanda_id = p_commanda_id
      and item.tenant_id = p_tenant_id
      and item.professional_id is not null
      and item.kind = 'service'
    order by item.id
  loop
    v_existing := null;

    select *
    into v_existing
    from public.commission_entries entry
    where entry.commanda_item_id = v_item.id
    for update;

    v_is_owner := private.professional_is_owner(p_tenant_id, v_item.professional_id);

    if v_existing.id is not null then
      if v_is_owner and v_existing.status in ('pending', 'scheduled') then
        update public.commission_entries
        set
          status = 'canceled',
          canceled_at = now(),
          cancellation_reason = 'Proprietário não gera comissão a pagar a si mesmo.',
          commission_amount = 0,
          updated_at = now()
        where id = v_existing.id;

        update public.cash_movements
        set
          status = 'canceled',
          canceled_at = now(),
          cancellation_reason = 'Comissão de proprietário removida da obrigação.',
          updated_at = now()
        where id = v_existing.payable_movement_id
          and status in ('pending', 'scheduled');
      end if;

      update public.commanda_items
      set
        commission_pct = case
          when v_is_owner then v_existing.commission_pct
          else v_existing.commission_pct
        end,
        commission_value = case
          when v_is_owner then 0
          when v_existing.status = 'canceled' then 0
          else v_existing.commission_amount
        end,
        commission_status = case
          when v_is_owner or v_existing.status = 'canceled' then 'paid'
          else v_existing.status
        end
      where id = v_item.id;

      continue;
    end if;

    select *
    into v_rule
    from public.resolve_commission_rule(
      p_tenant_id,
      v_item.professional_id,
      'service',
      v_item.ref_id
    )
    limit 1;

    v_gross := round(coalesce(v_item.unit_price, 0) * coalesce(v_item.quantity, 1), 2);

    if v_is_owner then
      update public.commanda_items
      set
        commission_pct = coalesce(v_rule.percentage, 0),
        commission_value = 0,
        commission_status = 'paid'
      where id = v_item.id;

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
      select
        p_tenant_id,
        'commission_exemption',
        v_item.id,
        'owner_service_no_commission',
        jsonb_build_object(
          'professional_id', v_item.professional_id,
          'gross_amount', v_gross,
          'configured_percentage', coalesce(v_rule.percentage, 0),
          'commission_amount', 0
        ),
        'O proprietário presta o serviço; o valor permanece faturamento da loja.',
        'commanda',
        p_commanda_id
      where not exists (
        select 1
        from public.financial_audit_log audit
        where audit.entity_type = 'commission_exemption'
          and audit.entity_id = v_item.id
          and audit.action = 'owner_service_no_commission'
      );

      continue;
    end if;

    v_amount := round(v_gross * coalesce(v_rule.percentage, 0) / 100, 2);

    if v_amount <= 0 then
      update public.commanda_items
      set
        commission_pct = coalesce(v_rule.percentage, 0),
        commission_value = 0,
        commission_status = 'paid'
      where id = v_item.id;
      continue;
    end if;

    insert into public.commission_entries (
      tenant_id,
      commanda_id,
      commanda_item_id,
      professional_id,
      item_kind,
      reference_id,
      item_name,
      quantity,
      gross_amount,
      commission_pct,
      commission_amount,
      rule_id,
      rule_scope,
      rule_description,
      competence_date,
      due_date,
      cost_center_id,
      status
    )
    values (
      p_tenant_id,
      p_commanda_id,
      v_item.id,
      v_item.professional_id,
      'service',
      v_item.ref_id,
      v_item.name,
      coalesce(v_item.quantity, 1),
      v_gross,
      coalesce(v_rule.percentage, 0),
      v_amount,
      v_rule.rule_id,
      coalesce(v_rule.rule_scope, 'company'),
      coalesce(v_rule.rule_description, 'Regra padrão da empresa'),
      coalesce(v_commanda.closed_at::date, current_date),
      coalesce(v_commanda.closed_at::date, current_date),
      coalesce(
        v_commanda.cost_center_id,
        (
          select professional.cost_center_id
          from public.professionals professional
          where professional.id = v_item.professional_id
        ),
        (
          select center.id
          from public.cost_centers center
          where center.tenant_id = p_tenant_id
            and center.active
          order by (center.code = 'OPERACAO') desc, center.created_at
          limit 1
        )
      ),
      'pending'
    )
    returning *
    into v_entry;

    update public.commanda_items
    set
      commission_pct = v_entry.commission_pct,
      commission_value = v_entry.commission_amount,
      commission_status = 'pending'
    where id = v_item.id;

    insert into public.cash_movements (
      tenant_id,
      kind,
      amount,
      description,
      category,
      category_id,
      movement_date,
      competence_date,
      due_date,
      status,
      source,
      reference_type,
      reference_id,
      professional_id,
      commanda_id,
      client_id,
      cost_center_id,
      affects_cash,
      affects_dre,
      origin_label
    )
    values (
      p_tenant_id,
      'out',
      v_entry.commission_amount,
      'Comissão gerada pela comanda #' || v_commanda.number || ' · ' || v_entry.item_name,
      'Comissões',
      v_category_id,
      v_entry.due_date,
      v_entry.competence_date,
      v_entry.due_date,
      'pending',
      'commission',
      'commission',
      v_entry.id,
      v_entry.professional_id,
      v_entry.commanda_id,
      v_commanda.client_id,
      v_entry.cost_center_id,
      false,
      true,
      'Comissão gerada por serviço concluído'
    )
    returning id into v_entry.payable_movement_id;

    update public.commission_entries
    set payable_movement_id = v_entry.payable_movement_id
    where id = v_entry.id;

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
      'commission_entry',
      v_entry.id,
      'commission_generated',
      jsonb_build_object(
        'professional_id', v_entry.professional_id,
        'gross_amount', v_entry.gross_amount,
        'commission_pct', v_entry.commission_pct,
        'commission_amount', v_entry.commission_amount,
        'rule_scope', v_entry.rule_scope,
        'item_kind', v_entry.item_kind
      ),
      'Fechamento da comanda; percentual congelado no lançamento.',
      'commanda',
      p_commanda_id
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.cancel_commissions_for_commanda(
  p_commanda_id uuid,
  p_tenant_id uuid,
  p_reason text default 'Comanda cancelada ou estornada'
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entry public.commission_entries%rowtype;
  v_count integer := 0;
begin
  for v_entry in
    select entry.*
    from public.commission_entries entry
    where entry.commanda_id = p_commanda_id
      and entry.tenant_id = p_tenant_id
      and entry.status in ('pending', 'scheduled')
    for update
  loop
    update public.commission_entries
    set
      status = 'canceled',
      canceled_at = now(),
      cancellation_reason = coalesce(nullif(trim(p_reason), ''), 'Comanda cancelada ou estornada'),
      updated_at = now()
    where id = v_entry.id;

    if v_entry.paid_amount > 0 then
      insert into public.commission_adjustments (
        tenant_id,
        professional_id,
        adjustment_type,
        nature,
        amount,
        competence_date,
        status,
        description,
        notes
      )
      values (
        p_tenant_id,
        v_entry.professional_id,
        'other_debit',
        'debit',
        v_entry.paid_amount,
        coalesce(v_entry.competence_date, current_date),
        'open',
        'Estorno de comissão por cancelamento da comanda',
        coalesce(nullif(trim(p_reason), ''), 'Comanda cancelada ou estornada')
      );
    end if;

    update public.commanda_items
    set commission_status = 'paid', commission_value = 0
    where id = v_entry.commanda_item_id;

    update public.cash_movements
    set
      status = 'canceled',
      canceled_at = now(),
      cancellation_reason = coalesce(nullif(trim(p_reason), ''), 'Comanda cancelada ou estornada'),
      updated_at = now()
    where id = v_entry.payable_movement_id
      and status in ('pending', 'scheduled');

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
      'commission_entry',
      v_entry.id,
      'commission_canceled',
      jsonb_build_object(
        'commission_amount', v_entry.commission_amount,
        'professional_id', v_entry.professional_id,
        'reason', coalesce(nullif(trim(p_reason), ''), 'Comanda cancelada ou estornada')
      ),
      coalesce(nullif(trim(p_reason), ''), 'Comanda cancelada ou estornada'),
      'commanda',
      p_commanda_id
    );

    v_count := v_count + 1;
  end loop;

  -- Um estorno posterior ao pagamento não apaga o histórico do pagamento.
  -- Ele cria um débito auditável para compensação futura, sem duplicar o ajuste
  -- se o mesmo cancelamento for processado novamente.
  for v_entry in
    select entry.*
    from public.commission_entries entry
    where entry.commanda_id = p_commanda_id
      and entry.tenant_id = p_tenant_id
      and entry.status = 'paid'
      and entry.paid_amount > 0
      and not exists (
        select 1
        from public.financial_audit_log audit
        where audit.entity_type = 'commission_entry'
          and audit.entity_id = entry.id
          and audit.action = 'commission_canceled_after_payment'
      )
    for update
  loop
    insert into public.commission_adjustments (
      tenant_id,
      professional_id,
      adjustment_type,
      nature,
      amount,
      competence_date,
      status,
      description,
      notes
    )
    values (
      p_tenant_id,
      v_entry.professional_id,
      'other_debit',
      'debit',
      v_entry.paid_amount,
      coalesce(v_entry.competence_date, current_date),
      'open',
      'Estorno de comissão já paga por cancelamento da comanda',
      coalesce(nullif(trim(p_reason), ''), 'Comanda cancelada ou estornada')
    );

    update public.commanda_items
    set commission_value = 0
    where id = v_entry.commanda_item_id;

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
      'commission_entry',
      v_entry.id,
      'commission_canceled_after_payment',
      jsonb_build_object(
        'paid_amount', v_entry.paid_amount,
        'professional_id', v_entry.professional_id,
        'reason', coalesce(nullif(trim(p_reason), ''), 'Comanda cancelada ou estornada')
      ),
      coalesce(nullif(trim(p_reason), ''), 'Comanda cancelada ou estornada'),
      'commanda',
      p_commanda_id
    );
  end loop;

  return v_count;
end;
$$;

create or replace function public.generate_commissions_after_commanda_close()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'closed' then
    if tg_op = 'INSERT' then
      perform public.generate_commissions_for_commanda(new.id, new.tenant_id);
    elsif old.status is distinct from new.status then
      perform public.generate_commissions_for_commanda(new.id, new.tenant_id);
    end if;
  elsif lower(coalesce(new.status, '')) in ('canceled', 'cancelled', 'no_show', 'noshow')
    and tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      perform public.cancel_commissions_for_commanda(
        new.id,
        new.tenant_id,
        'Comanda cancelada ou estornada'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists commandas_generate_commissions on public.commandas;
create trigger commandas_generate_commissions
after insert or update of status on public.commandas
for each row execute function public.generate_commissions_after_commanda_close();

-- Algumas integrações inserem a comanda como fechada e só depois inserem os
-- itens. Este gatilho garante que o fechamento nunca fique sem comissão.
create or replace function public.generate_commissions_after_commanda_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_commanda public.commandas%rowtype;
begin
  select *
  into v_commanda
  from public.commandas
  where id = new.commanda_id
    and tenant_id = new.tenant_id;

  if v_commanda.status = 'closed' then
    perform public.generate_commissions_for_commanda(v_commanda.id, v_commanda.tenant_id);
  end if;
  return new;
end;
$$;

drop trigger if exists commanda_items_generate_commissions on public.commanda_items;
create trigger commanda_items_generate_commissions
after insert or update of commanda_id, professional_id, kind, unit_price, quantity
on public.commanda_items
for each row execute function public.generate_commissions_after_commanda_item();

create or replace function public.record_commission_payment(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_period_start date,
  p_period_end date,
  p_allocations jsonb,
  p_adjustments jsonb,
  p_account_id uuid,
  p_payment_method text,
  p_payment_date date,
  p_notes text,
  p_proof_url text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected_count integer;
  v_distinct_count integer;
  v_selected_count integer;
  v_gross numeric(14,2);
  v_credits numeric(14,2);
  v_debits numeric(14,2);
  v_net numeric(14,2);
  v_settlement_id uuid;
  v_cash_movement_id uuid;
  v_category_id uuid;
  v_cost_center_id uuid;
  v_now timestamptz := now();
begin
  if not private.can_manage_tenant_operations(p_tenant_id) then
    raise exception 'Acesso negado para esta operação financeira.' using errcode = '42501';
  end if;

  if private.professional_is_owner(p_tenant_id, p_professional_id) then
    raise exception 'O proprietário não possui comissão a pagar a si mesmo.' using errcode = 'P0001';
  end if;

  if p_period_end < p_period_start then
    raise exception 'O período de apuração é inválido.' using errcode = '22007';
  end if;

  select
    count(*),
    count(distinct allocation.commission_entry_id)
  into v_expected_count, v_distinct_count
  from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
    commission_entry_id uuid,
    amount numeric
  );

  if v_expected_count = 0 or v_expected_count <> v_distinct_count then
    raise exception 'Informe uma lista de pagamentos válida, sem lançamentos duplicados.' using errcode = '22000';
  end if;

  perform entry.id
  from public.commission_entries entry
  join jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
    commission_entry_id uuid,
    amount numeric
  ) on allocation.commission_entry_id = entry.id
  where entry.tenant_id = p_tenant_id
    and entry.professional_id = p_professional_id
    and entry.competence_date between p_period_start and p_period_end
    and entry.status in ('pending', 'scheduled')
  for update;

  select
    count(*),
    round(coalesce(sum(allocation.amount), 0), 2),
    min(entry.cost_center_id)
  into v_selected_count, v_gross, v_cost_center_id
  from public.commission_entries entry
  join jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
    commission_entry_id uuid,
    amount numeric
  ) on allocation.commission_entry_id = entry.id
  where entry.tenant_id = p_tenant_id
    and entry.professional_id = p_professional_id
    and entry.competence_date between p_period_start and p_period_end
    and entry.status in ('pending', 'scheduled')
    and allocation.amount > 0
    and allocation.amount <= round(entry.commission_amount - entry.paid_amount, 2);

  if v_selected_count <> v_expected_count then
    raise exception 'Um lançamento não pertence ao profissional/período ou excede o saldo restante.' using errcode = 'P0001';
  end if;

  if p_payment_method is null or trim(p_payment_method) = '' then
    raise exception 'Informe a forma de pagamento.' using errcode = '22000';
  end if;

  if p_account_id is null or not exists (
    select 1
    from public.financial_accounts account
    where account.id = p_account_id
      and account.tenant_id = p_tenant_id
      and account.active
  ) then
    raise exception 'Conta financeira inválida.' using errcode = '22000';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_adjustments, '[]'::jsonb)) as adjustment(
      adjustment_type text,
      nature text,
      amount numeric,
      description text,
      notes text
    )
    where adjustment.amount is null
      or adjustment.amount <= 0
      or adjustment.nature not in ('credit', 'debit')
      or nullif(trim(adjustment.description), '') is null
  ) then
    raise exception 'Acréscimo ou desconto inválido.' using errcode = '22000';
  end if;

  select
    round(coalesce(sum(case when adjustment.nature = 'credit' then adjustment.amount else 0 end), 0), 2),
    round(coalesce(sum(case when adjustment.nature = 'debit' then adjustment.amount else 0 end), 0), 2)
  into v_credits, v_debits
  from jsonb_to_recordset(coalesce(p_adjustments, '[]'::jsonb)) as adjustment(
    adjustment_type text,
    nature text,
    amount numeric,
    description text,
    notes text
  );

  v_net := round(v_gross + v_credits - v_debits, 2);
  if v_net < 0 then
    raise exception 'Os descontos não podem deixar o pagamento negativo.' using errcode = '22003';
  end if;

  insert into public.commission_settlements (
    tenant_id,
    professional_id,
    period_start,
    period_end,
    gross_amount,
    credit_amount,
    debit_amount,
    net_amount,
    status,
    payment_method,
    payment_date,
    account_id,
    cost_center_id,
    proof_url,
    notes,
    paid_at
  )
  values (
    p_tenant_id,
    p_professional_id,
    p_period_start,
    p_period_end,
    v_gross,
    v_credits,
    v_debits,
    v_net,
    'paid',
    trim(p_payment_method),
    coalesce(p_payment_date, current_date),
    p_account_id,
    v_cost_center_id,
    nullif(trim(p_proof_url), ''),
    nullif(trim(p_notes), ''),
    v_now
  )
  returning id into v_settlement_id;

  insert into public.commission_settlement_items (
    tenant_id,
    settlement_id,
    commission_entry_id,
    amount
  )
  select
    p_tenant_id,
    v_settlement_id,
    allocation.commission_entry_id,
    round(allocation.amount, 2)
  from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
    commission_entry_id uuid,
    amount numeric
  );

  insert into public.commission_adjustments (
    tenant_id,
    professional_id,
    settlement_id,
    adjustment_type,
    nature,
    amount,
    competence_date,
    status,
    description,
    notes,
    applied_at
  )
  select
    p_tenant_id,
    p_professional_id,
    v_settlement_id,
    adjustment.adjustment_type,
    adjustment.nature,
    round(adjustment.amount, 2),
    coalesce(p_payment_date, current_date),
    'applied',
    trim(adjustment.description),
    nullif(trim(adjustment.notes), ''),
    v_now
  from jsonb_to_recordset(coalesce(p_adjustments, '[]'::jsonb)) as adjustment(
    adjustment_type text,
    nature text,
    amount numeric,
    description text,
    notes text
  );

  update public.commission_entries entry
  set
    paid_amount = round(entry.paid_amount + allocation.amount, 2),
    status = case
      when round(entry.paid_amount + allocation.amount, 2) >= entry.commission_amount
        then 'paid'
      else entry.status
    end,
    settlement_id = case
      when round(entry.paid_amount + allocation.amount, 2) >= entry.commission_amount
        then v_settlement_id
      else null
    end,
    paid_at = case
      when round(entry.paid_amount + allocation.amount, 2) >= entry.commission_amount
        then v_now
      else entry.paid_at
    end,
    updated_at = v_now
  from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
    commission_entry_id uuid,
    amount numeric
  )
  where entry.id = allocation.commission_entry_id;

  update public.commanda_items item
  set commission_status = 'paid'
  from public.commission_entries entry
  join jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
    commission_entry_id uuid,
    amount numeric
  ) on allocation.commission_entry_id = entry.id
  where item.id = entry.commanda_item_id
    and entry.status = 'paid';

  update public.cash_movements movement
  set
    status = case when entry.status = 'paid' then 'paid' else movement.status end,
    paid_at = case when entry.status = 'paid' then v_now else movement.paid_at end,
    movement_date = case
      when entry.status = 'paid' then coalesce(p_payment_date, current_date)
      else movement.movement_date
    end,
    payment_method = case
      when entry.status = 'paid' then trim(p_payment_method)
      else movement.payment_method
    end,
    account_id = case when entry.status = 'paid' then p_account_id else movement.account_id end,
    settlement_id = case when entry.status = 'paid' then v_settlement_id else null end,
    notes = case
      when entry.status = 'paid' then movement.notes
      else concat_ws(' | ', movement.notes, 'Pagamento parcial registrado')
    end,
    updated_at = v_now
  from public.commission_entries entry
  join jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as allocation(
    commission_entry_id uuid,
    amount numeric
  ) on allocation.commission_entry_id = entry.id
  where movement.id = entry.payable_movement_id;

  select category.id
  into v_category_id
  from public.financial_categories category
  where category.tenant_id = p_tenant_id
    and category.name = 'Comissões'
  limit 1;

  if v_net > 0 then
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
      paid_at,
      status,
      payment_method,
      source,
      reference_type,
      reference_id,
      professional_id,
      settlement_id,
      cost_center_id,
      affects_cash,
      affects_dre,
      origin_label,
      notes
    )
    values (
      p_tenant_id,
      'out',
      v_net,
      'Pagamento de comissão profissional',
      'Comissões',
      v_category_id,
      p_account_id,
      coalesce(p_payment_date, current_date),
      p_period_end,
      coalesce(p_payment_date, current_date),
      v_now,
      'paid',
      trim(p_payment_method),
      'commission_settlement',
      'commission_settlement',
      v_settlement_id,
      p_professional_id,
      v_settlement_id,
      v_cost_center_id,
      true,
      false,
      'Pagamento de comissão',
      nullif(trim(p_notes), '')
    )
    returning id into v_cash_movement_id;

    update public.commission_settlements
    set cash_movement_id = v_cash_movement_id
    where id = v_settlement_id;
  end if;

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
    'commission_settlement',
    v_settlement_id,
    'commission_payment_recorded',
    jsonb_build_object(
      'professional_id', p_professional_id,
      'allocations', p_allocations,
      'gross_amount', v_gross,
      'credit_amount', v_credits,
      'debit_amount', v_debits,
      'net_amount', v_net,
      'payment_method', trim(p_payment_method),
      'payment_date', coalesce(p_payment_date, current_date)
    ),
    coalesce(nullif(trim(p_notes), ''), 'Pagamento de comissão registrado'),
    'professional',
    p_professional_id
  );

  return jsonb_build_object(
    'id', v_settlement_id,
    'gross_amount', v_gross,
    'credit_amount', v_credits,
    'debit_amount', v_debits,
    'net_amount', v_net,
    'cash_movement_id', v_cash_movement_id,
    'status', 'paid'
  );
end;
$$;

-- Compatibilidade para clientes antigos: pagamento "total" passa a quitar
-- somente o saldo restante de cada lançamento e usa o mesmo caminho protegido.
create or replace function public.settle_commissions(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_period_start date,
  p_period_end date,
  p_commission_ids uuid[],
  p_adjustments jsonb,
  p_account_id uuid,
  p_payment_method text,
  p_payment_date date,
  p_notes text,
  p_proof_url text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allocations jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'commission_entry_id', entry.id,
        'amount', round(entry.commission_amount - entry.paid_amount, 2)
      )
    ),
    '[]'::jsonb
  )
  into v_allocations
  from public.commission_entries entry
  where entry.id = any(p_commission_ids)
    and entry.tenant_id = p_tenant_id
    and entry.professional_id = p_professional_id
    and entry.status in ('pending', 'scheduled')
    and entry.competence_date between p_period_start and p_period_end
    and entry.commission_amount > entry.paid_amount;

  return public.record_commission_payment(
    p_tenant_id,
    p_professional_id,
    p_period_start,
    p_period_end,
    v_allocations,
    p_adjustments,
    p_account_id,
    p_payment_method,
    p_payment_date,
    p_notes,
    p_proof_url
  );
end;
$$;

create or replace function public.reverse_commission_settlement(
  p_tenant_id uuid,
  p_settlement_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settlement public.commission_settlements%rowtype;
  v_now timestamptz := now();
begin
  if not private.can_manage_tenant_operations(p_tenant_id) then
    raise exception 'Acesso negado para esta operação financeira.' using errcode = '42501';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Informe o motivo do estorno.' using errcode = '22000';
  end if;

  select *
  into v_settlement
  from public.commission_settlements
  where id = p_settlement_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Prestação de contas não encontrada.' using errcode = 'P0002';
  end if;

  if v_settlement.status <> 'paid' then
    raise exception 'Somente uma prestação paga pode ser estornada.' using errcode = 'P0001';
  end if;

  perform item.id
  from public.commission_settlement_items item
  where item.settlement_id = p_settlement_id
  for update;

  update public.cash_movements
  set
    status = 'canceled',
    notes = concat_ws(' | ', notes, 'Estorno: ' || trim(p_reason)),
    updated_at = v_now
  where id = v_settlement.cash_movement_id;

  with allocations as (
    select commission_entry_id, round(sum(amount), 2) as amount
    from public.commission_settlement_items
    where settlement_id = p_settlement_id
    group by commission_entry_id
  )
  update public.commission_entries entry
  set
    paid_amount = greatest(0, round(entry.paid_amount - allocations.amount, 2)),
    status = case
      when entry.status = 'canceled' then 'canceled'
      when greatest(0, round(entry.paid_amount - allocations.amount, 2)) >= entry.commission_amount
        then 'paid'
      else 'pending'
    end,
    settlement_id = null,
    paid_at = case
      when greatest(0, round(entry.paid_amount - allocations.amount, 2)) >= entry.commission_amount
        then entry.paid_at
      else null
    end,
    updated_at = v_now
  from allocations
  where entry.id = allocations.commission_entry_id;

  update public.commanda_items item
  set commission_status = case when entry.status = 'paid' then 'paid' else 'pending' end
  from public.commission_entries entry
  join public.commission_settlement_items settlement_item
    on settlement_item.commission_entry_id = entry.id
   and settlement_item.settlement_id = p_settlement_id
  where item.id = entry.commanda_item_id;

  update public.cash_movements movement
  set
    status = case when entry.status = 'paid' then 'paid' else 'pending' end,
    paid_at = case when entry.status = 'paid' then movement.paid_at else null end,
    settlement_id = case when entry.status = 'paid' then movement.settlement_id else null end,
    updated_at = v_now
  from public.commission_entries entry
  join public.commission_settlement_items settlement_item
    on settlement_item.commission_entry_id = entry.id
   and settlement_item.settlement_id = p_settlement_id
  where movement.id = entry.payable_movement_id;

  update public.commission_settlements
  set
    status = 'reversed',
    reversed_at = v_now,
    reversal_reason = trim(p_reason),
    updated_at = v_now
  where id = p_settlement_id;

  update public.commission_adjustments
  set
    status = 'canceled',
    canceled_at = v_now,
    updated_at = v_now
  where settlement_id = p_settlement_id
    and status = 'applied';

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
    'commission_settlement',
    p_settlement_id,
    'settlement_reversed',
    to_jsonb(v_settlement),
    jsonb_build_object('status', 'reversed'),
    trim(p_reason),
    'professional',
    v_settlement.professional_id
  );

  return jsonb_build_object('id', p_settlement_id, 'status', 'reversed');
end;
$$;

revoke all on function public.record_commission_payment(uuid, uuid, date, date, jsonb, jsonb, uuid, text, date, text, text)
from public, anon;
grant execute on function public.record_commission_payment(uuid, uuid, date, date, jsonb, jsonb, uuid, text, date, text, text)
to authenticated, service_role;
revoke all on function public.settle_commissions(uuid, uuid, date, date, uuid[], jsonb, uuid, text, date, text, text)
from public, anon;
grant execute on function public.settle_commissions(uuid, uuid, date, date, uuid[], jsonb, uuid, text, date, text, text)
to authenticated, service_role;
revoke all on function public.reverse_commission_settlement(uuid, uuid, text)
from public, anon;
grant execute on function public.reverse_commission_settlement(uuid, uuid, text)
to authenticated, service_role;

-- Reprocessa apenas o vínculo contábil das comandas fechadas. Percentuais de
-- lançamentos existentes ficam congelados; novos lançamentos usam a regra atual.
do $$
declare
  v_commanda record;
begin
  for v_commanda in
    select id, tenant_id
    from public.commandas
    where status = 'closed'
    order by id
  loop
    perform public.generate_commissions_for_commanda(v_commanda.id, v_commanda.tenant_id);
  end loop;
end
$$;

-- Produtos e serviços do proprietário não permanecem como obrigação de
-- comissão, mesmo quando vieram de dados legados já fechados.
update public.commission_entries entry
set
  status = 'canceled',
  canceled_at = coalesce(entry.canceled_at, now()),
  cancellation_reason = coalesce(
    entry.cancellation_reason,
    'Comissão removida: somente serviços de profissionais comuns geram obrigação.'
  ),
  updated_at = now()
where entry.item_kind = 'product'
  and entry.status in ('pending', 'scheduled');

update public.cash_movements movement
set
  status = 'canceled',
  canceled_at = coalesce(movement.canceled_at, now()),
  cancellation_reason = coalesce(
    movement.cancellation_reason,
    'Obrigação de produto removida do módulo de comissões.'
  ),
  updated_at = now()
where movement.reference_type = 'commission'
  and movement.status in ('pending', 'scheduled')
  and exists (
    select 1
    from public.commission_entries entry
    where entry.id = movement.reference_id
      and entry.item_kind = 'product'
  );

update public.commanda_items item
set
  commission_value = 0,
  commission_status = 'paid'
where item.kind = 'product'
  and exists (
    select 1
    from public.commission_entries entry
    where entry.commanda_item_id = item.id
      and entry.item_kind = 'product'
      and entry.status = 'canceled'
  );

commit;
