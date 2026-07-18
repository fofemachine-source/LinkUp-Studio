begin;

-- Older internal policies were created without an explicit TO clause.
-- PostgreSQL treats that as PUBLIC. Keep the public/anon booking policies
-- untouched, but scope tenant/business policies to authenticated users.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select
      schemaname,
      tablename,
      policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'tenants',
        'profiles',
        'user_roles',
        'clients',
        'professionals',
        'services',
        'products',
        'subscribers',
        'appointments',
        'commandas',
        'commanda_items',
        'tenant_settings'
      )
      and roles = array['public']::name[]
      and policyname not ilike 'public %'
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end $$;

-- The queue is normally processed by service_role/cron, but tenant managers
-- may enqueue, retry, cancel, or clean messages from their own tenant through
-- the app. Make those permissions explicit and tenant-scoped.
grant select, insert, update, delete
on table public.whatsapp_message_queue
to authenticated;

drop policy if exists "tenant managers read whatsapp queue"
on public.whatsapp_message_queue;

create policy "tenant managers read whatsapp queue"
on public.whatsapp_message_queue for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers insert whatsapp queue"
on public.whatsapp_message_queue;

create policy "tenant managers insert whatsapp queue"
on public.whatsapp_message_queue for insert to authenticated
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers update whatsapp queue"
on public.whatsapp_message_queue;

create policy "tenant managers update whatsapp queue"
on public.whatsapp_message_queue for update to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers delete whatsapp queue"
on public.whatsapp_message_queue;

create policy "tenant managers delete whatsapp queue"
on public.whatsapp_message_queue for delete to authenticated
using (private.can_manage_tenant_operations(tenant_id));

commit;
