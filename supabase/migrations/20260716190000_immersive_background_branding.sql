begin;

create or replace function private.can_manage_tenant_identity(
  p_user_id uuid,
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_super_admin(p_user_id)
    or exists (
      select 1
      from public.user_roles
      where user_id = p_user_id
        and tenant_id = p_tenant_id
        and role in ('owner'::public.app_role, 'staff'::public.app_role)
    );
$$;

revoke all on function private.can_manage_tenant_identity(uuid, uuid)
from public, anon;
grant execute on function private.can_manage_tenant_identity(uuid, uuid)
to authenticated, service_role;

create table if not exists public.tenant_booking_branding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  background_asset_id uuid,
  background_source_path text,
  background_mobile_path text,
  background_tablet_path text,
  background_desktop_path text,
  background_source_mime text
    check (
      background_source_mime is null
      or background_source_mime in ('image/jpeg', 'image/png', 'image/webp')
    ),
  background_source_size bigint
    check (
      background_source_size is null
      or background_source_size between 1 and 10485760
    ),
  background_source_width integer
    check (background_source_width is null or background_source_width > 0),
  background_source_height integer
    check (background_source_height is null or background_source_height > 0),
  hero_slogan text not null default 'Sua melhor versão começa aqui.'
    check (char_length(hero_slogan) <= 160),
  mobile_position_mode text not null default 'center'
    check (mobile_position_mode in ('center', 'top', 'bottom', 'left', 'right', 'free')),
  mobile_position_x smallint not null default 50
    check (mobile_position_x between 0 and 100),
  mobile_position_y smallint not null default 50
    check (mobile_position_y between 0 and 100),
  mobile_zoom numeric(4, 2) not null default 0
    check (mobile_zoom between 0 and 2),
  desktop_position_mode text not null default 'center'
    check (desktop_position_mode in ('center', 'top', 'bottom', 'left', 'right', 'free')),
  desktop_position_x smallint not null default 50
    check (desktop_position_x between 0 and 100),
  desktop_position_y smallint not null default 50
    check (desktop_position_y between 0 and 100),
  desktop_zoom numeric(4, 2) not null default 0
    check (desktop_zoom between 0 and 2),
  overlay_opacity smallint not null default 52
    check (overlay_opacity between 0 and 90),
  show_logo boolean not null default true,
  show_name boolean not null default true,
  show_subtitle boolean not null default true,
  show_slogan boolean not null default true,
  show_subscriber_badge boolean not null default true,
  show_subscription_summary boolean not null default true,
  show_primary_button boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_booking_branding_paths_consistent check (
    (
      background_asset_id is null
      and background_source_path is null
      and background_mobile_path is null
      and background_tablet_path is null
      and background_desktop_path is null
      and background_source_mime is null
      and background_source_size is null
      and background_source_width is null
      and background_source_height is null
    )
    or
    (
      background_asset_id is not null
      and background_source_path is not null
      and background_mobile_path is not null
      and background_tablet_path is not null
      and background_desktop_path is not null
      and background_source_mime is not null
      and background_source_size is not null
      and background_source_width is not null
      and background_source_height is not null
    )
  ),
  constraint tenant_booking_branding_paths_scoped check (
    background_asset_id is null
    or (
      background_source_path =
        tenant_id::text || '/immersive/' || background_asset_id::text || '/source.' ||
        case background_source_mime
          when 'image/jpeg' then 'jpg'
          when 'image/png' then 'png'
          when 'image/webp' then 'webp'
        end
      and background_mobile_path =
        tenant_id::text || '/immersive/' || background_asset_id::text || '/mobile.webp'
      and background_tablet_path =
        tenant_id::text || '/immersive/' || background_asset_id::text || '/tablet.webp'
      and background_desktop_path =
        tenant_id::text || '/immersive/' || background_asset_id::text || '/desktop.webp'
    )
  )
);

insert into public.tenant_booking_branding (tenant_id)
select id
from public.tenants
on conflict (tenant_id) do nothing;

create or replace function private.touch_tenant_booking_branding()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by, old.updated_by);
  return new;
end;
$$;

revoke all on function private.touch_tenant_booking_branding()
from public, anon, authenticated;
grant execute on function private.touch_tenant_booking_branding()
to service_role;

drop trigger if exists tenant_booking_branding_touch
on public.tenant_booking_branding;
create trigger tenant_booking_branding_touch
before update on public.tenant_booking_branding
for each row execute function private.touch_tenant_booking_branding();

create or replace function private.seed_tenant_booking_branding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_booking_branding (tenant_id)
  values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

