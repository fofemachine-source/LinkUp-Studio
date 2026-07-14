ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS work_days int[] DEFAULT '{1,2,3,4,5,6}';
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS blocked_dates text[] DEFAULT '{}';
