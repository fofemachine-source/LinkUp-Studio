begin;

-- Gestão financeira de profissionais e comissões.
-- A estrutura é aditiva: mantém commanda_items e cash_movements como compatibilidade,
-- mas cria uma fonte transacional e auditável para o ciclo completo.

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cost_centers_tenant_name_uidx
  on public.cost_centers (tenant_id, lower(name));
create unique index if not exists cost_centers_tenant_code_uidx
  on public.cost_centers (tenant_id, lower(code))
  where code is not null;
create index if not exists cost_centers_tenant_active_idx
  on public.cost_centers (tenant_id, active);

alter table public.professionals
  add column if not exists cost_center_id uuid references public.cost_centers(id) on delete set null;

alter table public.commandas
  add column if not exists cost_center_id uuid references public.cost_centers(id) on delete set null;

alter table public.cash_movements
  add column if not exists cost_center_id uuid references public.cost_centers(id) on delete set null,
  add column if not exists professional_id uuid references public.professionals(id) on delete set null,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists commanda_id uuid references public.commandas(id) on delete set null,
  add column if not exists settlement_id uuid,
  add column if not exists affects_cash boolean not null default true,
  add column if not exists affects_dre boolean not null default true,
  add column if not exists origin_label text;

alter table public.cash_movements
  drop constraint if exists cash_movements_status_check;
alter table public.cash_movements
  add constraint cash_movements_status_check
  check (status in ('pending', 'scheduled', 'paid', 'canceled')) not valid;
alter table public.cash_movements validate constraint cash_movements_status_check;

create index if not exists professionals_cost_center_idx
  on public.professionals (cost_center_id)
  where cost_center_id is not null;
create index if not exists commandas_cost_center_idx
  on public.commandas (cost_center_id)
  where cost_center_id is not null;
create index if not exists cash_movements_cost_center_idx
  on public.cash_movements (cost_center_id)
  where cost_center_id is not null;
create index if not exists cash_movements_professional_idx
  on public.cash_movements (professional_id)
  where professional_id is not null;
create index if not exists cash_movements_client_idx
  on public.cash_movements (client_id)
  where client_id is not null;
create index if not exists cash_movements_commanda_idx
  on public.cash_movements (commanda_id)
  where commanda_id is not null;
create index if not exists cash_movements_tenant_kind_status_due_idx
  on public.cash_movements (tenant_id, kind, status, due_date);
create unique index if not exists cash_movements_commission_reference_uidx
  on public.cash_movements (tenant_id, reference_type, reference_id)
  where reference_type = 'commission';

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rule_scope text not null
    check (rule_scope in ('company', 'professional', 'item')),
  item_kind text not null
    check (item_kind in ('service', 'product')),
  professional_id uuid references public.professionals(id) on delete cascade,
  reference_id uuid,
  percentage numeric(7,4) not null
    check (percentage >= 0 and percentage <= 100),
  active boolean not null default true,
  change_reason text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_rules_scope_shape_check check (
    (rule_scope = 'company' and professional_id is null and reference_id is null)
    or
    (rule_scope = 'professional' and professional_id is not null and reference_id is null)
    or
    (rule_scope = 'item' and professional_id is null and reference_id is not null)
  )
);

create unique index if not exists commission_rules_company_active_uidx
  on public.commission_rules (tenant_id, item_kind)
  where rule_scope = 'company' and active;
create unique index if not exists commission_rules_professional_active_uidx
  on public.commission_rules (tenant_id, professional_id, item_kind)
  where rule_scope = 'professional' and active;
create unique index if not exists commission_rules_item_active_uidx
  on public.commission_rules (tenant_id, item_kind, reference_id)
  where rule_scope = 'item' and active;
create index if not exists commission_rules_tenant_scope_idx
  on public.commission_rules (tenant_id, rule_scope, item_kind, active);
create index if not exists commission_rules_professional_idx
  on public.commission_rules (professional_id)
  where professional_id is not null;

