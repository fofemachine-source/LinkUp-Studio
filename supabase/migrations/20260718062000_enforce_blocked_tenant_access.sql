-- Enforce tenant suspension in the database as well as in the application UI.
-- A blocked tenant remains readable enough to render the access screen, while
-- all business mutations are denied. Platform super admins and service-role
-- automations keep access so payments can reactivate a tenant.

begin;

create or replace function private.is_tenant_member(
  _user_id uuid,
  _tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_super_admin(_user_id)
    or exists (
      select 1
      from public.user_roles ur
      join public.tenants t on t.id = ur.tenant_id
      where ur.user_id = _user_id
        and ur.tenant_id = _tenant_id
        and coalesce(t.status, 'active') <> 'blocked'
    );
$$;

revoke all on function private.is_tenant_member(uuid, uuid)
from public, anon;
grant execute on function private.is_tenant_member(uuid, uuid)
to authenticated, service_role;

create or replace function private.can_manage_tenant_operations(
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_super_admin((select auth.uid()))
    or (
      private.is_tenant_member((select auth.uid()), p_tenant_id)
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = (select auth.uid())
          and ur.tenant_id = p_tenant_id
          and ur.role in ('owner'::public.app_role, 'staff'::public.app_role)
      )
    );
$$;

revoke all on function private.can_manage_tenant_operations(uuid)
from public, anon;
grant execute on function private.can_manage_tenant_operations(uuid)
to authenticated, service_role;

-- Members must still be able to read their tenant row after suspension so the
-- client can explain the block. This policy deliberately checks raw membership
-- instead of private.is_tenant_member(), whose operational semantics now deny
-- blocked tenants.
drop policy if exists "members view own tenant" on public.tenants;
create policy "members view own tenant"
on public.tenants
for select
to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.tenant_id = tenants.id
  )
);

-- Owners can maintain identity data while active, but cannot reactivate or
-- change billing-controlled columns themselves.
drop policy if exists "owner updates tenant" on public.tenants;
drop policy if exists "owner updates active tenant" on public.tenants;
create policy "owner updates active tenant"
on public.tenants
for update
to authenticated
using (
  private.is_tenant_member((select auth.uid()), id)
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.tenant_id = tenants.id
      and ur.role = 'owner'::public.app_role
  )
)
with check (
  private.is_tenant_member((select auth.uid()), id)
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.tenant_id = tenants.id
      and ur.role = 'owner'::public.app_role
  )
);

create or replace function private.enforce_tenant_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role'
     or private.is_super_admin((select auth.uid()))
     or (
       (select auth.uid()) is null
       and current_user in ('postgres', 'supabase_admin', 'service_role')
     ) then
    return new;
  end if;

  if old.status = 'blocked' then
    raise exception using
      errcode = '42501',
      message = 'Este salão está bloqueado. Regularize o acesso antes de continuar.';
  end if;

  if new.status is distinct from old.status
     or new.status_reason is distinct from old.status_reason
     or new.billing_blocked_at is distinct from old.billing_blocked_at
     or new.plan is distinct from old.plan
     or new.plan_expires_at is distinct from old.plan_expires_at then
    raise exception using
      errcode = '42501',
      message = 'Somente a administração da plataforma pode alterar o status ou o plano do salão.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_tenant_billing_columns()
from public, anon, authenticated;

drop trigger if exists enforce_tenant_billing_columns on public.tenants;
create trigger enforce_tenant_billing_columns
before update on public.tenants
for each row execute function private.enforce_tenant_billing_columns();

create or replace function private.enforce_operational_tenant_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_tenant_id uuid;
  v_new_tenant_id uuid;
begin
  if (select auth.role()) = 'service_role'
     or private.is_super_admin((select auth.uid()))
     or (
       (select auth.uid()) is null
       and current_user in ('postgres', 'supabase_admin', 'service_role')
     ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old_tenant_id := nullif(to_jsonb(old) ->> 'tenant_id', '')::uuid;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_tenant_id := nullif(to_jsonb(new) ->> 'tenant_id', '')::uuid;
  end if;

  if exists (
    select 1
    from public.tenants t
    where t.id in (v_old_tenant_id, v_new_tenant_id)
      and t.status = 'blocked'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Este salão está bloqueado. Regularize o acesso antes de continuar.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_operational_tenant_write()
from public, anon, authenticated;

-- Cover every existing tenant-scoped business table, including SECURITY
-- DEFINER RPC paths. Service-role billing/webhook jobs bypass this trigger and
-- can therefore receive a payment and reactivate a suspended tenant.
do $$
declare
  relation record;
begin
  for relation in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attname = 'tenant_id'
      and not a.attisdropped
  loop
    execute format(
      'drop trigger if exists enforce_operational_tenant_write on %I.%I',
      relation.schema_name,
      relation.table_name
    );
    execute format(
      'create trigger enforce_operational_tenant_write before insert or update or delete on %I.%I for each row execute function private.enforce_operational_tenant_write()',
      relation.schema_name,
      relation.table_name
    );
  end loop;
end;
$$;

commit;
