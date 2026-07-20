
CREATE TABLE public.professional_time_off (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT TRUE,
  start_time TIME NULL,
  end_time TIME NULL,
  reason TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT professional_time_off_range_check CHECK (ends_on >= starts_on),
  CONSTRAINT professional_time_off_time_check CHECK (
    all_day = TRUE
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX professional_time_off_tenant_pro_idx
  ON public.professional_time_off (tenant_id, professional_id, starts_on, ends_on);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_time_off TO authenticated;
GRANT ALL ON public.professional_time_off TO service_role;

ALTER TABLE public.professional_time_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members view time off"
  ON public.professional_time_off
  FOR SELECT
  TO authenticated
  USING (private.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant owners insert time off"
  ON public.professional_time_off
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_tenant_owner(auth.uid(), tenant_id));

CREATE POLICY "tenant owners update time off"
  ON public.professional_time_off
  FOR UPDATE
  TO authenticated
  USING (private.is_tenant_owner(auth.uid(), tenant_id))
  WITH CHECK (private.is_tenant_owner(auth.uid(), tenant_id));

CREATE POLICY "tenant owners delete time off"
  ON public.professional_time_off
  FOR DELETE
  TO authenticated
  USING (private.is_tenant_owner(auth.uid(), tenant_id));

CREATE OR REPLACE FUNCTION public.set_updated_at_time_off()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER professional_time_off_set_updated_at
  BEFORE UPDATE ON public.professional_time_off
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_time_off();
