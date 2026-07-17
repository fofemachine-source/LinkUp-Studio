-- Customer accounts for the public booking link.
-- Passwords and session tokens are handled only by trusted server functions;
-- the browser never receives direct access to these tables.

begin;

alter table public.clients
  add column if not exists cpf text;

alter table public.clients
  drop constraint if exists clients_cpf_format_check;
alter table public.clients
  add constraint clients_cpf_format_check
  check (cpf is null or cpf ~ '^[0-9]{11}$') not valid;

create unique index if not exists clients_tenant_cpf_unique_idx
  on public.clients (tenant_id, cpf)
  where cpf is not null;

create table if not exists public.customer_booking_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  cpf_hash text not null check (cpf_hash ~ '^[a-f0-9]{64}$'),
  password_hash text not null,
  whatsapp_consent_at timestamptz not null default now(),
  failed_login_attempts integer not null default 0
    check (failed_login_attempts between 0 and 1000),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, cpf_hash),
  unique (tenant_id, client_id)
);

create index if not exists customer_booking_accounts_client_idx
  on public.customer_booking_accounts (client_id);

create table if not exists public.customer_booking_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (account_id, tenant_id)
    references public.customer_booking_accounts(id, tenant_id)
    on delete cascade
);

create index if not exists customer_booking_sessions_account_idx
  on public.customer_booking_sessions (account_id, expires_at desc);
create index if not exists customer_booking_sessions_expiry_idx
  on public.customer_booking_sessions (expires_at);

-- Explicit grants are required for new Supabase projects. Only the service
-- role may access credentials and sessions; there are deliberately no RLS
-- policies for browser roles.
revoke all on table public.customer_booking_accounts
  from public, anon, authenticated;
revoke all on table public.customer_booking_sessions
  from public, anon, authenticated;
grant all on table public.customer_booking_accounts to service_role;
grant all on table public.customer_booking_sessions to service_role;

alter table public.customer_booking_accounts enable row level security;
alter table public.customer_booking_sessions enable row level security;

create or replace function private.touch_customer_booking_account()
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

revoke all on function private.touch_customer_booking_account()
  from public, anon, authenticated;

drop trigger if exists touch_customer_booking_account
  on public.customer_booking_accounts;
create trigger touch_customer_booking_account
before update on public.customer_booking_accounts
for each row execute function private.touch_customer_booking_account();

-- Registration confirmation joins the existing WhatsApp delivery queue.
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
