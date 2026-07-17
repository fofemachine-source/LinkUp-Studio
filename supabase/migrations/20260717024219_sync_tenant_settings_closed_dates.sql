alter table public.tenant_settings
  add column if not exists closed_dates text[] default '{}'::text[];

update public.tenant_settings
set closed_dates = '{}'::text[]
where closed_dates is null;

alter table public.tenant_settings
  alter column closed_dates set default '{}'::text[],
  alter column closed_dates set not null;

notify pgrst, 'reload schema';
