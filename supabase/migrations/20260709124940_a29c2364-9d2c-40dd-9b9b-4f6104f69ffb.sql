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
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE POLICY "tenant members upload assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'assets'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE POLICY "tenant members update assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'assets'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
)
WITH CHECK (
  bucket_id = 'assets'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE POLICY "tenant members delete assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'assets'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN private.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);