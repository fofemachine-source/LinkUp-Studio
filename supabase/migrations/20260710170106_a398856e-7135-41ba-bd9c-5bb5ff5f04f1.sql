DROP POLICY IF EXISTS "public read pros" ON public.professionals;
DROP POLICY IF EXISTS "public read services" ON public.services;
REVOKE SELECT ON public.professionals FROM anon;
REVOKE SELECT ON public.services FROM anon;