begin;

update public.tenant_booking_branding
set showcase_panel_opacity = least(100, greatest(0, coalesce(showcase_panel_opacity, 88)))
where showcase_panel_opacity is null
   or showcase_panel_opacity < 0
   or showcase_panel_opacity > 100;

alter table public.tenant_booking_branding
  drop constraint if exists tenant_booking_branding_showcase_panel_opacity_check;

alter table public.tenant_booking_branding
  add constraint tenant_booking_branding_showcase_panel_opacity_check
  check (showcase_panel_opacity between 0 and 100);

comment on column public.tenant_booking_branding.showcase_panel_opacity is
  'Opacidade percentual do vidro/painel da vitrine publica. Aceita 0 a 100; em 0 o vidro fica transparente.';

commit;
