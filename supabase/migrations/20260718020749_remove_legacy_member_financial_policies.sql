begin;

-- Legacy member-wide policies were created before the financial/commission
-- module was tightened. RLS policies are OR'ed together, so these broad ALL
-- policies must be removed or they override the newer manager-scoped rules.

drop policy if exists "tenant members cashflow"
on public.cash_movements;

drop policy if exists "tenant members manage cashflow"
on public.cash_movements;

drop policy if exists "tenant members manage commission rules"
on public.commission_rules;

drop policy if exists "tenant members manage commission entries"
on public.commission_entries;

drop policy if exists "tenant members manage commission settlements"
on public.commission_settlements;

drop policy if exists "tenant members manage commission settlement items"
on public.commission_settlement_items;

drop policy if exists "tenant members manage commission adjustments"
on public.commission_adjustments;

drop policy if exists "tenant members read financial audit"
on public.financial_audit_log;

drop policy if exists "tenant members append financial audit"
on public.financial_audit_log;

-- Keep the intended manager-scoped financial audit policies present even if
-- the project received migrations manually in a different order.
drop policy if exists "tenant managers read financial audit"
on public.financial_audit_log;

create policy "tenant managers read financial audit"
on public.financial_audit_log for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers insert financial audit"
on public.financial_audit_log;

create policy "tenant managers insert financial audit"
on public.financial_audit_log for insert to authenticated
with check (
  private.can_manage_tenant_operations(tenant_id)
  and actor_user_id = (select auth.uid())
);

commit;
