begin;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  category text,
  image_url text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  model text not null default 'recurring'
    check (model in ('recurring', 'session_package', 'fixed_period')),
  session_limit integer check (session_limit is null or session_limit > 0),
  max_per_month integer check (max_per_month is null or max_per_month > 0),
  max_per_week integer check (max_per_week is null or max_per_week > 0),
  max_per_day integer check (max_per_day is null or max_per_day > 0),
  allow_multiple_same_day boolean not null default false,
  allow_reschedule boolean not null default true,
  allow_cancellation boolean not null default true,
  allow_rollover boolean not null default false,
  sessions_expire boolean not null default true,
  session_validity_days integer check (
    session_validity_days is null or session_validity_days > 0
  ),
  duration_days integer check (duration_days is null or duration_days > 0),
  price numeric(14,2) not null default 0 check (price >= 0),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('weekly', 'biweekly', 'monthly', 'yearly', 'one_time')),
  discount_allowed boolean not null default false,
  discount_value numeric(14,2) not null default 0 check (discount_value >= 0),
  coupon_allowed boolean not null default false,
  enrollment_fee_allowed boolean not null default false,
  enrollment_fee numeric(14,2) not null default 0 check (enrollment_fee >= 0),
  booking_show_name boolean not null default true,
  booking_show_benefits boolean not null default true,
  booking_show_remaining boolean not null default true,
  booking_show_validity boolean not null default true,
  booking_show_discount boolean not null default true,
  included_services_only boolean not null default true,
  allow_extras boolean not null default true,
  financial_category_id uuid references public.financial_categories(id) on delete set null,
  cost_center text,
  financial_account_id uuid references public.financial_accounts(id) on delete set null,
  billing_mode text not null default 'recurring'
    check (billing_mode in ('recurring', 'manual')),
  pix_enabled boolean not null default true,
  asaas_enabled boolean not null default false,
  automatic_settlement boolean not null default false,
  automatic_renewal boolean not null default false,
  automatic_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscription_plans_tenant_name_uidx
  on public.subscription_plans (tenant_id, lower(name));
create index if not exists subscription_plans_tenant_status_idx
  on public.subscription_plans (tenant_id, status);

create table if not exists public.subscription_plan_benefits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  benefit_type text not null default 'service'
    check (benefit_type in (
      'service', 'product', 'discount_service', 'discount_product',
      'priority', 'gift', 'custom'
    )),
  service_id uuid references public.services(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  description text,
  quantity integer check (quantity is null or quantity > 0),
  discount_pct numeric(7,4) check (
    discount_pct is null or (discount_pct >= 0 and discount_pct <= 100)
  ),
  rules jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (benefit_type = 'service' and service_id is not null)
    or (benefit_type = 'product' and product_id is not null)
    or benefit_type not in ('service', 'product')
  )
);

create index if not exists subscription_benefits_plan_idx
  on public.subscription_plan_benefits (plan_id, active);
create index if not exists subscription_benefits_service_idx
  on public.subscription_plan_benefits (tenant_id, service_id)
  where service_id is not null and active;

create table if not exists public.client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,
  legacy_subscriber_id uuid unique references public.subscribers(id) on delete set null,
  subscriber_name text not null,
  cpf text,
  whatsapp text,
  status text not null default 'active'
    check (status in ('active', 'overdue', 'suspended', 'canceled', 'expired')),
  starts_at date not null default current_date,
  ends_at date,
  next_due_at date,
  price numeric(14,2) not null default 0 check (price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  enrollment_fee numeric(14,2) not null default 0 check (enrollment_fee >= 0),
  sessions_total integer check (sessions_total is null or sessions_total >= 0),
  sessions_used integer not null default 0 check (sessions_used >= 0),
  sessions_remaining integer check (sessions_remaining is null or sessions_remaining >= 0),
  auto_renew boolean not null default false,
  notes text,
  suspended_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  check (
    sessions_total is null
    or sessions_remaining is null
    or sessions_used + sessions_remaining <= sessions_total
  )
);

create index if not exists client_subscriptions_tenant_status_idx
  on public.client_subscriptions (tenant_id, status, next_due_at);
create index if not exists client_subscriptions_client_idx
  on public.client_subscriptions (client_id, status);
create index if not exists client_subscriptions_client_plan_idx
  on public.client_subscriptions (tenant_id, client_id, plan_id, status)
  where client_id is not null;

