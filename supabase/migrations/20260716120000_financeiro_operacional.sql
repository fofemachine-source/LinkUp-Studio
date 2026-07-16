-- Financeiro operacional do salão.
-- Evolui o fluxo de caixa existente de forma aditiva para preservar integrações e histórico.

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  account_type text not null default 'cash'
    check (account_type in ('cash', 'bank', 'card', 'wallet')),
  opening_balance numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists financial_accounts_tenant_name_uidx
  on public.financial_accounts (tenant_id, lower(name));
create index if not exists financial_accounts_tenant_active_idx
  on public.financial_accounts (tenant_id, active);

create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  movement_kind text not null check (movement_kind in ('in', 'out')),
  dre_group text not null
    check (dre_group in ('revenue', 'deduction', 'variable_cost', 'fixed_expense', 'financial_result', 'non_operating')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists financial_categories_tenant_name_uidx
  on public.financial_categories (tenant_id, lower(name));
create index if not exists financial_categories_tenant_kind_active_idx
  on public.financial_categories (tenant_id, movement_kind, active);

alter table public.cash_movements
  add column if not exists account_id uuid references public.financial_accounts(id) on delete set null,
  add column if not exists category_id uuid references public.financial_categories(id) on delete set null,
  add column if not exists movement_date date,
  add column if not exists competence_date date,
  add column if not exists due_date date,
  add column if not exists paid_at timestamptz,
  add column if not exists status text not null default 'paid',
  add column if not exists payment_method text,
  add column if not exists source text not null default 'manual',
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.cash_movements
  drop constraint if exists cash_movements_status_check;
alter table public.cash_movements
  add constraint cash_movements_status_check
  check (status in ('pending', 'paid', 'canceled')) not valid;
alter table public.cash_movements validate constraint cash_movements_status_check;

update public.cash_movements
set
  movement_date = coalesce(movement_date, created_at::date),
  competence_date = coalesce(competence_date, created_at::date),
  due_date = coalesce(due_date, created_at::date),
  paid_at = case when status = 'paid' then coalesce(paid_at, created_at) else paid_at end,
  source = case
    when description like 'Comanda #%'
      or description like 'Agendamento #%'
      then 'comanda'
    else coalesce(nullif(source, ''), 'legacy')
  end
where movement_date is null
   or competence_date is null
   or due_date is null
   or (status = 'paid' and paid_at is null)
   or source = 'manual';

alter table public.cash_movements
  alter column movement_date set default current_date,
  alter column movement_date set not null,
  alter column competence_date set default current_date,
  alter column competence_date set not null;

create index if not exists cash_movements_tenant_competence_idx
  on public.cash_movements (tenant_id, competence_date desc);
create index if not exists cash_movements_tenant_movement_idx
  on public.cash_movements (tenant_id, movement_date desc);
create index if not exists cash_movements_tenant_account_paid_idx
  on public.cash_movements (tenant_id, account_id, movement_date)
  where status = 'paid';
create index if not exists cash_movements_tenant_pending_due_idx
  on public.cash_movements (tenant_id, due_date)
  where status = 'pending';
create index if not exists cash_movements_category_idx
  on public.cash_movements (category_id)
  where category_id is not null;

alter table public.commandas
  add column if not exists addition numeric(14,2) not null default 0;

alter table public.products
  add column if not exists cost_price numeric(14,2) not null default 0;

alter table public.commanda_items
  add column if not exists unit_cost numeric(14,2) not null default 0;

insert into public.financial_accounts (tenant_id, name, account_type)
select id, 'Caixa principal', 'cash'
from public.tenants
on conflict do nothing;

insert into public.financial_categories (tenant_id, name, movement_kind, dre_group)
select tenant.id, defaults.name, defaults.movement_kind, defaults.dre_group
from public.tenants tenant
cross join (
  values
    ('Vendas', 'in', 'revenue'),
    ('Assinaturas', 'in', 'revenue'),
    ('Outras receitas', 'in', 'revenue'),
    ('Impostos e taxas sobre vendas', 'out', 'deduction'),
    ('Comissões', 'out', 'variable_cost'),
    ('Insumos e materiais', 'out', 'variable_cost'),
    ('Aluguel', 'out', 'fixed_expense'),
    ('Folha e pró-labore', 'out', 'fixed_expense'),
    ('Marketing', 'out', 'fixed_expense'),
    ('Água, energia e internet', 'out', 'fixed_expense'),
    ('Manutenção', 'out', 'fixed_expense'),
    ('Tarifas e juros', 'out', 'financial_result'),
    ('Outras despesas', 'out', 'non_operating')
) as defaults(name, movement_kind, dre_group)
on conflict do nothing;

update public.cash_movements movement
set account_id = account.id
from public.financial_accounts account
where movement.account_id is null
  and account.tenant_id = movement.tenant_id
  and account.name = 'Caixa principal';

update public.cash_movements movement
set category_id = category.id
from public.financial_categories category
where movement.category_id is null
  and category.tenant_id = movement.tenant_id
  and category.name = case
    when movement.kind = 'in' and movement.source = 'comanda' then 'Vendas'
    when movement.kind = 'in' then 'Outras receitas'
    else 'Outras despesas'
  end;

create or replace function public.seed_tenant_financial_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.financial_accounts (tenant_id, name, account_type)
  values (new.id, 'Caixa principal', 'cash')
  on conflict do nothing;

  insert into public.financial_categories (tenant_id, name, movement_kind, dre_group)
  values
    (new.id, 'Vendas', 'in', 'revenue'),
    (new.id, 'Assinaturas', 'in', 'revenue'),
    (new.id, 'Outras receitas', 'in', 'revenue'),
    (new.id, 'Impostos e taxas sobre vendas', 'out', 'deduction'),
    (new.id, 'Comissões', 'out', 'variable_cost'),
    (new.id, 'Insumos e materiais', 'out', 'variable_cost'),
    (new.id, 'Aluguel', 'out', 'fixed_expense'),
    (new.id, 'Folha e pró-labore', 'out', 'fixed_expense'),
    (new.id, 'Marketing', 'out', 'fixed_expense'),
    (new.id, 'Água, energia e internet', 'out', 'fixed_expense'),
    (new.id, 'Manutenção', 'out', 'fixed_expense'),
    (new.id, 'Tarifas e juros', 'out', 'financial_result'),
    (new.id, 'Outras despesas', 'out', 'non_operating')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists tenants_seed_financial_defaults on public.tenants;
create trigger tenants_seed_financial_defaults
after insert on public.tenants
for each row execute function public.seed_tenant_financial_defaults();

create or replace function public.apply_cash_movement_financial_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.movement_date := coalesce(new.movement_date, new.created_at::date, current_date);
  new.competence_date := coalesce(new.competence_date, new.movement_date);
  new.due_date := coalesce(new.due_date, new.movement_date);
  new.paid_at := case
    when new.status = 'paid' then coalesce(new.paid_at, new.created_at, now())
    else null
  end;

  if new.account_id is null then
    select id into new.account_id
    from public.financial_accounts
    where tenant_id = new.tenant_id and active
    order by (name = 'Caixa principal') desc, created_at
    limit 1;
  end if;

  if new.category_id is null then
    select id into new.category_id
    from public.financial_categories
    where tenant_id = new.tenant_id
      and name = case
        when new.kind = 'in' and new.source = 'comanda' then 'Vendas'
        when new.kind = 'in' then 'Outras receitas'
        else 'Outras despesas'
      end
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists cash_movements_financial_defaults on public.cash_movements;
create trigger cash_movements_financial_defaults
before insert or update on public.cash_movements
for each row execute function public.apply_cash_movement_financial_defaults();

grant select, insert, update, delete on public.financial_accounts to authenticated;
grant all on public.financial_accounts to service_role;
grant select, insert, update, delete on public.financial_categories to authenticated;
grant all on public.financial_categories to service_role;
revoke all on public.financial_accounts from anon;
revoke all on public.financial_categories from anon;

alter table public.financial_accounts enable row level security;
alter table public.financial_categories enable row level security;

drop policy if exists "tenant members manage financial accounts" on public.financial_accounts;
create policy "tenant members manage financial accounts"
on public.financial_accounts for all to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id))
with check (private.is_tenant_member((select auth.uid()), tenant_id));

drop policy if exists "tenant members manage financial categories" on public.financial_categories;
create policy "tenant members manage financial categories"
on public.financial_categories for all to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id))
with check (private.is_tenant_member((select auth.uid()), tenant_id));

revoke all on function public.seed_tenant_financial_defaults() from public;
grant execute on function public.seed_tenant_financial_defaults() to service_role;
revoke all on function public.apply_cash_movement_financial_defaults() from public;
grant execute on function public.apply_cash_movement_financial_defaults() to service_role;
