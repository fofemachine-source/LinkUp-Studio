begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Cobrança B2B da plataforma LinkUp Studio para os salões clientes.
-- Este domínio é deliberadamente separado das assinaturas VIP que cada salão
-- vende aos seus consumidores finais.

alter table public.tenants
  add column if not exists status_reason text,
  add column if not exists billing_blocked_at timestamptz;

comment on column public.tenants.status_reason is
  'Motivo controlado da situação. billing_overdue/billing_refund são os únicos motivos que a automação financeira pode remover.';

create table if not exists public.platform_billing_settings (
  id text primary key default 'global' check (id = 'global'),
  provider text not null default 'asaas' check (provider = 'asaas'),
  enabled boolean not null default false,
  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production')),
  default_billing_type text not null default 'UNDEFINED'
    check (default_billing_type in ('UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD')),
  issue_days_before integer not null default 7
    check (issue_days_before between 0 and 90),
  grace_days integer not null default 3
    check (grace_days between 0 and 90),
  auto_suspend boolean not null default false,
  fine_percentage numeric(7,4) not null default 0
    check (fine_percentage between 0 and 100),
  interest_percentage numeric(7,4) not null default 0
    check (interest_percentage between 0 and 100),
  discount_percentage numeric(7,4) not null default 0
    check (discount_percentage between 0 and 100),
  discount_due_days integer not null default 0
    check (discount_due_days between 0 and 90),
  notification_disabled boolean not null default true,
  webhook_id text,
  webhook_environment text
    check (webhook_environment in ('sandbox', 'production')),
  webhook_status text not null default 'not_configured'
    check (webhook_status in ('not_configured', 'active', 'interrupted', 'error')),
  webhook_last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.platform_billing_settings is
  'Configuração operacional da cobrança B2B. Chaves da API e token do webhook permanecem somente em Secrets.';

alter table public.platform_billing_settings
  add column if not exists webhook_environment text
    check (webhook_environment in ('sandbox', 'production'));

insert into public.platform_billing_settings (id)
values ('global')
on conflict (id) do nothing;

update public.platform_billing_settings
set webhook_environment = environment
where webhook_id is not null
  and webhook_environment is null;

create table if not exists public.platform_billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  interval_months integer not null default 1
    check (interval_months between 1 and 120),
  amount numeric(14,2) not null check (amount >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.platform_billing_plans
  (code, name, description, interval_months, amount, active, sort_order)
values
  ('monthly', 'Mensal', 'Licença mensal do LinkUp Studio.', 1, 49.90, true, 10),
  ('annual', 'Anual', 'Licença anual do LinkUp Studio.', 12, 598.80, true, 20)
on conflict (code) do nothing;

create table if not exists public.tenant_billing_provider_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  provider text not null default 'asaas' check (provider = 'asaas'),
  environment text not null
    check (environment in ('sandbox', 'production')),
  provider_customer_id text,
  external_reference text not null,
  legal_name text not null,
  cpf_cnpj text,
  email text,
  phone text,
  address text,
  address_number text,
  complement text,
  province text,
  postal_code text,
  city text,
  state text,
  preferred_billing_type text not null default 'UNDEFINED'
    check (preferred_billing_type in ('UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD')),
  notification_disabled boolean not null default true,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'error')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint tenant_billing_provider_customers_scope_key
    unique (tenant_id, provider, environment),
  constraint tenant_billing_provider_customers_external_key
    unique (provider, environment, external_reference)
);

create unique index if not exists tenant_billing_provider_customers_provider_id_key
  on public.tenant_billing_provider_customers
    (provider, environment, provider_customer_id)
  where provider_customer_id is not null;

create index if not exists tenant_billing_provider_customers_tenant_idx
  on public.tenant_billing_provider_customers (tenant_id, environment);

create table if not exists public.platform_billing_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  plan_id uuid not null references public.platform_billing_plans(id) on delete restrict,
  status text not null default 'active'
    check (status in ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  amount_snapshot numeric(14,2) not null check (amount_snapshot >= 0),
  interval_months_snapshot integer not null
    check (interval_months_snapshot between 1 and 120),
  billing_type text not null default 'UNDEFINED'
    check (billing_type in ('UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD')),
  due_day integer not null default 10 check (due_day between 1 and 28),
  starts_on date not null default current_date,
  current_period_start date,
  current_period_end date,
  next_due_date date,
  auto_renew boolean not null default true,
  cancel_at_period_end boolean not null default false,
  last_paid_at timestamptz,
  past_due_since date,
  suspended_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint platform_billing_contracts_period_check
    check (
      current_period_start is null
      or current_period_end is null
      or current_period_end >= current_period_start
    ),
  constraint platform_billing_contracts_id_tenant_key unique (id, tenant_id)
);

create unique index if not exists platform_billing_contracts_current_tenant_key
  on public.platform_billing_contracts (tenant_id)
  where status in ('trialing', 'active', 'past_due', 'suspended');

create index if not exists platform_billing_contracts_due_idx
  on public.platform_billing_contracts (status, next_due_date);

create table if not exists public.platform_billing_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  contract_id uuid not null,
  plan_id uuid not null references public.platform_billing_plans(id) on delete restrict,
  provider text not null default 'asaas' check (provider = 'asaas'),
  environment text not null
    check (environment in ('sandbox', 'production')),
  provider_customer_id text,
  provider_payment_id text,
  external_reference text not null,
  idempotency_key text not null,
  source text not null default 'automatic'
    check (source in ('manual', 'automatic', 'migration')),
  billing_type text not null default 'UNDEFINED'
    check (billing_type in ('UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD')),
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  coverage_start date not null,
  coverage_end date not null,
  description text,
  status text not null default 'draft'
    check (
      status in (
        'draft', 'creating', 'pending', 'confirmed', 'received', 'overdue',
        'refund_pending', 'refunded', 'partially_refunded', 'cancelled',
        'failed', 'disputed'
      )
    ),
  provider_status text,
  invoice_url text,
  bank_slip_url text,
  confirmed_at timestamptz,
  received_at timestamptz,
  refunded_at timestamptz,
  access_applied_at timestamptz,
  access_reversed_at timestamptz,
  last_provider_event_at timestamptz,
  last_provider_event_id text,
  last_synced_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint platform_billing_charges_contract_tenant_fk
    foreign key (contract_id, tenant_id)
    references public.platform_billing_contracts(id, tenant_id)
    on delete restrict,
  constraint platform_billing_charges_coverage_check
    check (coverage_end >= coverage_start),
  constraint platform_billing_charges_competence_key
    unique (contract_id, environment, coverage_start, coverage_end),
  constraint platform_billing_charges_external_key
    unique (provider, environment, external_reference),
  constraint platform_billing_charges_idempotency_key
    unique (provider, environment, idempotency_key)
);