create table if not exists public.subscription_usages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.client_subscriptions(id) on delete cascade,
  benefit_id uuid references public.subscription_plan_benefits(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  commanda_id uuid references public.commandas(id) on delete set null,
  commanda_item_id uuid references public.commanda_items(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  used_at timestamptz not null default now(),
  quantity integer not null default 1 check (quantity > 0),
  remaining_after integer,
  notes text,
  source text not null default 'manual'
    check (source in ('manual', 'booking', 'checkout', 'adjustment')),
  created_at timestamptz not null default now()
);

create unique index if not exists subscription_usages_commanda_item_uidx
  on public.subscription_usages (subscription_id, commanda_item_id)
  where commanda_item_id is not null;
create index if not exists subscription_usages_tenant_date_idx
  on public.subscription_usages (tenant_id, used_at desc);
create index if not exists subscription_usages_subscription_idx
  on public.subscription_usages (subscription_id, used_at desc);

create table if not exists public.subscription_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.client_subscriptions(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  cash_movement_id uuid references public.cash_movements(id) on delete set null,
  amount numeric(14,2) not null check (amount >= 0),
  due_date date not null,
  paid_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'overdue', 'canceled', 'refunded')),
  billing_period_start date,
  billing_period_end date,
  payment_method text,
  external_provider text,
  external_reference text,
  description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (billing_period_end is null or billing_period_start is null or billing_period_end >= billing_period_start),
  check ((status = 'paid' and paid_at is not null) or status <> 'paid')
);

create index if not exists subscription_charges_tenant_due_idx
  on public.subscription_charges (tenant_id, status, due_date);
create index if not exists subscription_charges_subscription_idx
  on public.subscription_charges (subscription_id, due_date desc);
create unique index if not exists cash_movements_subscription_charge_uidx
  on public.cash_movements (reference_id)
  where reference_type = 'subscription_charge' and reference_id is not null;

create table if not exists public.subscription_module_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  grace_days integer not null default 0 check (grace_days >= 0),
  default_validity_days integer not null default 30 check (default_validity_days > 0),
  default_allow_reschedule boolean not null default true,
  default_allow_cancellation boolean not null default true,
  default_allow_rollover boolean not null default false,
  whatsapp_enabled boolean not null default true,
  asaas_enabled boolean not null default false,
  renewal_rule text,
  cancellation_policy text,
  usage_policy text,
  billing_message text not null default
    'Olá, {cliente}! Sua assinatura {plano} vence em {vencimento}. Valor: {valor}.',
  payment_confirmation_message text not null default
    'Pagamento confirmado! Sua assinatura {plano} está ativa até {validade}.',
  overdue_message text not null default
    'Olá, {cliente}. Identificamos uma pendência na assinatura {plano}.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.set_subscription_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscription_plans_updated_at on public.subscription_plans;
create trigger subscription_plans_updated_at
before update on public.subscription_plans
for each row execute function private.set_subscription_updated_at();

drop trigger if exists subscription_benefits_updated_at on public.subscription_plan_benefits;
create trigger subscription_benefits_updated_at
before update on public.subscription_plan_benefits
for each row execute function private.set_subscription_updated_at();

drop trigger if exists client_subscriptions_updated_at on public.client_subscriptions;
create trigger client_subscriptions_updated_at
before update on public.client_subscriptions
for each row execute function private.set_subscription_updated_at();

drop trigger if exists subscription_charges_updated_at on public.subscription_charges;
create trigger subscription_charges_updated_at
before update on public.subscription_charges
for each row execute function private.set_subscription_updated_at();

drop trigger if exists subscription_settings_updated_at on public.subscription_module_settings;
create trigger subscription_settings_updated_at
before update on public.subscription_module_settings
for each row execute function private.set_subscription_updated_at();

create or replace function private.sync_subscription_charge_cash_movement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_subscription public.client_subscriptions%rowtype;
  v_movement_id uuid;
  v_status text;
  v_account_id uuid;
  v_category_id uuid;
