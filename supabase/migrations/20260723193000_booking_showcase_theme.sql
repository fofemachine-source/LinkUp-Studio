begin;

alter table public.tenant_booking_branding
  add column if not exists showcase_theme text default 'dark',
  add column if not exists showcase_panel_opacity integer default 88;

update public.tenant_booking_branding
set
  showcase_theme = case
    when showcase_theme in ('dark', 'light') then showcase_theme
    else 'dark'
  end,
  showcase_panel_opacity = least(100, greatest(60, coalesce(showcase_panel_opacity, 88)));

alter table public.tenant_booking_branding
  alter column showcase_theme set not null,
  alter column showcase_panel_opacity set not null;

alter table public.tenant_booking_branding
  drop constraint if exists tenant_booking_branding_showcase_theme_check,
  drop constraint if exists tenant_booking_branding_showcase_panel_opacity_check;

alter table public.tenant_booking_branding
  add constraint tenant_booking_branding_showcase_theme_check
    check (showcase_theme in ('dark', 'light')),
  add constraint tenant_booking_branding_showcase_panel_opacity_check
    check (showcase_panel_opacity between 60 and 100);

comment on column public.tenant_booking_branding.showcase_theme is
  'Tema visual da vitrine publica de agendamento do tenant: dark ou light.';

comment on column public.tenant_booking_branding.showcase_panel_opacity is
  'Opacidade percentual do painel principal da vitrine publica, entre 60 e 100.';

commit;