create unique index if not exists platform_billing_charges_provider_payment_key
  on public.platform_billing_charges
    (provider, environment, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists platform_billing_charges_tenant_due_idx
  on public.platform_billing_charges (tenant_id, due_date desc);

create index if not exists platform_billing_charges_status_due_idx
  on public.platform_billing_charges (status, due_date);

create table if not exists public.platform_billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas' check (provider = 'asaas'),
  environment text not null
    check (environment in ('sandbox', 'production')),
  provider_event_id text not null,
  event_type text not null,
  provider_payment_id text,
  external_reference text,
  charge_id uuid references public.platform_billing_charges(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  provider_created_at timestamptz,
  processing_status text not null default 'pending'
    check (
      processing_status in (
        'pending', 'processing', 'processed', 'ignored', 'failed', 'dead_letter'
      )
    ),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  constraint platform_billing_webhook_events_provider_key
    unique (provider, environment, provider_event_id)
);

create index if not exists platform_billing_webhook_events_claim_idx
  on public.platform_billing_webhook_events
    (environment, processing_status, available_at, received_at);

create index if not exists platform_billing_webhook_events_payment_idx
  on public.platform_billing_webhook_events
    (provider, environment, provider_payment_id);

create table if not exists public.platform_billing_provider_operations (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'asaas' check (provider = 'asaas'),
  environment text not null
    check (environment in ('sandbox', 'production')),
  operation_key text not null,
  operation_type text not null,
  tenant_id uuid references public.tenants(id) on delete restrict,
  contract_id uuid references public.platform_billing_contracts(id) on delete restrict,
  charge_id uuid references public.platform_billing_charges(id) on delete restrict,
  request_fingerprint text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'unknown')),
  provider_resource_id text,
  attempts integer not null default 0 check (attempts >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_billing_provider_operations_key
    unique (provider, environment, operation_key)
);

create index if not exists platform_billing_provider_operations_charge_idx
  on public.platform_billing_provider_operations (charge_id, created_at desc);

create table if not exists public.platform_billing_worker_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null
    check (environment in ('sandbox', 'production')),
  action text not null default 'run',
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_message text
);

create index if not exists platform_billing_worker_runs_started_idx
  on public.platform_billing_worker_runs (started_at desc);

