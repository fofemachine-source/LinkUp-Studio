begin;

-- Keep operational reads available to tenant members, while every financial
-- mutation remains restricted to the platform admin or the tenant management
-- roles accepted by private.can_manage_tenant_operations().  Splitting the
-- previous FOR ALL policies makes the intended permission for each action
-- explicit and prevents a broad policy from masking a stricter one.

alter table public.commandas enable row level security;
alter table public.commanda_items enable row level security;
alter table public.commanda_payments enable row level security;

-- A manager may only attach an item/payment to a commanda from the same
-- tenant.  The original single-column foreign keys guaranteed that the
-- commanda existed, but did not guarantee that both tenant_id values matched.
create unique index if not exists commandas_id_tenant_uidx
  on public.commandas (id, tenant_id);

create index if not exists commanda_items_commanda_tenant_idx
  on public.commanda_items (commanda_id, tenant_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'commanda_items_commanda_tenant_fk'
      and conrelid = 'public.commanda_items'::regclass
  ) then
    alter table public.commanda_items
      add constraint commanda_items_commanda_tenant_fk
      foreign key (commanda_id, tenant_id)
      references public.commandas (id, tenant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'commanda_payments_commanda_tenant_fk'
      and conrelid = 'public.commanda_payments'::regclass
  ) then
    alter table public.commanda_payments
      add constraint commanda_payments_commanda_tenant_fk
      foreign key (commanda_id, tenant_id)
      references public.commandas (id, tenant_id)
      on delete cascade
      not valid;
  end if;
end
$$;

alter table public.commanda_items
  validate constraint commanda_items_commanda_tenant_fk;
alter table public.commanda_payments
  validate constraint commanda_payments_commanda_tenant_fk;

grant select, insert, update, delete on table public.commandas to authenticated;
grant select, insert, update, delete on table public.commanda_items to authenticated;
grant select, insert, delete on table public.commanda_payments to authenticated;
revoke update on table public.commanda_payments from authenticated;

-- Commandas
drop policy if exists "tenant members manage commandas" on public.commandas;
drop policy if exists "tenant managers manage commandas" on public.commandas;
drop policy if exists "tenant members read commandas" on public.commandas;
drop policy if exists "tenant managers insert commandas" on public.commandas;
drop policy if exists "tenant managers update commandas" on public.commandas;
drop policy if exists "tenant managers delete commandas" on public.commandas;

create policy "tenant members read commandas"
on public.commandas for select to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or private.is_tenant_member((select auth.uid()), tenant_id)
);

create policy "tenant managers insert commandas"
on public.commandas for insert to authenticated
with check (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers update commandas"
on public.commandas for update to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers delete commandas"
on public.commandas for delete to authenticated
using (private.can_manage_tenant_operations(tenant_id));

-- Items da comanda
drop policy if exists "tenant members manage commanda items" on public.commanda_items;
drop policy if exists "tenant managers manage commanda items" on public.commanda_items;
drop policy if exists "tenant members read commanda items" on public.commanda_items;
drop policy if exists "tenant managers insert commanda items" on public.commanda_items;
drop policy if exists "tenant managers update commanda items" on public.commanda_items;
drop policy if exists "tenant managers delete commanda items" on public.commanda_items;

create policy "tenant members read commanda items"
on public.commanda_items for select to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or private.is_tenant_member((select auth.uid()), tenant_id)
);

create policy "tenant managers insert commanda items"
on public.commanda_items for insert to authenticated
with check (
  private.can_manage_tenant_operations(tenant_id)
  and exists (
    select 1
    from public.commandas as parent_commanda
    where parent_commanda.id = commanda_items.commanda_id
      and parent_commanda.tenant_id = commanda_items.tenant_id
  )
);

create policy "tenant managers update commanda items"
on public.commanda_items for update to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (
  private.can_manage_tenant_operations(tenant_id)
  and exists (
    select 1
    from public.commandas as parent_commanda
    where parent_commanda.id = commanda_items.commanda_id
      and parent_commanda.tenant_id = commanda_items.tenant_id
  )
);

create policy "tenant managers delete commanda items"
on public.commanda_items for delete to authenticated
using (private.can_manage_tenant_operations(tenant_id));

-- Pagamentos da comanda
drop policy if exists "tenant members manage commanda payments" on public.commanda_payments;
drop policy if exists "tenant managers manage commanda payments" on public.commanda_payments;
drop policy if exists "tenant managers read commanda payments" on public.commanda_payments;
drop policy if exists "tenant managers insert commanda payments" on public.commanda_payments;
drop policy if exists "tenant managers update commanda payments" on public.commanda_payments;
drop policy if exists "tenant managers delete commanda payments" on public.commanda_payments;

create policy "tenant managers read commanda payments"
on public.commanda_payments for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers insert commanda payments"
on public.commanda_payments for insert to authenticated
with check (
  private.can_manage_tenant_operations(tenant_id)
  and exists (
    select 1
    from public.commandas as parent_commanda
    where parent_commanda.id = commanda_payments.commanda_id
      and parent_commanda.tenant_id = commanda_payments.tenant_id
  )
);

create policy "tenant managers delete commanda payments"
on public.commanda_payments for delete to authenticated
using (private.can_manage_tenant_operations(tenant_id));

comment on table public.customer_booking_accounts is
  'Credential table intentionally restricted to service_role. Public booking uses trusted TanStack server functions and an HttpOnly customer session cookie.';

comment on table public.client_subscriptions is
  'Customer self-service is mediated by trusted booking server functions after validating the tenant-scoped HttpOnly customer session; direct browser access is intentionally disabled.';

comment on table public.subscription_charges is
  'Customer self-service is mediated by trusted booking server functions or a short-lived payment token; direct browser access is intentionally disabled.';

commit;
