begin;

alter table public.services
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists image_url text,
  add column if not exists display_order integer;

comment on column public.services.category is
  'Optional category used to group services in the admin catalog and booking showcase.';
comment on column public.services.description is
  'Optional public description shown on the booking service card.';
comment on column public.services.image_url is
  'Optional service image URL shown on the booking service card.';
comment on column public.services.display_order is
  'Optional manual order for the service catalog.';

create index if not exists services_tenant_active_category_order_idx
  on public.services (tenant_id, active, category, display_order, name);

notify pgrst, 'reload schema';

commit;
