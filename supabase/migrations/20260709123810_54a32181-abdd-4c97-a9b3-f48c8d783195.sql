
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS lunch_start time,
  ADD COLUMN IF NOT EXISTS lunch_end time;