revoke all on function private.seed_tenant_booking_branding()
from public, anon, authenticated;
grant execute on function private.seed_tenant_booking_branding()
to service_role;

drop trigger if exists tenants_seed_booking_branding on public.tenants;
create trigger tenants_seed_booking_branding
after insert on public.tenants
for each row execute function private.seed_tenant_booking_branding();

alter table public.tenant_booking_branding enable row level security;

revoke all on public.tenant_booking_branding from anon, authenticated;
grant select, insert, update on public.tenant_booking_branding to authenticated;
grant all on public.tenant_booking_branding to service_role;

drop policy if exists "tenant members read booking branding"
on public.tenant_booking_branding;
create policy "tenant members read booking branding"
on public.tenant_booking_branding for select to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);

drop policy if exists "tenant managers create booking branding"
on public.tenant_booking_branding;
create policy "tenant managers create booking branding"
on public.tenant_booking_branding for insert to authenticated
with check (
  private.can_manage_tenant_identity((select auth.uid()), tenant_id)
);

drop policy if exists "tenant managers update booking branding"
on public.tenant_booking_branding;
create policy "tenant managers update booking branding"
on public.tenant_booking_branding for update to authenticated
using (
  private.can_manage_tenant_identity((select auth.uid()), tenant_id)
)
with check (
  private.can_manage_tenant_identity((select auth.uid()), tenant_id)
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
(
  'booking-branding-source',
  'booking-branding-source',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
),
(
  'booking-branding-public',
  'booking-branding-public',
  true,
  6291456,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_manage_booking_branding_object(
  p_user_id uuid,
  p_object_name text,
  p_object_kind text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_uuid_pattern constant text :=
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if p_object_kind = 'source' then
    if p_object_name !~* (
      '^' || v_uuid_pattern || '/immersive/' || v_uuid_pattern ||
      '/source\.(jpe?g|png|webp)$'
    ) then
      return false;
    end if;
  elsif p_object_kind = 'public' then
    if p_object_name !~* (
      '^' || v_uuid_pattern || '/immersive/' || v_uuid_pattern ||
      '/(mobile|tablet|desktop)\.webp$'
    ) then
      return false;
    end if;
  else
    return false;
  end if;

  v_tenant_id := split_part(p_object_name, '/', 1)::uuid;
  return private.can_manage_tenant_identity(p_user_id, v_tenant_id);
end;
$$;

revoke all on function private.can_manage_booking_branding_object(uuid, text, text)
from public, anon;
grant execute on function private.can_manage_booking_branding_object(uuid, text, text)
to authenticated, service_role;

drop policy if exists "tenant managers read booking branding source"
on storage.objects;
drop policy if exists "tenant managers upload booking branding source"
on storage.objects;
drop policy if exists "tenant managers delete booking branding source"
on storage.objects;
drop policy if exists "tenant managers upload booking branding public"
on storage.objects;
drop policy if exists "tenant managers delete booking branding public"
on storage.objects;

create policy "tenant managers read booking branding source"
on storage.objects for select to authenticated
using (
  bucket_id = 'booking-branding-source'
  and private.can_manage_booking_branding_object(
    (select auth.uid()),
    name,
    'source'
  )
);

create policy "tenant managers upload booking branding source"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'booking-branding-source'
  and private.can_manage_booking_branding_object(
    (select auth.uid()),
    name,
    'source'
  )
);

create policy "tenant managers delete booking branding source"
on storage.objects for delete to authenticated
using (
  bucket_id = 'booking-branding-source'
  and private.can_manage_booking_branding_object(
    (select auth.uid()),
    name,
    'source'
  )
);

create policy "tenant managers upload booking branding public"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'booking-branding-public'
  and private.can_manage_booking_branding_object(
    (select auth.uid()),
    name,
    'public'
  )
);

create policy "tenant managers delete booking branding public"
on storage.objects for delete to authenticated
using (
  bucket_id = 'booking-branding-public'
  and private.can_manage_booking_branding_object(
    (select auth.uid()),
    name,
    'public'
  )
);

comment on table public.tenant_booking_branding is
  'Identidade visual pública e Background Imersivo do agendamento de cada salão.';
comment on column public.tenant_booking_branding.mobile_zoom is
  'Zoom adicional da imagem mobile. Zero representa o enquadramento original sem aproximação extra.';
comment on column public.tenant_booking_branding.desktop_zoom is
  'Zoom adicional da imagem desktop. Zero representa o enquadramento original sem aproximação extra.';

commit;