begin
  select * into v_subscription
  from public.client_subscriptions
  where id = new.subscription_id and tenant_id = new.tenant_id;

  select * into v_plan
  from public.subscription_plans
  where id = v_subscription.plan_id and tenant_id = new.tenant_id;

  v_account_id := v_plan.financial_account_id;
  if v_account_id is null then
    select id into v_account_id
    from public.financial_accounts
    where tenant_id = new.tenant_id and active
    order by (name = 'Caixa principal') desc, created_at
    limit 1;
  end if;

  v_category_id := v_plan.financial_category_id;
  if v_category_id is null then
    select id into v_category_id
    from public.financial_categories
    where tenant_id = new.tenant_id
      and movement_kind = 'in'
      and active
    order by (name = 'Assinaturas') desc, created_at
    limit 1;
  end if;

  v_status := case
    when new.status = 'paid' then 'paid'
    when new.status in ('canceled', 'refunded') then 'canceled'
    else 'pending'
  end;

  insert into public.cash_movements (
    tenant_id,
    kind,
    amount,
    description,
    category,
    account_id,
    category_id,
    payment_method,
    source,
    reference_type,
    reference_id,
    movement_date,
    competence_date,
    due_date,
    paid_at,
    status,
    notes
  )
  values (
    new.tenant_id,
    'in',
    new.amount,
    coalesce(new.description, 'Assinatura · ' || v_subscription.subscriber_name || ' · ' || v_plan.name),
    'Assinaturas',
    v_account_id,
    v_category_id,
    new.payment_method,
    'subscription',
    'subscription_charge',
    new.id,
    case when new.status = 'paid' then coalesce(new.paid_at, now())::date else new.due_date end,
    coalesce(new.billing_period_start, new.due_date),
    new.due_date,
    case when new.status = 'paid' then coalesce(new.paid_at, now()) else null end,
    v_status,
    new.notes
  )
  on conflict (reference_id) where (
    reference_type = 'subscription_charge' and reference_id is not null
  )
  do update set
    amount = excluded.amount,
    description = excluded.description,
    account_id = excluded.account_id,
    category_id = excluded.category_id,
    payment_method = excluded.payment_method,
    movement_date = excluded.movement_date,
    competence_date = excluded.competence_date,
    due_date = excluded.due_date,
    paid_at = excluded.paid_at,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now()
  returning id into v_movement_id;

  new.cash_movement_id := v_movement_id;
  return new;
end;
$$;

drop trigger if exists subscription_charge_cash_sync on public.subscription_charges;
create trigger subscription_charge_cash_sync
before insert or update of amount, due_date, paid_at, status, payment_method, description, notes
on public.subscription_charges
for each row execute function private.sync_subscription_charge_cash_movement();

create or replace function private.renew_subscription_after_payment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.client_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_next_due date;
begin
  if new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;

  select * into v_subscription
  from public.client_subscriptions
  where id = new.subscription_id
    and tenant_id = new.tenant_id
  for update;

  select * into v_plan
  from public.subscription_plans
  where id = v_subscription.plan_id
    and tenant_id = new.tenant_id;

  update public.client_subscriptions
  set
    status = 'active',
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
  where id = v_subscription.id;

  if not (v_subscription.auto_renew and v_plan.automatic_renewal)
     or v_plan.billing_cycle = 'one_time' then
    return new;
  end if;

  v_next_due := case v_plan.billing_cycle
    when 'weekly' then new.due_date + 7
    when 'biweekly' then new.due_date + 15
    when 'monthly' then (new.due_date + interval '1 month')::date
    when 'yearly' then (new.due_date + interval '1 year')::date
    else null
  end;

  if v_next_due is null then
    return new;
  end if;

  update public.client_subscriptions
  set next_due_at = v_next_due
  where id = v_subscription.id;

  if not exists (
    select 1
    from public.subscription_charges
    where subscription_id = v_subscription.id
      and due_date = v_next_due
      and status <> 'canceled'
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
      'pending',
      new.due_date,
      v_next_due - 1,
      'Renovação · ' || v_plan.name
    );
  end if;

  return new;
end;
$$;

drop trigger if exists subscription_charge_renewal on public.subscription_charges;
create trigger subscription_charge_renewal
after update of status on public.subscription_charges
for each row execute function private.renew_subscription_after_payment();