create table if not exists public.commission_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  gross_amount numeric(14,2) not null default 0 check (gross_amount >= 0),
  credit_amount numeric(14,2) not null default 0 check (credit_amount >= 0),
  debit_amount numeric(14,2) not null default 0 check (debit_amount >= 0),
  net_amount numeric(14,2) not null default 0 check (net_amount >= 0),
  status text not null default 'paid'
    check (status in ('draft', 'scheduled', 'paid', 'reversed', 'canceled')),
  payment_method text,
  payment_date date,
  account_id uuid references public.financial_accounts(id) on delete set null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  proof_url text,
  notes text,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  updated_at timestamptz not null default now(),
  constraint commission_settlements_period_check check (period_end >= period_start)
);

create index if not exists commission_settlements_tenant_period_idx
  on public.commission_settlements (tenant_id, period_end desc);
create index if not exists commission_settlements_professional_period_idx
  on public.commission_settlements (professional_id, period_end desc);
create index if not exists commission_settlements_status_idx
  on public.commission_settlements (tenant_id, status, payment_date);
create index if not exists commission_settlements_account_idx
  on public.commission_settlements (account_id)
  where account_id is not null;
create index if not exists commission_settlements_cost_center_idx
  on public.commission_settlements (cost_center_id)
  where cost_center_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_movements_settlement_id_fkey'
      and conrelid = 'public.cash_movements'::regclass
  ) then
    alter table public.cash_movements
      add constraint cash_movements_settlement_id_fkey
      foreign key (settlement_id)
      references public.commission_settlements(id)
      on delete set null;
  end if;
end
$$;

create index if not exists cash_movements_settlement_idx
  on public.cash_movements (settlement_id)
  where settlement_id is not null;

create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  commanda_id uuid not null references public.commandas(id) on delete restrict,
  commanda_item_id uuid not null references public.commanda_items(id) on delete restrict,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  item_kind text not null check (item_kind in ('service', 'product')),
  reference_id uuid,
  item_name text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  gross_amount numeric(14,2) not null default 0 check (gross_amount >= 0),
  commission_pct numeric(7,4) not null default 0
    check (commission_pct >= 0 and commission_pct <= 100),
  commission_amount numeric(14,2) not null default 0 check (commission_amount >= 0),
  rule_id uuid references public.commission_rules(id) on delete set null,
  rule_scope text not null default 'company'
    check (rule_scope in ('company', 'professional', 'item', 'legacy')),
  rule_description text,
  competence_date date not null,
  due_date date not null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'paid', 'canceled')),
  payable_movement_id uuid references public.cash_movements(id) on delete set null,
  settlement_id uuid references public.commission_settlements(id) on delete set null,
  generated_at timestamptz not null default now(),
  scheduled_at timestamptz,
  paid_at timestamptz,
  canceled_at timestamptz,
  cancellation_reason text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (commanda_item_id)
);

create index if not exists commission_entries_tenant_competence_idx
  on public.commission_entries (tenant_id, competence_date desc);
create index if not exists commission_entries_professional_status_due_idx
  on public.commission_entries (professional_id, status, due_date);
create index if not exists commission_entries_tenant_pending_idx
  on public.commission_entries (tenant_id, professional_id, due_date)
  where status in ('pending', 'scheduled');
create index if not exists commission_entries_commanda_idx
  on public.commission_entries (commanda_id);
create index if not exists commission_entries_payable_idx
  on public.commission_entries (payable_movement_id)
  where payable_movement_id is not null;
create index if not exists commission_entries_settlement_idx
  on public.commission_entries (settlement_id)
  where settlement_id is not null;
create index if not exists commission_entries_cost_center_idx
  on public.commission_entries (cost_center_id)
  where cost_center_id is not null;

create table if not exists public.commission_settlement_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  settlement_id uuid not null references public.commission_settlements(id) on delete cascade,
  commission_entry_id uuid not null references public.commission_entries(id) on delete restrict,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (commission_entry_id)
);

create index if not exists commission_settlement_items_settlement_idx
  on public.commission_settlement_items (settlement_id);

