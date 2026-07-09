
-- 1. Move SECURITY DEFINER helpers into a private schema (not exposed by PostgREST)
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_super_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role='super_admin')
$$;

create or replace function private.is_tenant_member(_user_id uuid, _tenant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and tenant_id=_tenant_id)
$$;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

grant execute on function private.is_super_admin(uuid) to anon, authenticated, service_role;
grant execute on function private.is_tenant_member(uuid, uuid) to anon, authenticated, service_role;
grant execute on function private.has_role(uuid, public.app_role) to anon, authenticated, service_role;

-- 2. Rewrite RLS policies to use private.* helpers and drop anon exposure

-- profiles
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select
  using (id = auth.uid() or private.is_super_admin(auth.uid()));

-- tenants
drop policy if exists "members view own tenant" on public.tenants;
drop policy if exists "public booking read by slug" on public.tenants;
drop policy if exists "super admin all" on public.tenants;
create policy "members view own tenant" on public.tenants for select
  using (private.is_tenant_member(auth.uid(), id) or private.is_super_admin(auth.uid()));
create policy "super admin all" on public.tenants for all
  using (private.is_super_admin(auth.uid()))
  with check (private.is_super_admin(auth.uid()));

-- user_roles
drop policy if exists "view own roles" on public.user_roles;
drop policy if exists "super admin manage roles" on public.user_roles;
create policy "view own roles" on public.user_roles for select
  using (user_id = auth.uid() or private.is_super_admin(auth.uid()));
create policy "super admin manage roles" on public.user_roles for all
  using (private.is_super_admin(auth.uid()))
  with check (private.is_super_admin(auth.uid()));

-- clients
drop policy if exists "public insert client during booking" on public.clients;
drop policy if exists "tenant members manage clients" on public.clients;
create policy "tenant members manage clients" on public.clients for all
  using (private.is_tenant_member(auth.uid(), tenant_id))
  with check (private.is_tenant_member(auth.uid(), tenant_id));

-- professionals (keep anon read of active pros - non-sensitive; rewrite manage policy)
drop policy if exists "tenant members manage pros" on public.professionals;
create policy "tenant members manage pros" on public.professionals for all
  using (private.is_tenant_member(auth.uid(), tenant_id))
  with check (private.is_tenant_member(auth.uid(), tenant_id));

-- services
drop policy if exists "tenant members manage services" on public.services;
create policy "tenant members manage services" on public.services for all
  using (private.is_tenant_member(auth.uid(), tenant_id))
  with check (private.is_tenant_member(auth.uid(), tenant_id));

-- products
drop policy if exists "tenant members manage products" on public.products;
create policy "tenant members manage products" on public.products for all
  using (private.is_tenant_member(auth.uid(), tenant_id))
  with check (private.is_tenant_member(auth.uid(), tenant_id));

-- subscribers
drop policy if exists "public read subs for validation" on public.subscribers;
drop policy if exists "tenant members manage subs" on public.subscribers;
create policy "tenant members manage subs" on public.subscribers for all
  using (private.is_tenant_member(auth.uid(), tenant_id))
  with check (private.is_tenant_member(auth.uid(), tenant_id));

-- appointments
drop policy if exists "public insert appt from booking" on public.appointments;
drop policy if exists "public read appts availability" on public.appointments;
drop policy if exists "tenant members manage appts" on public.appointments;
create policy "tenant members manage appts" on public.appointments for all
  using (private.is_tenant_member(auth.uid(), tenant_id))
  with check (private.is_tenant_member(auth.uid(), tenant_id));

-- commandas
drop policy if exists "tenant members manage commandas" on public.commandas;
create policy "tenant members manage commandas" on public.commandas for all
  using (private.is_tenant_member(auth.uid(), tenant_id))
  with check (private.is_tenant_member(auth.uid(), tenant_id));

-- commanda_items
drop policy if exists "tenant members manage commanda items" on public.commanda_items;
create policy "tenant members manage commanda items" on public.commanda_items for all
  using (private.is_tenant_member(auth.uid(), tenant_id))
  with check (private.is_tenant_member(auth.uid(), tenant_id));

-- cash_movements
drop policy if exists "tenant members cashflow" on public.cash_movements;
create policy "tenant members cashflow" on public.cash_movements for all
  using (private.is_tenant_member(auth.uid(), tenant_id))
  with check (private.is_tenant_member(auth.uid(), tenant_id));

-- tenant_settings
drop policy if exists "public read settings" on public.tenant_settings;
drop policy if exists "tenant members settings" on public.tenant_settings;
create policy "tenant members settings" on public.tenant_settings for all
  using (private.is_tenant_member(auth.uid(), tenant_id))
  with check (private.is_tenant_member(auth.uid(), tenant_id));

-- 3. Drop original public-schema SECURITY DEFINER helpers now that policies moved
drop function if exists public.is_super_admin(uuid);
drop function if exists public.is_tenant_member(uuid, uuid);
drop function if exists public.has_role(uuid, public.app_role);

-- 4. Storage policies: scope to tenant membership via path prefix (first folder = tenant id)
drop policy if exists "anon read assets" on storage.objects;
drop policy if exists "authenticated read assets" on storage.objects;
drop policy if exists "authenticated upload assets" on storage.objects;
drop policy if exists "authenticated update own assets" on storage.objects;
drop policy if exists "authenticated delete own assets" on storage.objects;

create policy "tenant members read assets" on storage.objects for select to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] is not null
    and private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "tenant members upload assets" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] is not null
    and private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "tenant members update assets" on storage.objects for update to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] is not null
    and private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] is not null
    and private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "tenant members delete assets" on storage.objects for delete to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] is not null
    and private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
