DROP POLICY IF EXISTS "owner updates tenant" ON public.tenants;

CREATE POLICY "owner updates tenant"
ON public.tenants
FOR UPDATE
TO authenticated
USING (
  private.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = tenants.id
      AND ur.role IN ('owner'::app_role, 'staff'::app_role)
  )
)
WITH CHECK (
  private.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = tenants.id
      AND ur.role IN ('owner'::app_role, 'staff'::app_role)
  )
);

DROP POLICY IF EXISTS "tenant members read assets" ON storage.objects;
DROP POLICY IF EXISTS "tenant members upload assets" ON storage.objects;
DROP POLICY IF EXISTS "tenant members update assets" ON storage.objects;
DROP POLICY IF EXISTS "tenant members delete assets" ON storage.objects;

CREATE POLICY "tenant members read assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "tenant members upload assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "tenant members update assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "tenant members delete assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);