create table if not exists public.commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  settlement_id uuid references public.commission_settlements(id) on delete set null,
  adjustment_type text not null
    check (
      adjustment_type in (
        'advance',
        'discount',
        'product_consumption',
        'loan',
        'other_debit',
        'bonus',
        'other_credit'
      )
    ),
  nature text not null check (nature in ('credit', 'debit')),
  amount numeric(14,2) not null check (amount > 0),
  competence_date date not null default current_date,
  status text not null default 'open'
    check (status in ('open', 'applied', 'canceled')),
  description text not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  canceled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists commission_adjustments_professional_status_idx
  on public.commission_adjustments (professional_id, status, competence_date);
create index if not exists commission_adjustments_settlement_idx
  on public.commission_adjustments (settlement_id)
  where settlement_id is not null;
create index if not exists commission_adjustments_tenant_period_idx
  on public.commission_adjustments (tenant_id, competence_date desc);

create table if not exists public.financial_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  old_data jsonb,
  new_data jsonb,
  reason text,
  source_entity_type text,
  source_entity_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists financial_audit_log_tenant_created_idx
  on public.financial_audit_log (tenant_id, created_at desc);
create index if not exists financial_audit_log_entity_idx
  on public.financial_audit_log (entity_type, entity_id, created_at desc);
create index if not exists financial_audit_log_actor_idx
  on public.financial_audit_log (actor_user_id, created_at desc)
  where actor_user_id is not null;

insert into public.cost_centers (tenant_id, name, code)
select id, 'Operação principal', 'OPERACAO'
from public.tenants
on conflict do nothing;

update public.professionals professional
set cost_center_id = center.id
from public.cost_centers center
where professional.cost_center_id is null
  and center.tenant_id = professional.tenant_id
  and center.code = 'OPERACAO';

update public.commandas commanda
set cost_center_id = center.id
from public.cost_centers center
where commanda.cost_center_id is null
  and center.tenant_id = commanda.tenant_id
  and center.code = 'OPERACAO';

insert into public.commission_rules (
  tenant_id,
  rule_scope,
  item_kind,
  percentage,
  change_reason
)
select id, 'company', 'service', 45, 'Regra padrão criada na implantação do módulo'
from public.tenants
on conflict do nothing;

insert into public.commission_rules (
  tenant_id,
  rule_scope,
  item_kind,
  percentage,
  change_reason
)
select id, 'company', 'product', 0, 'Regra padrão criada na implantação do módulo'
from public.tenants
on conflict do nothing;

insert into public.commission_rules (
  tenant_id,
  rule_scope,
  item_kind,
  professional_id,
  percentage,
  change_reason
)
select
  professional.tenant_id,
  'professional',
  'service',
  professional.id,
  greatest(0, least(100, coalesce(professional.commission_pct, 0))),
  'Percentual migrado do cadastro do profissional'
from public.professionals professional
on conflict do nothing;

create or replace function public.seed_tenant_commission_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cost_centers (tenant_id, name, code)
  values (new.id, 'Operação principal', 'OPERACAO')
  on conflict do nothing;

  insert into public.commission_rules (
    tenant_id,
    rule_scope,
    item_kind,
    percentage,
    change_reason
  )
  values
    (new.id, 'company', 'service', 45, 'Regra padrão da empresa'),
    (new.id, 'company', 'product', 0, 'Regra padrão da empresa')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists tenants_seed_commission_defaults on public.tenants;
create trigger tenants_seed_commission_defaults
after insert on public.tenants
for each row execute function public.seed_tenant_commission_defaults();

