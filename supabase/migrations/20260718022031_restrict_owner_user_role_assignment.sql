begin;

-- Tenant owners can manage access inside their own tenant, but they must never
-- be able to create, update, view through this manager policy, or delete the
-- platform-level super_admin role. Super admins keep their separate policy.

drop policy if exists "owner manage staff roles"
on public.user_roles;

drop policy if exists "owner read tenant staff roles"
on public.user_roles;

create policy "owner read tenant staff roles"
on public.user_roles for select to authenticated
using (
  private.is_tenant_owner((select auth.uid()), tenant_id)
  and role in (
    'owner'::public.app_role,
    'staff'::public.app_role,
    'barber'::public.app_role
  )
);

drop policy if exists "owner insert tenant staff roles"
on public.user_roles;

create policy "owner insert tenant staff roles"
on public.user_roles for insert to authenticated
with check (
  private.is_tenant_owner((select auth.uid()), tenant_id)
  and role in (
    'owner'::public.app_role,
    'staff'::public.app_role,
    'barber'::public.app_role
  )
);

drop policy if exists "owner update tenant staff roles"
on public.user_roles;

create policy "owner update tenant staff roles"
on public.user_roles for update to authenticated
using (
  private.is_tenant_owner((select auth.uid()), tenant_id)
  and role in (
    'owner'::public.app_role,
    'staff'::public.app_role,
    'barber'::public.app_role
  )
)
with check (
  private.is_tenant_owner((select auth.uid()), tenant_id)
  and role in (
    'owner'::public.app_role,
    'staff'::public.app_role,
    'barber'::public.app_role
  )
);

drop policy if exists "owner delete tenant staff roles"
on public.user_roles;

create policy "owner delete tenant staff roles"
on public.user_roles for delete to authenticated
using (
  private.is_tenant_owner((select auth.uid()), tenant_id)
  and role in (
    'owner'::public.app_role,
    'staff'::public.app_role,
    'barber'::public.app_role
  )
);

commit;
