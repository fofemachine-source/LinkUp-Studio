
-- =========================================================
-- ROLES ENUM
-- =========================================================
create type public.app_role as enum ('super_admin','owner','staff','barber');

-- =========================================================
-- TENANTS (barbearias)
-- =========================================================
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  subtitle text default 'Soluções Premium',
  logo_url text,
  banner_url text,
  whatsapp text,
  address text,
  city text,
  state text,
  pix_key text,
  pix_holder text,
  primary_color text default '#2563eb',
  slot_minutes int default 30,
  status text default 'active', -- active | blocked | trial
  plan text default 'monthly',  -- monthly | yearly
  plan_expires_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tenants to authenticated;
grant all on public.tenants to service_role;
grant select on public.tenants to anon; -- needed for public booking page by slug
alter table public.tenants enable row level security;

-- =========================================================
-- USER ROLES (com tenant scope)
-- =========================================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- security definer helpers (no recursion)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

create or replace function public.is_tenant_member(_user_id uuid, _tenant_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and tenant_id=_tenant_id)
$$;

create or replace function public.is_super_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role='super_admin')
$$;

-- =========================================================
-- PROFILES
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  active_tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================
-- TENANT POLICIES (after helpers exist)
-- =========================================================
create policy "members view own tenant" on public.tenants for select
using (public.is_tenant_member(auth.uid(), id) or public.is_super_admin(auth.uid()));

create policy "public booking read by slug" on public.tenants for select
to anon using (true);

create policy "super admin all" on public.tenants for all
using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

create policy "owner updates tenant" on public.tenants for update
using (exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.tenant_id=id and ur.role='owner'));

-- user_roles policies
create policy "view own roles" on public.user_roles for select
using (user_id = auth.uid() or public.is_super_admin(auth.uid()));
create policy "super admin manage roles" on public.user_roles for all
using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
create policy "owner manage staff roles" on public.user_roles for all
using (exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.tenant_id=user_roles.tenant_id and ur.role='owner'))
with check (exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.tenant_id=user_roles.tenant_id and ur.role='owner'));

-- profiles policies
create policy "read own profile" on public.profiles for select using (id=auth.uid() or public.is_super_admin(auth.uid()));
create policy "update own profile" on public.profiles for update using (id=auth.uid());
create policy "insert own profile" on public.profiles for insert with check (id=auth.uid());

-- =========================================================
-- CLIENTS
-- =========================================================
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  whatsapp text,
  email text,
  address text,
  notes text,
  is_subscriber boolean default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.clients to authenticated;
grant all on public.clients to service_role;
grant select, insert on public.clients to anon; -- public booking allows creating clients
alter table public.clients enable row level security;
create policy "tenant members manage clients" on public.clients for all
using (public.is_tenant_member(auth.uid(), tenant_id)) with check (public.is_tenant_member(auth.uid(), tenant_id));
create policy "public insert client during booking" on public.clients for insert to anon with check (true);

-- =========================================================
-- PROFESSIONALS
-- =========================================================
create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  photo_url text,
  role_label text default 'Barbeiro',
  whatsapp text,
  commission_pct numeric default 45,
  active boolean default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.professionals to authenticated;
grant all on public.professionals to service_role;
grant select on public.professionals to anon;
alter table public.professionals enable row level security;
create policy "tenant members manage pros" on public.professionals for all
using (public.is_tenant_member(auth.uid(), tenant_id)) with check (public.is_tenant_member(auth.uid(), tenant_id));
create policy "public read pros" on public.professionals for select to anon using (active=true);

-- =========================================================
-- SERVICES
-- =========================================================
create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  price numeric not null default 0,
  duration_min int not null default 30,
  vip_only boolean default false,
  active boolean default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.services to authenticated;
grant all on public.services to service_role;
grant select on public.services to anon;
alter table public.services enable row level security;
create policy "tenant members manage services" on public.services for all
using (public.is_tenant_member(auth.uid(), tenant_id)) with check (public.is_tenant_member(auth.uid(), tenant_id));
create policy "public read services" on public.services for select to anon using (active=true);

-- =========================================================
-- PRODUCTS
-- =========================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  price numeric not null default 0,
  stock int default 0,
  active boolean default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "tenant members manage products" on public.products for all
using (public.is_tenant_member(auth.uid(), tenant_id)) with check (public.is_tenant_member(auth.uid(), tenant_id));