create or replace function public.resolve_commission_rule(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_item_kind text,
  p_reference_id uuid
)
returns table (
  rule_id uuid,
  percentage numeric,
  rule_scope text,
  rule_description text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
  select
    rule.id,
    rule.percentage,
    rule.rule_scope,
    case
      when p_item_kind = 'service' then 'Regra específica do serviço'
      else 'Regra específica do produto'
    end
  from public.commission_rules rule
  where rule.tenant_id = p_tenant_id
    and rule.active
    and rule.rule_scope = 'item'
    and rule.item_kind = p_item_kind
    and rule.reference_id = p_reference_id
  order by rule.updated_at desc
  limit 1;

  if found then
    return;
  end if;

  return query
  select
    rule.id,
    rule.percentage,
    rule.rule_scope,
    'Regra padrão do profissional'
  from public.commission_rules rule
  where rule.tenant_id = p_tenant_id
    and rule.active
    and rule.rule_scope = 'professional'
    and rule.item_kind = p_item_kind
    and rule.professional_id = p_professional_id
  order by rule.updated_at desc
  limit 1;

  if found then
    return;
  end if;

  return query
  select
    rule.id,
    rule.percentage,
    rule.rule_scope,
    'Regra padrão da empresa'
  from public.commission_rules rule
  where rule.tenant_id = p_tenant_id
    and rule.active
    and rule.rule_scope = 'company'
    and rule.item_kind = p_item_kind
  order by rule.updated_at desc
  limit 1;
end;
$$;

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
  v_entry public.commission_entries%rowtype;
  v_category_id uuid;
  v_gross numeric(14,2);
  v_amount numeric(14,2);
  v_count integer := 0;
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
      and item.kind in ('service', 'product')
    order by item.id
  loop
    select *
    into v_rule
    from public.resolve_commission_rule(
      p_tenant_id,
      v_item.professional_id,
      v_item.kind,
      v_item.ref_id
    )
    limit 1;

    v_gross := round(coalesce(v_item.unit_price, 0) * coalesce(v_item.quantity, 1), 2);
    v_amount := round(v_gross * coalesce(v_rule.percentage, 0) / 100, 2);

    if v_amount <= 0 then
      update public.commanda_items
      set
        commission_pct = coalesce(v_rule.percentage, 0),
        commission_value = 0
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
      v_item.kind,
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
      case when v_item.commission_status = 'paid' then 'paid' else 'pending' end
    )
    on conflict (commanda_item_id) do update
    set
      gross_amount = excluded.gross_amount,
      commission_pct = case
        when public.commission_entries.status in ('paid', 'canceled')
          then public.commission_entries.commission_pct
        else excluded.commission_pct
      end,
      commission_amount = case
        when public.commission_entries.status in ('paid', 'canceled')
          then public.commission_entries.commission_amount
        else excluded.commission_amount
      end,
      rule_id = case
        when public.commission_entries.status in ('paid', 'canceled')
          then public.commission_entries.rule_id
        else excluded.rule_id
      end,
      rule_scope = case
        when public.commission_entries.status in ('paid', 'canceled')
          then public.commission_entries.rule_scope
        else excluded.rule_scope
      end,
      rule_description = case
        when public.commission_entries.status in ('paid', 'canceled')
          then public.commission_entries.rule_description
        else excluded.rule_description
      end,
      updated_at = now()
    returning *
    into v_entry;

    update public.commanda_items
    set
      commission_pct = v_entry.commission_pct,
      commission_value = v_entry.commission_amount,
      commission_status = v_entry.status
    where id = v_item.id;

    if v_entry.payable_movement_id is null then
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
        paid_at,
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
        case when v_entry.status = 'paid' then coalesce(v_commanda.closed_at, now()) else null end,
        v_entry.status,
        'commission',
        'commission',
        v_entry.id,
        v_entry.professional_id,
        v_entry.commanda_id,
        v_commanda.client_id,
        v_entry.cost_center_id,
        false,
        true,
        'Comissão gerada por comanda'
      )
      returning id into v_entry.payable_movement_id;

      update public.commission_entries
      set payable_movement_id = v_entry.payable_movement_id
      where id = v_entry.id;
    else
      update public.cash_movements
      set
        amount = v_entry.commission_amount,
        competence_date = v_entry.competence_date,
        due_date = v_entry.due_date,
        cost_center_id = v_entry.cost_center_id,
        updated_at = now()
      where id = v_entry.payable_movement_id
        and status in ('pending', 'scheduled');
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
    select
      p_tenant_id,
      'commission_entry',
      v_entry.id,
      'commission_generated',
      jsonb_build_object(
        'professional_id', v_entry.professional_id,
        'gross_amount', v_entry.gross_amount,
        'commission_pct', v_entry.commission_pct,
        'commission_amount', v_entry.commission_amount,
        'rule_scope', v_entry.rule_scope
      ),
      'Fechamento da comanda',
      'commanda',
      p_commanda_id
    where not exists (
      select 1
      from public.financial_audit_log audit
      where audit.entity_type = 'commission_entry'
        and audit.entity_id = v_entry.id
        and audit.action = 'commission_generated'
    );

    v_count := v_count + 1;
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
  if new.status = 'closed' and old.status is distinct from new.status then
    perform public.generate_commissions_for_commanda(new.id, new.tenant_id);
  end if;
  return new;
