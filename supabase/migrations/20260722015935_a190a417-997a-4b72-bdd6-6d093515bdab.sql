CREATE OR REPLACE FUNCTION private.can_manage_tenant_operations(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    private.is_super_admin((select auth.uid()))
    or exists (
      select 1
      from public.user_roles
      where user_id = (select auth.uid())
        and tenant_id = p_tenant_id
        and role in ('owner'::public.app_role, 'staff'::public.app_role, 'barber'::public.app_role)
    );
$function$;