create or replace function public.register_subscription_usage(
  p_subscription_id uuid,
  p_benefit_id uuid default null,
  p_commanda_id uuid default null,
  p_commanda_item_id uuid default null,
  p_appointment_id uuid default null,
  p_service_id uuid default null,
  p_professional_id uuid default null,
  p_quantity integer default 1,
  p_notes text default null,
  p_source text default 'manual',
  p_used_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.client_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_benefit public.subscription_plan_benefits%rowtype;
  v_reference_at timestamptz := coalesce(p_used_at, now());
  v_today date := coalesce(p_used_at, now())::date;
  v_day_count integer;
  v_week_count integer;
  v_month_count integer;
  v_remaining integer;
  v_usage_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'A quantidade utilizada deve ser maior que zero.' using errcode = '22003';
  end if;

  select * into v_subscription
  from public.client_subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Assinatura não encontrada ou acesso negado.' using errcode = 'P0002';
  end if;

  if v_subscription.status <> 'active' then
    raise exception 'A assinatura não está ativa.' using errcode = 'P0001';
  end if;

  if v_subscription.starts_at > v_today
     or (v_subscription.ends_at is not null and v_subscription.ends_at < v_today) then
    raise exception 'A assinatura está fora do período de validade.' using errcode = 'P0001';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = v_subscription.plan_id
    and tenant_id = v_subscription.tenant_id;

  if p_benefit_id is not null then
    select * into v_benefit
    from public.subscription_plan_benefits
    where id = p_benefit_id
      and plan_id = v_subscription.plan_id
      and tenant_id = v_subscription.tenant_id
      and active;
    if not found then
      raise exception 'Benefício inválido para esta assinatura.' using errcode = 'P0001';
    end if;
  elsif p_service_id is not null then
    select * into v_benefit
    from public.subscription_plan_benefits
    where plan_id = v_subscription.plan_id
      and tenant_id = v_subscription.tenant_id
      and service_id = p_service_id
      and benefit_type = 'service'
      and active
    order by created_at
    limit 1;
    if not found then
      raise exception 'O serviço não está incluído nesta assinatura.' using errcode = 'P0001';
    end if;
  end if;

  if v_subscription.sessions_remaining is not null
     and v_subscription.sessions_remaining < p_quantity then
    raise exception 'Saldo insuficiente na assinatura.' using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity), 0)::integer into v_day_count
  from public.subscription_usages
  where subscription_id = p_subscription_id
    and used_at >= date_trunc('day', v_reference_at)
    and used_at < date_trunc('day', v_reference_at) + interval '1 day';

  select coalesce(sum(quantity), 0)::integer into v_week_count
  from public.subscription_usages
  where subscription_id = p_subscription_id
    and used_at >= date_trunc('week', v_reference_at)
    and used_at < date_trunc('week', v_reference_at) + interval '1 week';

  select coalesce(sum(quantity), 0)::integer into v_month_count
  from public.subscription_usages
  where subscription_id = p_subscription_id
    and used_at >= date_trunc('month', v_reference_at)
    and used_at < date_trunc('month', v_reference_at) + interval '1 month';

  if not v_plan.allow_multiple_same_day and v_day_count > 0 then
    raise exception 'Este plano não permite mais de uma utilização no mesmo dia.' using errcode = 'P0001';
  end if;
  if v_plan.max_per_day is not null and v_day_count + p_quantity > v_plan.max_per_day then
    raise exception 'Limite diário de utilizações atingido.' using errcode = 'P0001';
  end if;
  if v_plan.max_per_week is not null and v_week_count + p_quantity > v_plan.max_per_week then
    raise exception 'Limite semanal de utilizações atingido.' using errcode = 'P0001';
  end if;
  if v_plan.max_per_month is not null and v_month_count + p_quantity > v_plan.max_per_month then
    raise exception 'Limite mensal de utilizações atingido.' using errcode = 'P0001';
  end if;

  v_remaining := case
    when v_subscription.sessions_remaining is null then null
    else greatest(0, v_subscription.sessions_remaining - p_quantity)
  end;

  insert into public.subscription_usages (
    tenant_id,
    subscription_id,
    benefit_id,
    client_id,
    commanda_id,
    commanda_item_id,
    appointment_id,
    service_id,
    professional_id,
    used_at,
    quantity,
    remaining_after,
    notes,
    source
  )
  values (
    v_subscription.tenant_id,
    v_subscription.id,
    coalesce(p_benefit_id, v_benefit.id),
    v_subscription.client_id,
    p_commanda_id,
    p_commanda_item_id,
    p_appointment_id,
    p_service_id,
    p_professional_id,
    v_reference_at,
    p_quantity,
    v_remaining,
    nullif(trim(p_notes), ''),
    p_source
  )
  returning id into v_usage_id;

  update public.client_subscriptions
  set
    sessions_used = sessions_used + p_quantity,
    sessions_remaining = v_remaining
  where id = v_subscription.id;

  return jsonb_build_object(
    'id', v_usage_id,
    'subscription_id', v_subscription.id,
    'quantity', p_quantity,
    'remaining_after', v_remaining
  );
