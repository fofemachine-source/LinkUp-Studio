ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS closed_dates text[] DEFAULT '{}';