create table if not exists public.platform_billing_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete restrict,
  contract_id uuid references public.platform_billing_contracts(id) on delete restrict,
  charge_id uuid references public.platform_billing_charges(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  source text not null default 'system'
    check (source in ('admin', 'webhook', 'worker', 'system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  provider_event_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_billing_audit_tenant_idx
  on public.platform_billing_audit_log (tenant_id, created_at desc);

create index if not exists platform_billing_audit_charge_idx
  on public.platform_billing_audit_log (charge_id, created_at desc);

create or replace function private.set_platform_billing_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function private.prepare_platform_billing_charge()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if nullif(btrim(new.external_reference), '') is null then
    new.external_reference :=
      'linkupstudio:b2b:v1:invoice:' || new.id::text;
  end if;

  if nullif(btrim(new.idempotency_key), '') is null then
    new.idempotency_key :=
      'charge:create:' || new.environment || ':' || new.id::text;
  end if;

  return new;
end;
$function$;

drop trigger if exists set_platform_billing_settings_updated_at
  on public.platform_billing_settings;
create trigger set_platform_billing_settings_updated_at
before update on public.platform_billing_settings
for each row execute function private.set_platform_billing_updated_at();

drop trigger if exists set_platform_billing_plans_updated_at
  on public.platform_billing_plans;
create trigger set_platform_billing_plans_updated_at
before update on public.platform_billing_plans
for each row execute function private.set_platform_billing_updated_at();

drop trigger if exists set_tenant_billing_provider_customers_updated_at
  on public.tenant_billing_provider_customers;
create trigger set_tenant_billing_provider_customers_updated_at
before update on public.tenant_billing_provider_customers
for each row execute function private.set_platform_billing_updated_at();

drop trigger if exists set_platform_billing_contracts_updated_at
  on public.platform_billing_contracts;
create trigger set_platform_billing_contracts_updated_at
before update on public.platform_billing_contracts
for each row execute function private.set_platform_billing_updated_at();

drop trigger if exists prepare_platform_billing_charge
  on public.platform_billing_charges;
create trigger prepare_platform_billing_charge
before insert on public.platform_billing_charges
for each row execute function private.prepare_platform_billing_charge();

drop trigger if exists set_platform_billing_charges_updated_at
  on public.platform_billing_charges;
create trigger set_platform_billing_charges_updated_at
before update on public.platform_billing_charges
for each row execute function private.set_platform_billing_updated_at();

drop trigger if exists set_platform_billing_provider_operations_updated_at
  on public.platform_billing_provider_operations;
create trigger set_platform_billing_provider_operations_updated_at
before update on public.platform_billing_provider_operations
for each row execute function private.set_platform_billing_updated_at();

insert into public.tenant_billing_provider_customers (
  tenant_id,
  provider,
  environment,
  external_reference,
  legal_name,
  phone,
  preferred_billing_type,
  notification_disabled
)
select
  t.id,
  'asaas',
  s.environment,
  'linkupstudio:b2b:v1:tenant:' || t.id::text,
  t.name,
  nullif(regexp_replace(coalesce(t.whatsapp, ''), '\D', '', 'g'), ''),
  s.default_billing_type,
  s.notification_disabled
from public.tenants t
cross join public.platform_billing_settings s
where s.id = 'global'
on conflict (tenant_id, provider, environment) do nothing;

with tenant_plan as (
  select
    t.id as tenant_id,
    t.created_at::date as starts_on,
    t.status as tenant_status,
    coalesce(t.plan_expires_at::date, current_date + 7) as next_due_date,
    case
      when lower(coalesce(t.plan, '')) in ('annual', 'anual', 'yearly') then 'annual'
      else 'monthly'
    end as plan_code
  from public.tenants t
),
resolved as (
  select
    tp.*,
    p.id as plan_id,
    p.amount,
    p.interval_months
  from tenant_plan tp
  join public.platform_billing_plans p on p.code = tp.plan_code
)
insert into public.platform_billing_contracts (
  tenant_id,
  plan_id,
  status,
  amount_snapshot,
  interval_months_snapshot,
  billing_type,
  due_day,
  starts_on,
  current_period_start,
  current_period_end,
  next_due_date
)
select
  r.tenant_id,
  r.plan_id,
  case
    when r.tenant_status = 'trial' then 'trialing'
    when r.tenant_status = 'blocked' then 'suspended'
    else 'active'
  end,
  r.amount,
  r.interval_months,
  s.default_billing_type,
  least(28, greatest(1, extract(day from r.next_due_date)::integer)),
  r.starts_on,
  (r.next_due_date::timestamp - make_interval(months => r.interval_months))::date,
  r.next_due_date - 1,
  r.next_due_date
from resolved r
cross join public.platform_billing_settings s
where s.id = 'global'
  and not exists (
    select 1
    from public.platform_billing_contracts c
    where c.tenant_id = r.tenant_id
      and c.status in ('trialing', 'active', 'past_due', 'suspended')
  );

drop function if exists public.ingest_platform_billing_webhook_event(
  text, text, text, text, text, timestamptz, jsonb
);
create function public.ingest_platform_billing_webhook_event(
  p_environment text,
  p_event_id text,
  p_event_type text,
  p_payment_id text,
  p_external_reference text,
  p_provider_created_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_event public.platform_billing_webhook_events%rowtype;
  v_owned boolean := false;
  v_duplicate boolean := false;
begin
  if p_environment not in ('sandbox', 'production') then
    raise exception 'Ambiente de cobrança inválido.';
  end if;

  if nullif(btrim(p_event_id), '') is null
     or nullif(btrim(p_event_type), '') is null then
    raise exception 'Evento e tipo do webhook são obrigatórios.';
  end if;

  v_owned :=
    coalesce(p_external_reference, '') like 'linkupstudio:b2b:v1:%';

  if not v_owned and nullif(btrim(coalesce(p_payment_id, '')), '') is not null then
    select exists (
      select 1
      from public.platform_billing_charges c
      where c.provider = 'asaas'
        and c.environment = p_environment
        and c.provider_payment_id = p_payment_id
    )
    into v_owned;
  end if;

  insert into public.platform_billing_webhook_events (
    provider,
    environment,
    provider_event_id,
    event_type,
    provider_payment_id,
    external_reference,
    payload,
    provider_created_at,
    processing_status,
    processed_at,
    last_error
  )
  values (
    'asaas',
    p_environment,
    btrim(p_event_id),
    upper(btrim(p_event_type)),
    nullif(btrim(coalesce(p_payment_id, '')), ''),
    nullif(btrim(coalesce(p_external_reference, '')), ''),
    case when v_owned then coalesce(p_payload, '{}'::jsonb) else '{}'::jsonb end,
    p_provider_created_at,
    case when v_owned then 'pending' else 'ignored' end,
    case when v_owned then null else now() end,
    case
      when v_owned then null
      else 'Evento não pertence ao domínio B2B LinkUp Studio.'
    end
  )
  on conflict (provider, environment, provider_event_id) do nothing
  returning * into v_event;

  if not found then
    v_duplicate := true;
    select *
    into v_event
    from public.platform_billing_webhook_events e
    where e.provider = 'asaas'
      and e.environment = p_environment
      and e.provider_event_id = btrim(p_event_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'eventRowId', v_event.id,
    'duplicate', v_duplicate,
    'accepted', v_event.processing_status <> 'ignored',
    'status', v_event.processing_status
  );
end;
$function$;

drop function if exists public.claim_platform_billing_webhook_events(
  text, integer, text
);
create function public.claim_platform_billing_webhook_events(
  p_environment text,
  p_limit integer default 25,
  p_worker_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_worker_id text := coalesce(
    nullif(btrim(coalesce(p_worker_id, '')), ''),
    gen_random_uuid()::text
  );
  v_events jsonb;
begin
  if p_environment not in ('sandbox', 'production') then
    raise exception 'Ambiente de cobrança inválido.';
  end if;

  update public.platform_billing_webhook_events
  set
    processing_status = 'dead_letter',
    processed_at = coalesce(processed_at, now()),
    last_error = coalesce(last_error, 'Limite de tentativas excedido.')
  where provider = 'asaas'
    and environment = p_environment
    and processing_status = 'failed'
    and attempts >= 10;

  with candidates as (
    select e.id
    from public.platform_billing_webhook_events e
    where e.provider = 'asaas'
      and e.environment = p_environment
      and e.attempts < 10
      and (
        (
          e.processing_status in ('pending', 'failed')
          and e.available_at <= now()
        )
        or (
          e.processing_status = 'processing'
          and e.claimed_at < now() - interval '10 minutes'
        )
      )
    order by e.received_at, e.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ),
  claimed as (
    update public.platform_billing_webhook_events e
    set
      processing_status = 'processing',
      attempts = e.attempts + 1,
      claimed_at = now(),
      claimed_by = v_worker_id,
      last_error = null
    from candidates c
    where e.id = c.id
    returning e.*
  )
  select coalesce(
    jsonb_agg(to_jsonb(claimed) order by claimed.received_at, claimed.id),
    '[]'::jsonb
  )
  into v_events
  from claimed;

  return jsonb_build_object(
    'ok', true,
    'workerId', v_worker_id,
    'events', v_events
  );
end;
$function$;

drop function if exists public.fail_platform_billing_webhook_event(
  uuid, text, integer
);
create function public.fail_platform_billing_webhook_event(
  p_event_row_id uuid,
  p_error text,
  p_retry_after_seconds integer default 60
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_event public.platform_billing_webhook_events%rowtype;
begin
  update public.platform_billing_webhook_events
  set
    processing_status = case when attempts >= 10 then 'dead_letter' else 'failed' end,
    available_at = case
      when attempts >= 10 then available_at
      else now() + make_interval(
        secs => least(greatest(coalesce(p_retry_after_seconds, 60), 5), 86400)
      )
    end,
    processed_at = case when attempts >= 10 then now() else null end,
    last_error = left(coalesce(p_error, 'Falha não informada.'), 4000)
  where id = p_event_row_id
    and processing_status = 'processing'
  returning * into v_event;

  if not found then
    raise exception 'Evento não encontrado ou não está em processamento.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'eventRowId', v_event.id,
    'status', v_event.processing_status,
    'attempts', v_event.attempts,
    'availableAt', v_event.available_at
  );
end;
$function$;

drop function if exists public.process_platform_billing_webhook_event(uuid);
create function public.process_platform_billing_webhook_event(
  p_event_row_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_event public.platform_billing_webhook_events%rowtype;
  v_charge public.platform_billing_charges%rowtype;
  v_before jsonb;
  v_candidate_status text;
  v_payment_status text;
  v_new_status text;
  v_event_at timestamptz;
  v_access_changed integer := 0;
  v_valid_until date;
  v_plan_code text;
  v_auto_suspend boolean := false;
  v_active_environment text;
begin
  select *
  into v_event
  from public.platform_billing_webhook_events e
  where e.id = p_event_row_id
  for update;

  if not found then
    raise exception 'Evento de cobrança não encontrado.';
  end if;

  if v_event.processing_status <> 'processing' then
    return jsonb_build_object(
      'ok', true,
      'eventRowId', v_event.id,
      'status', v_event.processing_status,
      'skipped', true
    );
  end if;

  select c.*
  into v_charge
  from public.platform_billing_charges c
  where c.provider = v_event.provider
    and c.environment = v_event.environment
    and (
      (
        v_event.provider_payment_id is not null
        and c.provider_payment_id = v_event.provider_payment_id
      )
      or (
        v_event.external_reference is not null
        and c.external_reference = v_event.external_reference
      )
    )
  order by
    case
      when c.provider_payment_id = v_event.provider_payment_id then 0
      else 1
    end,
    c.created_at desc
  limit 1
  for update;

  if not found then
    update public.platform_billing_webhook_events
    set
      processing_status = 'ignored',
      processed_at = now(),
      last_error = 'Cobrança B2B correspondente não encontrada.'
    where id = v_event.id;

    return jsonb_build_object(
      'ok', true,
      'eventRowId', v_event.id,
      'status', 'ignored',
      'reason', 'charge_not_found'
    );
  end if;

  update public.platform_billing_webhook_events
  set charge_id = v_charge.id
  where id = v_event.id;

  v_event_at := coalesce(v_event.provider_created_at, v_event.received_at, now());

  select s.environment
  into v_active_environment
  from public.platform_billing_settings s
  where s.id = 'global';

  if v_charge.last_provider_event_at is not null
     and v_event_at < v_charge.last_provider_event_at
     and v_event.event_type not in (
       'PAYMENT_REFUND_IN_PROGRESS',
       'PAYMENT_REFUNDED',
       'PAYMENT_PARTIALLY_REFUNDED',
       'PAYMENT_RECEIVED_IN_CASH_UNDONE',
       'PAYMENT_CHARGEBACK_REQUESTED',
       'PAYMENT_CHARGEBACK_DISPUTE',
       'PAYMENT_AWAITING_CHARGEBACK_REVERSAL'
     ) then
    update public.platform_billing_webhook_events
    set
      processing_status = 'ignored',
      processed_at = now(),
      last_error = 'Evento anterior ao último estado conhecido da cobrança.'
    where id = v_event.id;

    return jsonb_build_object(
      'ok', true,
      'eventRowId', v_event.id,
      'status', 'ignored',
      'reason', 'stale_event'
    );
  end if;

  v_payment_status := upper(coalesce(
    nullif(v_event.payload #>> '{payment,status}', ''),
    nullif(v_event.payload->>'status', ''),
    ''
  ));

  v_candidate_status := case
    when v_event.event_type = 'PAYMENT_UPDATED' then case v_payment_status
      when 'PENDING' then 'pending'
      when 'AWAITING_RISK_ANALYSIS' then 'pending'
      when 'APPROVED_BY_RISK_ANALYSIS' then 'pending'
      when 'AUTHORIZED' then 'pending'
      when 'RESTORED' then 'pending'
      when 'REPROVED_BY_RISK_ANALYSIS' then 'failed'
      when 'CREDIT_CARD_CAPTURE_REFUSED' then 'failed'
      when 'CONFIRMED' then 'confirmed'
      when 'RECEIVED' then 'received'
      when 'DUNNING_RECEIVED' then 'received'
      when 'OVERDUE' then 'overdue'
      when 'DELETED' then 'cancelled'
      when 'REFUND_IN_PROGRESS' then 'refund_pending'
      when 'REFUNDED' then 'refunded'
      when 'RECEIVED_IN_CASH_UNDONE' then 'refunded'
      when 'PARTIALLY_REFUNDED' then 'partially_refunded'
      when 'CHARGEBACK_REQUESTED' then 'disputed'
      when 'CHARGEBACK_DISPUTE' then 'disputed'
      when 'AWAITING_CHARGEBACK_REVERSAL' then 'disputed'
      else null
    end
    else case v_event.event_type
    when 'PAYMENT_CREATED' then 'pending'
    when 'PAYMENT_AWAITING_RISK_ANALYSIS' then 'pending'
    when 'PAYMENT_APPROVED_BY_RISK_ANALYSIS' then 'pending'
    when 'PAYMENT_AUTHORIZED' then 'pending'
    when 'PAYMENT_RESTORED' then 'pending'
    when 'PAYMENT_REPROVED_BY_RISK_ANALYSIS' then 'failed'
    when 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' then 'failed'
    when 'PAYMENT_CONFIRMED' then 'confirmed'
    when 'PAYMENT_RECEIVED' then 'received'
    when 'PAYMENT_DUNNING_RECEIVED' then 'received'
    when 'PAYMENT_OVERDUE' then 'overdue'
    when 'PAYMENT_DELETED' then 'cancelled'
    when 'PAYMENT_REFUND_IN_PROGRESS' then 'refund_pending'
    when 'PAYMENT_REFUNDED' then 'refunded'
    when 'PAYMENT_RECEIVED_IN_CASH_UNDONE' then 'refunded'
    when 'PAYMENT_PARTIALLY_REFUNDED' then 'partially_refunded'
    when 'PAYMENT_REFUND_DENIED' then case
      when v_charge.received_at is not null then 'received'
      else 'confirmed'
    end
    when 'PAYMENT_CHARGEBACK_REQUESTED' then 'disputed'
    when 'PAYMENT_CHARGEBACK_DISPUTE' then 'disputed'
    when 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL' then 'disputed'
    else null
    end
  end;

  v_new_status := coalesce(v_candidate_status, v_charge.status);

  -- Transições monotônicas: uma notificação antiga não pode reabrir ou
  -- regredir uma cobrança já liquidada/estornada.
  if v_charge.status = 'refunded' then
    v_new_status := 'refunded';
  elsif v_charge.status = 'partially_refunded'
        and v_new_status not in ('refunded', 'disputed') then
    v_new_status := 'partially_refunded';
  elsif v_charge.status = 'received'
        and v_new_status not in (
          'refund_pending', 'refunded', 'partially_refunded', 'disputed'
        ) then
    v_new_status := 'received';
  elsif v_charge.status = 'confirmed'
        and v_new_status not in (
          'received', 'refund_pending', 'refunded',
          'partially_refunded', 'disputed'
        ) then
    v_new_status := 'confirmed';
  elsif v_charge.status = 'refund_pending'
        and v_new_status not in (
          'confirmed', 'received', 'refunded', 'partially_refunded', 'disputed'
        ) then
    v_new_status := 'refund_pending';
  elsif v_charge.status = 'disputed'
        and v_new_status not in (
          'confirmed', 'received', 'refunded', 'partially_refunded'
        ) then
    v_new_status := 'disputed';
  elsif v_charge.status = 'cancelled'
        and v_event.event_type <> 'PAYMENT_RESTORED' then
    v_new_status := 'cancelled';
  elsif v_charge.status = 'overdue'
        and v_event.event_type = 'PAYMENT_UPDATED'
        and coalesce(v_candidate_status, 'overdue') = 'pending' then
    v_new_status := 'overdue';
  end if;

  v_before := to_jsonb(v_charge);

  update public.platform_billing_charges
  set
    status = v_new_status,
    provider_status = case
      when v_event.event_type = 'PAYMENT_UPDATED'
        and nullif(v_payment_status, '') is not null
        then v_payment_status
      else v_event.event_type
    end,
    provider_payment_id = coalesce(
      provider_payment_id,
      v_event.provider_payment_id
    ),
    confirmed_at = case
      when v_new_status = 'confirmed' then coalesce(confirmed_at, v_event_at)
      else confirmed_at
    end,
    received_at = case
      when v_new_status = 'received' then coalesce(received_at, v_event_at)
      else received_at
    end,
    refunded_at = case
      when v_new_status = 'refunded' then coalesce(refunded_at, v_event_at)
      else refunded_at
    end,
    last_provider_event_at = case
      when v_candidate_status is not null
        and (last_provider_event_at is null or v_event_at >= last_provider_event_at)
        then v_event_at
      else last_provider_event_at
    end,
    last_provider_event_id = case
      when v_candidate_status is not null
        and (last_provider_event_at is null or v_event_at >= last_provider_event_at)
        then v_event.provider_event_id
      else last_provider_event_id
    end,
    last_synced_at = now(),
    error_message = null
  where id = v_charge.id
  returning * into v_charge;

  if v_event.environment = v_active_environment
     and v_new_status in ('confirmed', 'received')
     and (
       v_charge.access_applied_at is null
       or v_charge.access_reversed_at is not null
     ) then
    update public.platform_billing_charges
    set
      access_applied_at = coalesce(access_applied_at, now()),
      access_reversed_at = null
    where id = v_charge.id
      and (
        access_applied_at is null
        or access_reversed_at is not null
      );
    get diagnostics v_access_changed = row_count;

    if v_access_changed > 0 then
      update public.platform_billing_contracts c
      set
        status = case when c.status = 'cancelled' then c.status else 'active' end,
        current_period_start = case
          when c.current_period_end is null
            or v_charge.coverage_end >= c.current_period_end
            then v_charge.coverage_start
          else c.current_period_start
        end,
        current_period_end = case
          when c.current_period_end is null
            or v_charge.coverage_end >= c.current_period_end
            then v_charge.coverage_end
          else c.current_period_end
        end,
        next_due_date = case
          when c.current_period_end is null
            or v_charge.coverage_end >= c.current_period_end
            then v_charge.coverage_end + 1
          else c.next_due_date
        end,
        last_paid_at = greatest(
          coalesce(c.last_paid_at, v_event_at),
          v_event_at
        ),
        past_due_since = null,
        suspended_at = case when c.status = 'suspended' then null else c.suspended_at end
      where c.id = v_charge.contract_id;

      select p.code
      into v_plan_code
      from public.platform_billing_plans p
      where p.id = v_charge.plan_id;

      update public.tenants t
      set
        plan = case
          when v_plan_code = 'annual' then 'yearly'
          when v_plan_code = 'monthly' then 'monthly'
          else t.plan
        end,
        plan_expires_at = case
          when t.plan_expires_at is null
            or v_charge.coverage_end > t.plan_expires_at::date
            then (v_charge.coverage_end + 1)::timestamptz - interval '1 second'
          else t.plan_expires_at
        end,
        status = case
          when t.status = 'trial'
            or t.status_reason in ('billing_overdue', 'billing_refund')
            then 'active'
          else t.status
        end,
        status_reason = case
          when t.status = 'trial'
            or t.status_reason in ('billing_overdue', 'billing_refund')
            then null
          else t.status_reason
        end,
        billing_blocked_at = case
          when t.status = 'trial'
            or t.status_reason in ('billing_overdue', 'billing_refund')
            then null
          else t.billing_blocked_at
        end
      where t.id = v_charge.tenant_id;
    end if;
  end if;

  if v_event.environment = v_active_environment
     and v_new_status = 'overdue' then
    update public.platform_billing_contracts
    set
      status = case
        when status in ('trialing', 'active') then 'past_due'
        else status
      end,
      past_due_since = coalesce(past_due_since, v_charge.due_date)
    where id = v_charge.contract_id;
  end if;

  if v_event.environment = v_active_environment
     and v_new_status in ('refunded', 'disputed') then
    update public.platform_billing_charges
    set access_reversed_at = coalesce(access_reversed_at, now())
    where id = v_charge.id
      and access_applied_at is not null
      and access_reversed_at is null;

    select max(c.coverage_end)
    into v_valid_until
    from public.platform_billing_charges c
    where c.tenant_id = v_charge.tenant_id
      and c.environment = v_event.environment
      and c.id <> v_charge.id
      and c.status in ('confirmed', 'received')
      and c.access_applied_at is not null
      and c.access_reversed_at is null;

    update public.platform_billing_contracts c
    set
      status = case
        when c.status = 'cancelled' then c.status
        when v_valid_until is not null and v_valid_until >= current_date then 'active'
        else 'past_due'
      end,
      current_period_end = v_valid_until,
      next_due_date = coalesce(v_valid_until + 1, c.next_due_date),
      past_due_since = case
        when v_valid_until is not null and v_valid_until >= current_date then null
        else coalesce(c.past_due_since, current_date)
      end
    where c.id = v_charge.contract_id;

    update public.tenants t
    set plan_expires_at = case
      when v_valid_until is null
        then current_date::timestamptz - interval '1 second'
      else (v_valid_until + 1)::timestamptz - interval '1 second'
    end
    where t.id = v_charge.tenant_id;

    if v_valid_until is not null and v_valid_until >= current_date then
      update public.tenants t
      set
        status = case
          when t.status_reason in ('billing_overdue', 'billing_refund')
            then 'active'
          else t.status
        end,
        status_reason = case
          when t.status_reason in ('billing_overdue', 'billing_refund')
            then null
          else t.status_reason
        end,
        billing_blocked_at = case
          when t.status_reason in ('billing_overdue', 'billing_refund')
            then null
          else t.billing_blocked_at
        end
      where t.id = v_charge.tenant_id;
    else
      select coalesce(s.auto_suspend, false)
      into v_auto_suspend
      from public.platform_billing_settings s
      where s.id = 'global';

      if v_auto_suspend then
        update public.tenants t
        set
          status = 'blocked',
          status_reason = 'billing_refund',
          billing_blocked_at = coalesce(t.billing_blocked_at, now())
        where t.id = v_charge.tenant_id
          and (
            t.status <> 'blocked'
            or t.status_reason in ('billing_overdue', 'billing_refund')
          );

        update public.platform_billing_contracts
        set
          status = case when status = 'cancelled' then status else 'suspended' end,
          suspended_at = coalesce(suspended_at, now())
        where id = v_charge.contract_id;
      end if;
    end if;
  end if;

  select *
  into v_charge
  from public.platform_billing_charges
  where id = v_charge.id;

  insert into public.platform_billing_audit_log (
    tenant_id,
    contract_id,
    charge_id,
    action,
    entity_type,
    entity_id,
    source,
    provider_event_id,
    before_data,
    after_data
  )
  values (
    v_charge.tenant_id,
    v_charge.contract_id,
    v_charge.id,
    'provider_event:' || lower(v_event.event_type),
    'charge',
    v_charge.id,
    case
      when v_event.payload->>'__linkup_source' in ('admin', 'worker', 'system')
        then v_event.payload->>'__linkup_source'
      else 'webhook'
    end,
    v_event.provider_event_id,
    v_before,
    to_jsonb(v_charge)
  );

  update public.platform_billing_webhook_events
  set
    processing_status = 'processed',
    processed_at = now(),
    last_error = null,
    charge_id = v_charge.id
  where id = v_event.id;

  return jsonb_build_object(
    'ok', true,
    'eventRowId', v_event.id,
    'chargeId', v_charge.id,
    'status', v_charge.status,
    'accessApplied', v_access_changed > 0
  );
end;
$function$;

-- Ponto unico e idempotente para aplicar um estado retornado pelo Asaas.
-- Webhook, consulta manual e criacao de cobranca passam por esta funcao, evitando
-- que cada caminho altere contrato/acesso/tenant de uma forma diferente.
drop function if exists public.apply_platform_billing_charge_state(
  uuid, text, text, timestamptz, text, text, text, text, uuid
);
create function public.apply_platform_billing_charge_state(
  p_charge_id uuid,
  p_event_type text,
  p_provider_event_id text,
  p_provider_event_at timestamptz default now(),
  p_provider_payment_id text default null,
  p_invoice_url text default null,
  p_bank_slip_url text default null,
  p_source text default 'system',
  p_event_row_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_charge public.platform_billing_charges%rowtype;
  v_event public.platform_billing_webhook_events%rowtype;
  v_event_id text;
  v_source text;
begin
  if nullif(btrim(coalesce(p_event_type, '')), '') is null then
    raise exception 'Tipo do evento de cobranca e obrigatorio.';
  end if;

  v_source := case
    when p_source in ('admin', 'worker', 'system') then p_source
    else 'system'
  end;

  if p_event_row_id is not null then
    select *
    into v_event
    from public.platform_billing_webhook_events e
    where e.id = p_event_row_id
    for update;

    if not found then
      raise exception 'Evento de cobranca nao encontrado.';
    end if;
  end if;

  select *
  into v_charge
  from public.platform_billing_charges c
  where
    (p_charge_id is not null and c.id = p_charge_id)
    or (
      p_event_row_id is not null
      and c.provider = v_event.provider
      and c.environment = v_event.environment
      and (
        (
          v_event.provider_payment_id is not null
          and c.provider_payment_id = v_event.provider_payment_id
        )
        or (
          v_event.external_reference is not null
          and c.external_reference = v_event.external_reference
        )
      )
    )
  order by case when c.id = p_charge_id then 0 else 1 end, c.created_at desc
  limit 1
  for update;

  if not found then
    if p_event_row_id is not null then
      return public.process_platform_billing_webhook_event(v_event.id);
    end if;
    raise exception 'Cobranca nao encontrada.';
  end if;

  update public.platform_billing_charges
  set
    provider_payment_id = coalesce(
      nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
      provider_payment_id
    ),
    invoice_url = coalesce(
      nullif(btrim(coalesce(p_invoice_url, '')), ''),
      invoice_url
    ),
    bank_slip_url = coalesce(
      nullif(btrim(coalesce(p_bank_slip_url, '')), ''),
      bank_slip_url
    ),
    last_synced_at = now()
  where id = v_charge.id;

  if p_event_row_id is not null then
    if v_event.charge_id is null then
      update public.platform_billing_webhook_events
      set charge_id = v_charge.id
      where id = v_event.id
      returning * into v_event;
    end if;
  else
    v_event_id := coalesce(
      nullif(btrim(coalesce(p_provider_event_id, '')), ''),
      'snapshot:' || v_charge.id::text || ':' || lower(p_event_type)
    );

    insert into public.platform_billing_webhook_events (
      provider,
      environment,
      provider_event_id,
      event_type,
      provider_payment_id,
      external_reference,
      charge_id,
      payload,
      provider_created_at,
      processing_status,
      attempts,
      available_at,
      claimed_at,
      claimed_by
    )
    values (
      v_charge.provider,
      v_charge.environment,
      v_event_id,
      upper(btrim(p_event_type)),
      coalesce(nullif(btrim(coalesce(p_provider_payment_id, '')), ''), v_charge.provider_payment_id),
      v_charge.external_reference,
      v_charge.id,
      jsonb_build_object('__linkup_source', v_source),
      coalesce(p_provider_event_at, now()),
      'processing',
      1,
      now(),
      now(),
      'state-reconciler'
    )
    on conflict (provider, environment, provider_event_id) do nothing
    returning * into v_event;

    if not found then
      select *
      into v_event
      from public.platform_billing_webhook_events e
      where e.provider = v_charge.provider
        and e.environment = v_charge.environment
        and e.provider_event_id = v_event_id
      for update;

      if v_event.processing_status in ('processed', 'ignored') then
        return jsonb_build_object(
          'ok', true,
          'eventRowId', v_event.id,
          'chargeId', v_charge.id,
          'status', v_event.processing_status,
          'duplicate', true
        );
      end if;

      update public.platform_billing_webhook_events
      set
        event_type = upper(btrim(p_event_type)),
        provider_payment_id = coalesce(
          nullif(btrim(coalesce(p_provider_payment_id, '')), ''),
          provider_payment_id
        ),
        external_reference = v_charge.external_reference,
        charge_id = v_charge.id,
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('__linkup_source', v_source),
        provider_created_at = coalesce(p_provider_event_at, provider_created_at, now()),
        processing_status = 'processing',
        attempts = attempts + 1,
        available_at = now(),
        claimed_at = now(),
        claimed_by = 'state-reconciler',
        processed_at = null,
        last_error = null
      where id = v_event.id
      returning * into v_event;
    end if;
  end if;

  return public.process_platform_billing_webhook_event(v_event.id);
end;
$function$;

drop function if exists public.begin_platform_billing_provider_operation(
  text, text, text, uuid, uuid, uuid, text, jsonb
);
create function public.begin_platform_billing_provider_operation(
  p_environment text,
  p_operation_key text,
  p_operation_type text,
  p_tenant_id uuid,
  p_contract_id uuid,
  p_charge_id uuid,
  p_request_fingerprint text,
  p_request_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_operation public.platform_billing_provider_operations%rowtype;
begin
  if p_environment not in ('sandbox', 'production') then
    raise exception 'Ambiente de cobrança inválido.';
  end if;

  if nullif(btrim(p_operation_key), '') is null
     or nullif(btrim(p_operation_type), '') is null then
    raise exception 'Chave e tipo da operação são obrigatórios.';
  end if;

  insert into public.platform_billing_provider_operations (
    provider,
    environment,
    operation_key,
    operation_type,
    tenant_id,
    contract_id,
    charge_id,
    request_fingerprint,
    request_payload,
    status,
    attempts,
    started_at
  )
  values (
    'asaas',
    p_environment,
    btrim(p_operation_key),
    btrim(p_operation_type),
    p_tenant_id,
    p_contract_id,
    p_charge_id,
    nullif(btrim(coalesce(p_request_fingerprint, '')), ''),
    coalesce(p_request_payload, '{}'::jsonb),
    'processing',
    1,
    now()
  )
  on conflict (provider, environment, operation_key) do nothing
  returning * into v_operation;

  if found then
    return jsonb_build_object(
      'ok', true,
      'proceed', true,
      'operationId', v_operation.id,
      'attempt', v_operation.attempts
    );
  end if;

  select *
  into v_operation
  from public.platform_billing_provider_operations o
  where o.provider = 'asaas'
    and o.environment = p_environment
    and o.operation_key = btrim(p_operation_key)
  for update;

  if v_operation.request_fingerprint is distinct from
     nullif(btrim(coalesce(p_request_fingerprint, '')), '') then
    return jsonb_build_object(
      'ok', false,
      'proceed', false,
      'conflict', true,
      'operationId', v_operation.id,
      'reason', 'idempotency_key_reused_with_different_request'
    );
  end if;

  if v_operation.status = 'succeeded' then
    return jsonb_build_object(
      'ok', true,
      'proceed', false,
      'duplicate', true,
      'operationId', v_operation.id,
      'providerResourceId', v_operation.provider_resource_id,
      'response', v_operation.response_payload
    );
  end if;

  if v_operation.status = 'processing'
     and v_operation.started_at >= now() - interval '5 minutes' then
    return jsonb_build_object(
      'ok', true,
      'proceed', false,
      'inProgress', true,
      'operationId', v_operation.id
    );
  end if;

  update public.platform_billing_provider_operations
  set
    status = 'processing',
    attempts = attempts + 1,
    started_at = now(),
    completed_at = null,
    last_error = null,
    tenant_id = coalesce(tenant_id, p_tenant_id),
    contract_id = coalesce(contract_id, p_contract_id),
    charge_id = coalesce(charge_id, p_charge_id),
    request_payload = coalesce(p_request_payload, request_payload)
  where id = v_operation.id
  returning * into v_operation;

  return jsonb_build_object(
    'ok', true,
    'proceed', true,
    'reclaimed', true,
    'operationId', v_operation.id,
    'attempt', v_operation.attempts
  );
end;
$function$;

drop function if exists public.complete_platform_billing_provider_operation(
  uuid, text, text, jsonb, text
);
create function public.complete_platform_billing_provider_operation(
  p_operation_id uuid,
  p_status text,
  p_provider_resource_id text,
  p_response_payload jsonb,
  p_error text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_operation public.platform_billing_provider_operations%rowtype;
begin
  if p_status not in ('succeeded', 'failed', 'unknown') then
    raise exception 'Situação final da operação inválida.';
  end if;

  update public.platform_billing_provider_operations
  set
    status = p_status,
    provider_resource_id = coalesce(
      nullif(btrim(coalesce(p_provider_resource_id, '')), ''),
      provider_resource_id
    ),
    response_payload = coalesce(p_response_payload, '{}'::jsonb),
    completed_at = now(),
    last_error = case
      when p_status = 'succeeded' then null
      else left(coalesce(p_error, 'Falha não informada.'), 4000)
    end
  where id = p_operation_id
    and status = 'processing'
  returning * into v_operation;

  if not found then
    raise exception 'Operação não encontrada ou não está em processamento.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'operationId', v_operation.id,
    'status', v_operation.status,
    'providerResourceId', v_operation.provider_resource_id
  );
end;
$function$;

drop function if exists public.apply_platform_billing_suspensions(date);
create function public.apply_platform_billing_suspensions(
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

  return v_count;
end;
$function$;

-- O cron guarda somente a chamada desta funcao. URL e segredo sao lidos do
-- Vault a cada execucao e nunca aparecem em cron.job ou nos logs da migration.
create or replace function private.invoke_platform_billing_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker_url text;
  v_worker_secret text;
  v_request_id bigint;
begin
  select decrypted_secret
  into v_worker_url
  from vault.decrypted_secrets
  where name = 'linkup_asaas_worker_url'
  limit 1;

  select decrypted_secret
  into v_worker_secret
  from vault.decrypted_secrets
  where name = 'linkup_asaas_worker_secret'
  limit 1;

  if nullif(btrim(coalesce(v_worker_url, '')), '') is null
     or nullif(btrim(coalesce(v_worker_secret, '')), '') is null then
    return null;
  end if;

  select net.http_post(
    url := v_worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-linkup-worker-secret', v_worker_secret
    ),
    body := jsonb_build_object('action', 'run', 'limit', 50),
    timeout_milliseconds := 25000
  )
  into v_request_id;

  return v_request_id;
end;
$function$;

drop function if exists public.get_platform_billing_worker_health();
create function public.get_platform_billing_worker_health()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job record;
  v_latest public.platform_billing_worker_runs%rowtype;
  v_last_success timestamptz;
  v_url_configured boolean := false;
  v_secret_configured boolean := false;
  v_pending bigint := 0;
  v_failed bigint := 0;
  v_dead_letter bigint := 0;
begin
  select
    j.jobid,
    j.schedule,
    j.active,
    r.status as cron_status,
    r.start_time as cron_started_at,
    r.end_time as cron_finished_at,
    r.return_message
  into v_job
  from cron.job j
  left join lateral (
    select d.status, d.start_time, d.end_time, d.return_message
    from cron.job_run_details d
    where d.jobid = j.jobid
    order by d.start_time desc
    limit 1
  ) r on true
  where j.jobname = 'linkup-asaas-worker'
  order by j.jobid desc
  limit 1;

  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'linkup_asaas_worker_url'
      and nullif(btrim(decrypted_secret), '') is not null
  ) into v_url_configured;

  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'linkup_asaas_worker_secret'
      and nullif(btrim(decrypted_secret), '') is not null
  ) into v_secret_configured;

  select *
  into v_latest
  from public.platform_billing_worker_runs
  order by started_at desc
  limit 1;

  select max(completed_at)
  into v_last_success
  from public.platform_billing_worker_runs
  where status = 'succeeded';

  select
    count(*) filter (where processing_status in ('pending', 'processing')),
    count(*) filter (where processing_status = 'failed'),
    count(*) filter (where processing_status = 'dead_letter')
  into v_pending, v_failed, v_dead_letter
  from public.platform_billing_webhook_events;

  return jsonb_build_object(
    'schedulerConfigured', coalesce(v_job.active, false) and v_url_configured and v_secret_configured,
    'healthy',
      coalesce(v_job.active, false)
      and v_url_configured
      and v_secret_configured
      and v_latest.status = 'succeeded'
      and v_latest.completed_at >= now() - interval '3 minutes',
    'status', coalesce(v_latest.status, v_job.cron_status, 'never_run'),
    'schedule', v_job.schedule,
    'lastRunAt', coalesce(v_latest.started_at, v_job.cron_started_at),
    'lastSuccessAt', v_last_success,
    'error', coalesce(v_latest.error_message, v_job.return_message),
    'vaultUrlConfigured', v_url_configured,
    'vaultSecretConfigured', v_secret_configured,
    'queue', jsonb_build_object(
      'pending', v_pending,
      'failed', v_failed,
      'deadLetter', v_dead_letter
    )
  );
end;
$function$;

do $block$
declare
  v_url_secret_id uuid;
  v_job_id bigint;
begin
  select id
  into v_url_secret_id
  from vault.secrets
  where name = 'linkup_asaas_worker_url'
  limit 1;

  if v_url_secret_id is null then
    perform vault.create_secret(
      'https://dcysbrxooqibozgctprn.supabase.co/functions/v1/asaas-worker',
      'linkup_asaas_worker_url',
      'URL interna do worker de cobranca B2B do LinkUp Studio'
    );
  else
    perform vault.update_secret(
      v_url_secret_id,
      'https://dcysbrxooqibozgctprn.supabase.co/functions/v1/asaas-worker',
      'linkup_asaas_worker_url',
      'URL interna do worker de cobranca B2B do LinkUp Studio'
    );
  end if;

  for v_job_id in
    select jobid from cron.job where jobname = 'linkup-asaas-worker'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'linkup-asaas-worker',
    '* * * * *',
    $cron$select private.invoke_platform_billing_worker()$cron$
  );
end;
$block$;

drop function if exists public.apply_platform_billing_webhook_event(text, text, jsonb);

do $block$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'platform_billing_settings',
    'platform_billing_plans',
    'tenant_billing_provider_customers',
    'platform_billing_contracts',
    'platform_billing_charges',
    'platform_billing_webhook_events',
    'platform_billing_provider_operations',
    'platform_billing_worker_runs',
    'platform_billing_audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);

    v_policy := 'super_admins_read_' || v_table;
    execute format('drop policy if exists %I on public.%I', v_policy, v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_super_admin((select auth.uid())))',
      v_policy,
      v_table
    );

    execute format('revoke all on table public.%I from public', v_table);
    execute format('revoke all on table public.%I from anon', v_table);
    execute format('revoke all on table public.%I from authenticated', v_table);
    execute format('grant select on table public.%I to authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
  end loop;
end;
$block$;

revoke execute on function private.set_platform_billing_updated_at()
  from public, anon, authenticated;
revoke execute on function private.prepare_platform_billing_charge()
  from public, anon, authenticated;
revoke execute on function private.invoke_platform_billing_worker()
  from public, anon, authenticated;

revoke execute on function public.ingest_platform_billing_webhook_event(
  text, text, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.ingest_platform_billing_webhook_event(
  text, text, text, text, text, timestamptz, jsonb
) to service_role;

revoke execute on function public.claim_platform_billing_webhook_events(
  text, integer, text
) from public, anon, authenticated;
grant execute on function public.claim_platform_billing_webhook_events(
  text, integer, text
) to service_role;

revoke execute on function public.process_platform_billing_webhook_event(uuid)
  from public, anon, authenticated;
grant execute on function public.process_platform_billing_webhook_event(uuid)
  to service_role;

revoke execute on function public.apply_platform_billing_charge_state(
  uuid, text, text, timestamptz, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.apply_platform_billing_charge_state(
  uuid, text, text, timestamptz, text, text, text, text, uuid
) to service_role;

revoke execute on function public.fail_platform_billing_webhook_event(
  uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.fail_platform_billing_webhook_event(
  uuid, text, integer
) to service_role;

revoke execute on function public.begin_platform_billing_provider_operation(
  text, text, text, uuid, uuid, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.begin_platform_billing_provider_operation(
  text, text, text, uuid, uuid, uuid, text, jsonb
) to service_role;

revoke execute on function public.complete_platform_billing_provider_operation(
  uuid, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.complete_platform_billing_provider_operation(
  uuid, text, text, jsonb, text
) to service_role;

revoke execute on function public.apply_platform_billing_suspensions(date)
  from public, anon, authenticated;
grant execute on function public.apply_platform_billing_suspensions(date)
  to service_role;

revoke execute on function public.get_platform_billing_worker_health()
  from public, anon, authenticated;
grant execute on function public.get_platform_billing_worker_health()
  to service_role;

commit;