-- =========================================================
-- SUBSCRIBERS (VIP)
-- =========================================================
create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  full_name text not null,
  cpf text not null,
  whatsapp text,
  plan text default 'Corte',
  price numeric default 0,
  status text default 'active', -- active | overdue | blocked
  last_cut_at date,
  next_due_at date,
  created_at timestamptz not null default now(),
  unique (tenant_id, cpf)
);
grant select, insert, update, delete on public.subscribers to authenticated;
grant all on public.subscribers to service_role;
grant select on public.subscribers to anon; -- validation by cpf on booking
alter table public.subscribers enable row level security;
create policy "tenant members manage subs" on public.subscribers for all
using (public.is_tenant_member(auth.uid(), tenant_id)) with check (public.is_tenant_member(auth.uid(), tenant_id));
create policy "public read subs for validation" on public.subscribers for select to anon using (true);

-- =========================================================
-- APPOINTMENTS
-- =========================================================
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  client_name text,
  client_whatsapp text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text default 'confirmed', -- confirmed | done | canceled | noshow
  is_vip boolean default false,
  notes text,
  source text default 'manual', -- manual | online
  created_at timestamptz not null default now()
);
create index appointments_tenant_start_idx on public.appointments(tenant_id, start_at);
create index appointments_pro_start_idx on public.appointments(professional_id, start_at);
grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;
grant select, insert on public.appointments to anon;
alter table public.appointments enable row level security;
create policy "tenant members manage appts" on public.appointments for all
using (public.is_tenant_member(auth.uid(), tenant_id)) with check (public.is_tenant_member(auth.uid(), tenant_id));
create policy "public insert appt from booking" on public.appointments for insert to anon with check (true);
create policy "public read appts availability" on public.appointments for select to anon using (true);

-- =========================================================
-- COMMANDAS (ordens/comandas) e items
-- =========================================================
create table public.commandas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number int not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  status text default 'open', -- open | closed | canceled
  subtotal numeric default 0,
  discount numeric default 0,
  total numeric default 0,
  payment_method text, -- pix | dinheiro | cartao
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.commandas to authenticated;
grant all on public.commandas to service_role;
alter table public.commandas enable row level security;
create policy "tenant members manage commandas" on public.commandas for all
using (public.is_tenant_member(auth.uid(), tenant_id)) with check (public.is_tenant_member(auth.uid(), tenant_id));

create table public.commanda_items (
  id uuid primary key default gen_random_uuid(),
  commanda_id uuid not null references public.commandas(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null, -- service | product
  ref_id uuid,
  name text not null,
  quantity int default 1,
  unit_price numeric not null default 0,
  professional_id uuid references public.professionals(id) on delete set null,
  commission_pct numeric default 0,
  commission_value numeric default 0,
  commission_status text default 'pending', -- pending | paid
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.commanda_items to authenticated;
grant all on public.commanda_items to service_role;
alter table public.commanda_items enable row level security;
create policy "tenant members manage commanda items" on public.commanda_items for all
using (public.is_tenant_member(auth.uid(), tenant_id)) with check (public.is_tenant_member(auth.uid(), tenant_id));

-- =========================================================
-- CASHFLOW
-- =========================================================
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null, -- in | out
  amount numeric not null,
  description text,
  category text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cash_movements to authenticated;
grant all on public.cash_movements to service_role;
alter table public.cash_movements enable row level security;
create policy "tenant members cashflow" on public.cash_movements for all
using (public.is_tenant_member(auth.uid(), tenant_id)) with check (public.is_tenant_member(auth.uid(), tenant_id));

-- =========================================================
-- TENANT SETTINGS (opening hours / whatsapp / lunch)
-- =========================================================
create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  open_hour int default 8,
  close_hour int default 20,
  lunch_start int default 12,
  lunch_end int default 13,
  work_days int[] default '{1,2,3,4,5,6}', -- 0=sun..6=sat
  vip_days int[] default '{1,2,3,4}', -- seg-qui
  whatsapp_token text,
  whatsapp_instance text,
  message_client_template text default 'Olá {cliente}! Seu agendamento em {barbearia} está confirmado para {data} às {hora} com {profissional}.',
  message_pro_template text default 'Novo agendamento: {cliente} — {servico} — {data} {hora}.',
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tenant_settings to authenticated;
grant all on public.tenant_settings to service_role;
grant select on public.tenant_settings to anon;
alter table public.tenant_settings enable row level security;
create policy "tenant members settings" on public.tenant_settings for all
using (public.is_tenant_member(auth.uid(), tenant_id)) with check (public.is_tenant_member(auth.uid(), tenant_id));
create policy "public read settings" on public.tenant_settings for select to anon using (true);

-- =========================================================
-- Storage bucket via public: we'll create bucket separately with tool
-- =========================================================