end;
$$;

create or replace function public.finalize_commanda_with_subscription(
  p_commanda_id uuid,
  p_tenant_id uuid,
  p_subscription_id uuid,
  p_subtotal numeric,
  p_discount numeric,
  p_addition numeric,
  p_total numeric,
  p_notes text,
  p_amount_received numeric,
  p_change_amount numeric,
  p_payments jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.client_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_commanda public.commandas%rowtype;
  v_item record;
  v_benefit_id uuid;
  v_extra_subtotal numeric := 0;
  v_covered_items integer := 0;
  v_result jsonb;
begin
  select * into v_subscription
  from public.client_subscriptions
  where id = p_subscription_id
    and tenant_id = p_tenant_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Assinatura ativa não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = v_subscription.plan_id
    and tenant_id = p_tenant_id;

  if not found then
    raise exception 'Plano da assinatura não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_commanda
  from public.commandas
  where id = p_commanda_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Comanda não encontrada.' using errcode = 'P0002';
  end if;

  if v_subscription.client_id is not null
     and v_commanda.client_id is distinct from v_subscription.client_id then
    raise exception 'A assinatura não pertence ao cliente da comanda.' using errcode = 'P0001';
  end if;

  for v_item in
    select item.*
    from public.commanda_items item
    where item.commanda_id = p_commanda_id
      and item.tenant_id = p_tenant_id
      and item.kind = 'service'
  loop
    v_benefit_id := null;
    select benefit.id into v_benefit_id
    from public.subscription_plan_benefits benefit
    where benefit.plan_id = v_subscription.plan_id
      and benefit.tenant_id = p_tenant_id
      and benefit.service_id = v_item.ref_id
      and benefit.benefit_type = 'service'
      and benefit.active
    order by benefit.created_at
    limit 1;

    if v_benefit_id is null then
      if not v_plan.allow_extras then
        raise exception 'A comanda possui serviço não coberto e este plano não permite extras.'
          using errcode = 'P0001';
      end if;
      v_extra_subtotal := v_extra_subtotal
        + round(coalesce(v_item.unit_price, 0) * greatest(1, coalesce(v_item.quantity, 1)), 2);
    else
      v_covered_items := v_covered_items + 1;
    end if;
  end loop;

  if not v_plan.allow_extras and exists (
      select 1
      from public.commanda_items item
      where item.commanda_id = p_commanda_id
        and item.tenant_id = p_tenant_id
        and item.kind <> 'service'
    ) then
    raise exception 'Este plano não permite produtos ou outros itens extras.'
      using errcode = 'P0001';
  end if;

  select v_extra_subtotal + coalesce(sum(
    round(coalesce(item.unit_price, 0) * greatest(1, coalesce(item.quantity, 1)), 2)
  ), 0)
  into v_extra_subtotal
  from public.commanda_items item
  where item.commanda_id = p_commanda_id
    and item.tenant_id = p_tenant_id
    and item.kind <> 'service';

  if v_covered_items = 0 then
    raise exception 'Nenhum serviço desta comanda está coberto pela assinatura.'
      using errcode = 'P0001';
  end if;

  if abs(round(v_extra_subtotal, 2) - round(p_subtotal, 2)) > 0.009 then
    raise exception 'O subtotal excedente não confere com os itens fora da assinatura.'
      using errcode = 'P0001';
  end if;

  v_result := public.finalize_commanda(
    p_commanda_id,
    p_tenant_id,
    p_subtotal,
    p_discount,
    p_addition,
    p_total,
    p_notes,
    p_amount_received,
    p_change_amount,
    p_payments
  );

  for v_item in
    select item.*
    from public.commanda_items item
    where item.commanda_id = p_commanda_id
      and item.tenant_id = p_tenant_id
      and item.kind = 'service'
  loop
    v_benefit_id := null;
    select benefit.id into v_benefit_id
    from public.subscription_plan_benefits benefit
    where benefit.plan_id = v_subscription.plan_id
      and benefit.tenant_id = p_tenant_id
      and benefit.service_id = v_item.ref_id
      and benefit.benefit_type = 'service'
      and benefit.active
    order by benefit.created_at
    limit 1;

    if v_benefit_id is not null then
      perform public.register_subscription_usage(
        p_subscription_id,
        v_benefit_id,
        p_commanda_id,
        v_item.id,
        v_commanda.appointment_id,
        v_item.ref_id,
        v_item.professional_id,
        greatest(1, coalesce(v_item.quantity, 1)),
        'Consumo automático no fechamento da comanda',
        'checkout'
      );
    end if;
  end loop;

  return v_result || jsonb_build_object('subscription_id', p_subscription_id);
end;
$$;

grant select, insert, update, delete on public.subscription_plans to authenticated;
grant select, insert, update, delete on public.subscription_plan_benefits to authenticated;
grant select, insert, update, delete on public.client_subscriptions to authenticated;
grant select, insert, update, delete on public.subscription_usages to authenticated;
grant select, insert, update, delete on public.subscription_charges to authenticated;
grant select, insert, update, delete on public.subscription_module_settings to authenticated;

grant all on public.subscription_plans to service_role;
grant all on public.subscription_plan_benefits to service_role;
grant all on public.client_subscriptions to service_role;
grant all on public.subscription_usages to service_role;
grant all on public.subscription_charges to service_role;
grant all on public.subscription_module_settings to service_role;

revoke all on public.subscription_plans from anon;
revoke all on public.subscription_plan_benefits from anon;
revoke all on public.client_subscriptions from anon;
revoke all on public.subscription_usages from anon;
revoke all on public.subscription_charges from anon;
revoke all on public.subscription_module_settings from anon;

revoke execute on function public.register_subscription_usage(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, text, text, timestamptz
) from public, anon;
revoke execute on function public.finalize_commanda_with_subscription(
  uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, jsonb
) from public, anon;
grant execute on function public.register_subscription_usage(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, text, text, timestamptz
) to authenticated, service_role;
grant execute on function public.finalize_commanda_with_subscription(
  uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, jsonb
) to authenticated, service_role;

alter table public.subscription_plans enable row level security;
alter table public.subscription_plan_benefits enable row level security;
alter table public.client_subscriptions enable row level security;
alter table public.subscription_usages enable row level security;
alter table public.subscription_charges enable row level security;
alter table public.subscription_module_settings enable row level security;

drop policy if exists "tenant members manage subscription plans" on public.subscription_plans;
create policy "tenant members manage subscription plans"
on public.subscription_plans for all to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
)
with check (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);

