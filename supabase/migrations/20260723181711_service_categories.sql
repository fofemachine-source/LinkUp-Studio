begin;

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  display_order integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_categories_name_not_blank check (length(btrim(name)) > 0)
);

alter table public.services
add column if not exists category_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_category_id_fkey'
      and conrelid = 'public.services'::regclass
  ) then
    alter table public.services
    add constraint services_category_id_fkey
    foreign key (category_id)
    references public.service_categories(id)
    on delete set null;
  end if;
end $$;

create unique index if not exists service_categories_tenant_name_key
on public.service_categories (tenant_id, lower(btrim(name)));

create index if not exists service_categories_tenant_active_order_idx
on public.service_categories (tenant_id, active, display_order, name);

create index if not exists services_tenant_category_id_order_idx
on public.services (tenant_id, category_id, display_order, name);

create or replace function private.set_service_categories_updated_at()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists service_categories_updated_at on public.service_categories;
create trigger service_categories_updated_at
before update on public.service_categories
for each row
execute function private.set_service_categories_updated_at();

with normalized_categories as (
  select
    tenant_id,
    btrim(category) as name,
    min(display_order) as display_order,
    row_number() over (
      partition by tenant_id, lower(btrim(category))
      order by min(display_order) nulls last, btrim(category)
    ) as row_number
  from public.services
  where category is not null
    and length(btrim(category)) > 0
  group by tenant_id, lower(btrim(category)), btrim(category)
)
insert into public.service_categories (tenant_id, name, display_order, active)
select tenant_id, name, display_order, true
from normalized_categories
where row_number = 1
on conflict do nothing;

update public.services service
set category_id = category.id
from public.service_categories category
where service.category_id is null
  and service.tenant_id = category.tenant_id
  and service.category is not null
  and lower(btrim(service.category)) = lower(btrim(category.name));

alter table public.service_categories enable row level security;

grant select on public.service_categories to anon;
grant select, insert, update, delete on public.service_categories to authenticated;
grant all on public.service_categories to service_role;

drop policy if exists "public can read active service categories" on public.service_categories;
create policy "public can read active service categories"
on public.service_categories
for select
to anon
using (active = true);

drop policy if exists "tenant members manage service categories" on public.service_categories;
create policy "tenant members manage service categories"
on public.service_categories
for all
to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id))
with check (private.is_tenant_member((select auth.uid()), tenant_id));

comment on table public.service_categories is 'Categorias cadastradas por salão para organizar os serviços exibidos na vitrine.';
comment on column public.services.category_id is 'Categoria estruturada do serviço. A coluna services.category continua como fallback legado.';

commit;
