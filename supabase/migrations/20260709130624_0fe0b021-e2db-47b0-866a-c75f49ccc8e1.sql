
CREATE OR REPLACE FUNCTION private.is_tenant_owner(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND tenant_id = _tenant_id AND role = 'owner');
$$;

DROP POLICY IF EXISTS "owner manage staff roles" ON public.user_roles;
CREATE POLICY "owner manage staff roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (private.is_tenant_owner(auth.uid(), tenant_id))
  WITH CHECK (private.is_tenant_owner(auth.uid(), tenant_id));