end;
$$;

drop trigger if exists commandas_generate_commissions on public.commandas;
create trigger commandas_generate_commissions
after update of status on public.commandas
for each row execute function public.generate_commissions_after_commanda_close();

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
  v_selected_count integer;
  v_expected_count integer;
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
  if not private.is_tenant_member((select auth.uid()), p_tenant_id) then
    raise exception 'Acesso negado para esta empresa.' using errcode = '42501';
  end if;

  if p_period_end < p_period_start then
    raise exception 'O período de apuração é inválido.' using errcode = '22007';
  end if;

  if coalesce(array_length(p_commission_ids, 1), 0) = 0 then
    raise exception 'Selecione ao menos uma comissão pendente.' using errcode = '22000';
  end if;

  select count(*)
  into v_expected_count
  from unnest(p_commission_ids) selected(id);

  perform entry.id
  from public.commission_entries entry
  where entry.id = any(p_commission_ids)
  order by entry.id
  for update;

  select
    count(*),
    round(coalesce(sum(entry.commission_amount), 0), 2),
    min(entry.cost_center_id)
  into
    v_selected_count,
    v_gross,
    v_cost_center_id
  from public.commission_entries entry
  where entry.id = any(p_commission_ids)
    and entry.tenant_id = p_tenant_id
    and entry.professional_id = p_professional_id
    and entry.status in ('pending', 'scheduled')
    and entry.competence_date between p_period_start and p_period_end;

  if v_selected_count <> v_expected_count then
    raise exception 'Uma ou mais comissões já foram pagas, canceladas ou não pertencem ao período.' using errcode = 'P0001';
  end if;

  select
    round(coalesce(sum(case when adjustment.nature = 'credit' then adjustment.amount else 0 end), 0), 2),
    round(coalesce(sum(case when adjustment.nature = 'debit' then adjustment.amount else 0 end), 0), 2)
  into v_credits, v_debits
  from jsonb_to_recordset(coalesce(p_adjustments, '[]'::jsonb))
    as adjustment(
      adjustment_type text,
      nature text,
      amount numeric,
      description text,
      notes text
    );

  v_net := round(v_gross + v_credits - v_debits, 2);
  if v_net < 0 then
    raise exception 'Os descontos não podem deixar a prestação com valor negativo.' using errcode = '22003';
  end if;

  if p_payment_method is null or trim(p_payment_method) = '' then
    raise exception 'Informe a forma de pagamento.' using errcode = '22000';
  end if;

  if p_account_id is null then
    raise exception 'Informe a conta financeira utilizada.' using errcode = '22000';
  end if;

  if not exists (
    select 1
    from public.financial_accounts account
    where account.id = p_account_id
      and account.tenant_id = p_tenant_id
      and account.active
  ) then
    raise exception 'Conta financeira inválida.' using errcode = '22000';
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
    p_payment_method,
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
    entry.id,
    entry.commission_amount
  from public.commission_entries entry
  where entry.id = any(p_commission_ids);

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
    adjustment.description,
    nullif(trim(adjustment.notes), ''),
    v_now
  from jsonb_to_recordset(coalesce(p_adjustments, '[]'::jsonb))
    as adjustment(
      adjustment_type text,
      nature text,
      amount numeric,
      description text,
      notes text
    )
  where adjustment.amount > 0;

  update public.commission_entries
  set
    status = 'paid',
    settlement_id = v_settlement_id,
    paid_at = v_now,
    updated_at = v_now
  where id = any(p_commission_ids)
    and status in ('pending', 'scheduled');

  update public.commanda_items item
  set commission_status = 'paid'
  from public.commission_entries entry
  where entry.id = any(p_commission_ids)
    and item.id = entry.commanda_item_id;

  update public.cash_movements movement
  set
    status = 'paid',
    paid_at = v_now,
    movement_date = coalesce(p_payment_date, current_date),
    payment_method = p_payment_method,
    account_id = p_account_id,
    settlement_id = v_settlement_id,
    updated_at = v_now
  from public.commission_entries entry
  where entry.id = any(p_commission_ids)
    and movement.id = entry.payable_movement_id
    and movement.status in ('pending', 'scheduled');

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
      'Pagamento de prestação de contas do profissional',
      'Comissões',
      v_category_id,
      p_account_id,
      coalesce(p_payment_date, current_date),
      p_period_end,
      coalesce(p_payment_date, current_date),
      v_now,
      'paid',
      p_payment_method,
      'commission_settlement',
      'commission_settlement',
      v_settlement_id,
      p_professional_id,
      v_settlement_id,
      v_cost_center_id,
      true,
      false,
      'Prestação de contas',
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
    'settlement_paid',
    jsonb_build_object(
      'professional_id', p_professional_id,
      'gross_amount', v_gross,
      'credit_amount', v_credits,
      'debit_amount', v_debits,
      'net_amount', v_net,
      'payment_method', p_payment_method,
      'payment_date', coalesce(p_payment_date, current_date)
    ),
    coalesce(nullif(trim(p_notes), ''), 'Prestação de contas confirmada'),
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
  if not private.is_tenant_member((select auth.uid()), p_tenant_id) then
    raise exception 'Acesso negado para esta empresa.' using errcode = '42501';
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

  perform entry.id
  from public.commission_entries entry
  where entry.settlement_id = p_settlement_id
  order by entry.id
  for update;

  update public.commission_settlements
  set
    status = 'reversed',
    reversed_at = v_now,
    reversal_reason = trim(p_reason),
    updated_at = v_now
  where id = p_settlement_id;

  update public.cash_movements
  set
    status = 'canceled',
    notes = concat_ws(' | ', notes, 'Estorno: ' || trim(p_reason)),
    updated_at = v_now
  where id = v_settlement.cash_movement_id;

  update public.cash_movements movement
  set
    status = 'pending',
    paid_at = null,
    settlement_id = null,
    updated_at = v_now
  from public.commission_entries entry
  where entry.settlement_id = p_settlement_id
    and movement.id = entry.payable_movement_id;

  update public.commanda_items item
  set commission_status = 'pending'
  from public.commission_entries entry
  where entry.settlement_id = p_settlement_id
    and item.id = entry.commanda_item_id;

  update public.commission_entries
  set
    status = 'pending',
    settlement_id = null,
    paid_at = null,
    updated_at = v_now
  where settlement_id = p_settlement_id;

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

