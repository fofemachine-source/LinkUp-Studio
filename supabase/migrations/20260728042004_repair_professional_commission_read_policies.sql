begin;

create or replace function private.current_professional_ids(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns table(id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  with caller as (
    select
      (select auth.uid()) as uid,
      nullif(lower(trim((select auth.jwt() ->> 'email'))), '') as email
  )
  select professional.id
  from public.professionals as professional
  cross join caller
  where professional.tenant_id = p_tenant_id
    and professional.active is true
    and p_user_id = caller.uid
    and (
      professional.auth_user_id = p_user_id
      or (
        professional.auth_user_id is null
        and caller.email is not null
        and professional.email is not null
        and lower(trim(professional.email)) = caller.email
      )
    )
  order by
    (professional.auth_user_id = p_user_id) desc,
    professional.created_at asc;
$function$;

create or replace function private.current_professional_id(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select ids.id
  from private.current_professional_ids(p_tenant_id, p_user_id) as ids
  limit 1;
$function$;

create or replace function private.can_manage_commission_finance(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.professional_has_permission(p_tenant_id, 'commissions', p_user_id)
    or private.professional_has_permission(p_tenant_id, 'finance_general', p_user_id);
$function$;

create or replace function private.can_operate_commission_entries(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.can_manage_commission_finance(p_tenant_id, p_user_id)
    or private.professional_has_permission(p_tenant_id, 'commandas', p_user_id);
$function$;

create or replace function private.can_read_professional_commission(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.can_manage_commission_finance(p_tenant_id, p_user_id)
    or exists (
      select 1
      from private.current_professional_ids(p_tenant_id, p_user_id) as ids
      where ids.id = p_professional_id
    );
$function$;

revoke all on function private.current_professional_ids(uuid, uuid)
from public, anon;
revoke all on function private.current_professional_id(uuid, uuid)
from public, anon;
revoke all on function private.can_manage_commission_finance(uuid, uuid)
from public, anon;
revoke all on function private.can_operate_commission_entries(uuid, uuid)
from public, anon;
revoke all on function private.can_read_professional_commission(uuid, uuid, uuid)
from public, anon;

grant execute on function private.current_professional_ids(uuid, uuid)
to authenticated, service_role;
grant execute on function private.current_professional_id(uuid, uuid)
to authenticated, service_role;
grant execute on function private.can_manage_commission_finance(uuid, uuid)
to authenticated, service_role;
grant execute on function private.can_operate_commission_entries(uuid, uuid)
to authenticated, service_role;
grant execute on function private.can_read_professional_commission(uuid, uuid, uuid)
to authenticated, service_role;

grant select, insert, update, delete on public.commission_rules to authenticated;
grant select, insert, update, delete on public.commission_entries to authenticated;
grant select, insert, update, delete on public.commission_settlements to authenticated;
grant select, insert, update, delete on public.commission_settlement_items to authenticated;
grant select, insert, update, delete on public.commission_adjustments to authenticated;

drop policy if exists "tenant members manage commission rules"
on public.commission_rules;
drop policy if exists "tenant managers manage commission rules"
on public.commission_rules;
drop policy if exists "authorized managers manage commission rules"
on public.commission_rules;

create policy "authorized managers manage commission rules"
on public.commission_rules for all to authenticated
using (private.can_manage_commission_finance(tenant_id, (select auth.uid())))
with check (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

drop policy if exists "tenant members manage commission entries"
on public.commission_entries;
drop policy if exists "professionals read own commission entries"
on public.commission_entries;
drop policy if exists "tenant managers manage commission entries"
on public.commission_entries;
drop policy if exists "tenant managers read commission entries"
on public.commission_entries;
drop policy if exists "tenant managers insert commission entries"
on public.commission_entries;
drop policy if exists "tenant managers update commission entries"
on public.commission_entries;
drop policy if exists "tenant managers delete commission entries"
on public.commission_entries;
drop policy if exists "authorized users read commission entries"
on public.commission_entries;
drop policy if exists "authorized operators insert commission entries"
on public.commission_entries;
drop policy if exists "authorized operators update commission entries"
on public.commission_entries;
drop policy if exists "authorized managers delete commission entries"
on public.commission_entries;

create policy "authorized users read commission entries"
on public.commission_entries for select to authenticated
using (
  private.can_read_professional_commission(tenant_id, professional_id, (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
);

create policy "authorized operators insert commission entries"
on public.commission_entries for insert to authenticated
with check (private.can_operate_commission_entries(tenant_id, (select auth.uid())));

create policy "authorized operators update commission entries"
on public.commission_entries for update to authenticated
using (private.can_operate_commission_entries(tenant_id, (select auth.uid())))
with check (private.can_operate_commission_entries(tenant_id, (select auth.uid())));

create policy "authorized managers delete commission entries"
on public.commission_entries for delete to authenticated
using (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

drop policy if exists "tenant members manage commission settlements"
on public.commission_settlements;
drop policy if exists "professionals read own commission settlements"
on public.commission_settlements;
drop policy if exists "tenant managers manage commission settlements"
on public.commission_settlements;
drop policy if exists "authorized users read commission settlements"
on public.commission_settlements;
drop policy if exists "authorized managers insert commission settlements"
on public.commission_settlements;
drop policy if exists "authorized managers update commission settlements"
on public.commission_settlements;
drop policy if exists "authorized managers delete commission settlements"
on public.commission_settlements;

create policy "authorized users read commission settlements"
on public.commission_settlements for select to authenticated
using (private.can_read_professional_commission(tenant_id, professional_id, (select auth.uid())));

create policy "authorized managers insert commission settlements"
on public.commission_settlements for insert to authenticated
with check (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

create policy "authorized managers update commission settlements"
on public.commission_settlements for update to authenticated
using (private.can_manage_commission_finance(tenant_id, (select auth.uid())))
with check (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

create policy "authorized managers delete commission settlements"
on public.commission_settlements for delete to authenticated
using (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

drop policy if exists "tenant members manage commission settlement items"
on public.commission_settlement_items;
drop policy if exists "professionals read own commission settlement items"
on public.commission_settlement_items;
drop policy if exists "tenant managers manage commission settlement items"
on public.commission_settlement_items;
drop policy if exists "authorized users read commission settlement items"
on public.commission_settlement_items;
drop policy if exists "authorized managers insert commission settlement items"
on public.commission_settlement_items;
drop policy if exists "authorized managers update commission settlement items"
on public.commission_settlement_items;
drop policy if exists "authorized managers delete commission settlement items"
on public.commission_settlement_items;

create policy "authorized users read commission settlement items"
on public.commission_settlement_items for select to authenticated
using (
  exists (
    select 1
    from public.commission_settlements as settlement
    where settlement.id = commission_settlement_items.settlement_id
      and settlement.tenant_id = commission_settlement_items.tenant_id
      and private.can_read_professional_commission(
        settlement.tenant_id,
        settlement.professional_id,
        (select auth.uid())
      )
  )
);

create policy "authorized managers insert commission settlement items"
on public.commission_settlement_items for insert to authenticated
with check (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

create policy "authorized managers update commission settlement items"
on public.commission_settlement_items for update to authenticated
using (private.can_manage_commission_finance(tenant_id, (select auth.uid())))
with check (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

create policy "authorized managers delete commission settlement items"
on public.commission_settlement_items for delete to authenticated
using (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

drop policy if exists "tenant members manage commission adjustments"
on public.commission_adjustments;
drop policy if exists "professionals read own commission adjustments"
on public.commission_adjustments;
drop policy if exists "tenant managers manage commission adjustments"
on public.commission_adjustments;
drop policy if exists "authorized users read commission adjustments"
on public.commission_adjustments;
drop policy if exists "authorized managers insert commission adjustments"
on public.commission_adjustments;
drop policy if exists "authorized managers update commission adjustments"
on public.commission_adjustments;
drop policy if exists "authorized managers delete commission adjustments"
on public.commission_adjustments;

create policy "authorized users read commission adjustments"
on public.commission_adjustments for select to authenticated
using (private.can_read_professional_commission(tenant_id, professional_id, (select auth.uid())));

create policy "authorized managers insert commission adjustments"
on public.commission_adjustments for insert to authenticated
with check (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

create policy "authorized managers update commission adjustments"
on public.commission_adjustments for update to authenticated
using (private.can_manage_commission_finance(tenant_id, (select auth.uid())))
with check (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

create policy "authorized managers delete commission adjustments"
on public.commission_adjustments for delete to authenticated
using (private.can_manage_commission_finance(tenant_id, (select auth.uid())));

notify pgrst, 'reload schema';

commit;
