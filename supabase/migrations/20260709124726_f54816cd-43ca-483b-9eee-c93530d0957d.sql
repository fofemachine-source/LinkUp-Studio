ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS professionals_auth_user_id_key
ON public.professionals (auth_user_id)
WHERE auth_user_id IS NOT NULL;