create or replace function public.audit_commission_rule_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.financial_audit_log (
      tenant_id,
      entity_type,
      entity_id,
      action,
      old_data,
      reason,
      source_entity_type,
      source_entity_id
    )
    values (
      old.tenant_id,
      'commission_rule',
      old.id,
      'rule_deleted',
      to_jsonb(old),
      old.change_reason,
      case
        when old.rule_scope = 'professional' then 'professional'
        when old.item_kind = 'service' then 'service'
        else 'product'
      end,
      coalesce(old.professional_id, old.reference_id)
    );
    return old;
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
    new.tenant_id,
    'commission_rule',
    new.id,
    case when tg_op = 'INSERT' then 'rule_created' else 'rule_updated' end,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    new.change_reason,
    case
      when new.rule_scope = 'professional' then 'professional'
      when new.item_kind = 'service' then 'service'
      else 'product'
    end,
    coalesce(new.professional_id, new.reference_id)
  );

  return new;
end;
$$;

drop trigger if exists commission_rules_audit on public.commission_rules;
create trigger commission_rules_audit
after insert or update or delete on public.commission_rules
for each row execute function public.audit_commission_rule_change();

grant select, insert, update, delete on public.cost_centers to authenticated;
grant all on public.cost_centers to service_role;
grant select, insert, update, delete on public.commission_rules to authenticated;
grant all on public.commission_rules to service_role;
grant select, insert, update, delete on public.commission_entries to authenticated;
grant all on public.commission_entries to service_role;
grant select, insert, update, delete on public.commission_settlements to authenticated;
grant all on public.commission_settlements to service_role;
grant select, insert, update, delete on public.commission_settlement_items to authenticated;
grant all on public.commission_settlement_items to service_role;
grant select, insert, update, delete on public.commission_adjustments to authenticated;
grant all on public.commission_adjustments to service_role;
grant select, insert on public.financial_audit_log to authenticated;
grant all on public.financial_audit_log to service_role;

