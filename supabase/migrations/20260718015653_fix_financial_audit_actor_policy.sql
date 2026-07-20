begin;

drop policy if exists "tenant members append financial audit"
on public.financial_audit_log;

drop policy if exists "tenant managers append financial audit"
on public.financial_audit_log;

drop policy if exists "super admins append subscription financial audit"
on public.financial_audit_log;

drop policy if exists "tenant managers insert financial audit"
on public.financial_audit_log;

create policy "tenant managers insert financial audit"
on public.financial_audit_log for insert to authenticated
with check (
  private.can_manage_tenant_operations(tenant_id)
  and actor_user_id = (select auth.uid())
);

commit;
