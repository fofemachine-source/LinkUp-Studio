
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS vip_mode text NOT NULL DEFAULT 'strict';

DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'william.pinnheiro.g1@gmail.com' LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'super_admin')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