revoke all on public.cost_centers from anon;
revoke all on public.commission_rules from anon;
revoke all on public.commission_entries from anon;
revoke all on public.commission_settlements from anon;
revoke all on public.commission_settlement_items from anon;
revoke all on public.commission_adjustments from anon;
revoke all on public.financial_audit_log from anon;

alter table public.cost_centers enable row level security;
alter table public.commission_rules enable row level security;
alter table public.commission_entries enable row level security;
alter table public.commission_settlements enable row level security;
alter table public.commission_settlement_items enable row level security;
alter table public.commission_adjustments enable row level security;
alter table public.financial_audit_log enable row level security;

drop policy if exists "tenant members manage cost centers" on public.cost_centers;
create policy "tenant members manage cost centers"
on public.cost_centers for all to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id))
with check (private.is_tenant_member((select auth.uid()), tenant_id));

drop policy if exists "tenant members manage commission rules" on public.commission_rules;
create policy "tenant members manage commission rules"
on public.commission_rules for all to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id))
with check (private.is_tenant_member((select auth.uid()), tenant_id));

drop policy if exists "tenant members manage commission entries" on public.commission_entries;
create policy "tenant members manage commission entries"
on public.commission_entries for all to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id))
with check (private.is_tenant_member((select auth.uid()), tenant_id));

drop policy if exists "tenant members manage commission settlements" on public.commission_settlements;
create policy "tenant members manage commission settlements"
on public.commission_settlements for all to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id))
with check (private.is_tenant_member((select auth.uid()), tenant_id));

drop policy if exists "tenant members manage commission settlement items" on public.commission_settlement_items;
create policy "tenant members manage commission settlement items"
on public.commission_settlement_items for all to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id))
with check (private.is_tenant_member((select auth.uid()), tenant_id));

drop policy if exists "tenant members manage commission adjustments" on public.commission_adjustments;
create policy "tenant members manage commission adjustments"
on public.commission_adjustments for all to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id))
with check (private.is_tenant_member((select auth.uid()), tenant_id));

drop policy if exists "tenant members read financial audit" on public.financial_audit_log;
create policy "tenant members read financial audit"
on public.financial_audit_log for select to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id));

drop policy if exists "tenant members append financial audit" on public.financial_audit_log;
create policy "tenant members append financial audit"
on public.financial_audit_log for insert to authenticated
with check (private.is_tenant_member((select auth.uid()), tenant_id));

revoke all on function public.seed_tenant_commission_defaults() from public, anon, authenticated;
grant execute on function public.seed_tenant_commission_defaults() to service_role;
revoke all on function public.resolve_commission_rule(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.resolve_commission_rule(uuid, uuid, text, uuid) to authenticated, service_role;
revoke all on function public.generate_commissions_for_commanda(uuid, uuid) from public, anon;
grant execute on function public.generate_commissions_for_commanda(uuid, uuid) to authenticated, service_role;
revoke all on function public.generate_commissions_after_commanda_close() from public, anon;
grant execute on function public.generate_commissions_after_commanda_close() to authenticated, service_role;
revoke all on function public.settle_commissions(uuid, uuid, date, date, uuid[], jsonb, uuid, text, date, text, text) from public, anon;
grant execute on function public.settle_commissions(uuid, uuid, date, date, uuid[], jsonb, uuid, text, date, text, text) to authenticated, service_role;
revoke all on function public.reverse_commission_settlement(uuid, uuid, text) from public, anon;
grant execute on function public.reverse_commission_settlement(uuid, uuid, text) to authenticated, service_role;
revoke all on function public.audit_commission_rule_change() from public, anon;
grant execute on function public.audit_commission_rule_change() to authenticated, service_role;

-- Migração do histórico já fechado. Itens pagos continuam pagos e não geram
-- nova saída de caixa; itens pendentes passam a integrar Contas a Pagar.
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

commit;