drop policy if exists "tenant members manage subscription benefits" on public.subscription_plan_benefits;
create policy "tenant members manage subscription benefits"
on public.subscription_plan_benefits for all to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
)
with check (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);

drop policy if exists "tenant members manage client subscriptions" on public.client_subscriptions;
create policy "tenant members manage client subscriptions"
on public.client_subscriptions for all to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
)
with check (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);

drop policy if exists "tenant members manage subscription usages" on public.subscription_usages;
create policy "tenant members manage subscription usages"
on public.subscription_usages for all to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
)
with check (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);

drop policy if exists "tenant members manage subscription charges" on public.subscription_charges;
create policy "tenant members manage subscription charges"
on public.subscription_charges for all to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
)
with check (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);

drop policy if exists "tenant members manage subscription settings" on public.subscription_module_settings;
create policy "tenant members manage subscription settings"
on public.subscription_module_settings for all to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
)
with check (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);

insert into public.subscription_module_settings (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

do $$
declare
  v_sub public.subscribers%rowtype;
  v_plan_id uuid;
  v_contract_id uuid;
  v_plan_json jsonb;
  v_plan_name text;
  v_service_id_text text;
  v_sessions_used integer;
  v_status text;
begin
  for v_sub in
    select * from public.subscribers order by created_at
  loop
    v_plan_json := null;
    v_plan_name := coalesce(nullif(trim(v_sub.plan), ''), 'Plano legado');

    begin
      if left(trim(coalesce(v_sub.plan, '')), 1) in ('{', '[') then
        v_plan_json := v_sub.plan::jsonb;
        v_plan_name := coalesce(
          nullif(v_plan_json->>'name', ''),
          v_plan_name
        );
      end if;
    exception when others then
      v_plan_json := null;
    end;

    select id into v_plan_id
    from public.subscription_plans
    where tenant_id = v_sub.tenant_id
      and lower(name) = lower(v_plan_name)
    limit 1;

    if v_plan_id is null then
      insert into public.subscription_plans (
        tenant_id,
        name,
        description,
        category,
        model,
        session_limit,
        max_per_month,
        allow_multiple_same_day,
        price,
        billing_cycle,
        billing_mode,
        automatic_renewal
      )
      values (
        v_sub.tenant_id,
        v_plan_name,
        'Plano migrado automaticamente do módulo anterior.',
        'VIP',
        'recurring',
        4,
        4,
        false,
        coalesce(v_sub.price, 0),
        'monthly',
        'recurring',
        true
      )
      returning id into v_plan_id;
    end if;

    if v_plan_json is not null
       and jsonb_typeof(v_plan_json->'services') = 'array' then
      for v_service_id_text in
        select jsonb_array_elements_text(v_plan_json->'services')
      loop
        begin
          if exists (
            select 1 from public.services
            where id = v_service_id_text::uuid
              and tenant_id = v_sub.tenant_id
          ) and not exists (
            select 1
            from public.subscription_plan_benefits
            where plan_id = v_plan_id
              and service_id = v_service_id_text::uuid
              and active
          ) then
            insert into public.subscription_plan_benefits (
              tenant_id,
              plan_id,
              benefit_type,
              service_id,
              name
            )
            select
              v_sub.tenant_id,
              v_plan_id,
              'service',
              service.id,
              service.name
            from public.services service
            where service.id = v_service_id_text::uuid;
          end if;
        exception when invalid_text_representation then
          null;
        end;
      end loop;
    end if;

    select count(*)::integer into v_sessions_used
    from public.commandas
    where tenant_id = v_sub.tenant_id
      and status = 'closed'
      and payment_method = 'vip'
      and closed_at >= date_trunc('month', now())
      and (
        (v_sub.client_id is not null and client_id = v_sub.client_id)
        or (
          v_sub.client_id is null
          and lower(client_name) = lower(v_sub.full_name)
        )
      );

    v_status := case
      when v_sub.status = 'active'
        and (v_sub.next_due_at is null or v_sub.next_due_at >= current_date) then 'active'
      when v_sub.status = 'active' then 'overdue'
      else 'suspended'
    end;

    insert into public.client_subscriptions (
      tenant_id,
      plan_id,
      client_id,
      legacy_subscriber_id,
      subscriber_name,
      cpf,
      whatsapp,
      status,
      starts_at,
      next_due_at,
      price,
      sessions_total,
      sessions_used,
      sessions_remaining,
      auto_renew
    )
    values (
      v_sub.tenant_id,
      v_plan_id,
      v_sub.client_id,
      v_sub.id,
      v_sub.full_name,
      v_sub.cpf,
      v_sub.whatsapp,
      v_status,
      v_sub.created_at::date,
      v_sub.next_due_at,
      coalesce(v_sub.price, 0),
      4,
      least(4, coalesce(v_sessions_used, 0)),
      greatest(0, 4 - coalesce(v_sessions_used, 0)),
      true
    )
    on conflict (legacy_subscriber_id) do update set
      plan_id = excluded.plan_id,
      client_id = excluded.client_id,
      subscriber_name = excluded.subscriber_name,
      cpf = excluded.cpf,
      whatsapp = excluded.whatsapp,
      status = excluded.status,
      next_due_at = excluded.next_due_at,
      price = excluded.price
    returning id into v_contract_id;

    if v_sub.next_due_at is not null
       and coalesce(v_sub.price, 0) > 0
       and not exists (
         select 1 from public.subscription_charges
         where subscription_id = v_contract_id
           and due_date = v_sub.next_due_at
       ) then
      insert into public.subscription_charges (
        tenant_id,
        subscription_id,
        client_id,
        amount,
        due_date,
        status,
        description
      )
      values (
        v_sub.tenant_id,
        v_contract_id,
        v_sub.client_id,
        v_sub.price,
        v_sub.next_due_at,
        case when v_sub.next_due_at < current_date then 'overdue' else 'pending' end,
        'Mensalidade · ' || v_plan_name
      );
    end if;

    if v_sub.client_id is not null then
      update public.clients
      set is_subscriber = true
      where id = v_sub.client_id
        and tenant_id = v_sub.tenant_id;
    end if;
  end loop;
end;
$$;

commit;
