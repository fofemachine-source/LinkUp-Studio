begin;

-- Prevent authenticated clients from spoofing audit attribution on inserts.
-- Updates remain manageable by tenant operators, but new records must be
-- attributed to the signed-in user through the auth.uid() default.

drop policy if exists "tenant managers manage cashflow" on public.cash_movements;
drop policy if exists "tenant managers read cashflow" on public.cash_movements;
drop policy if exists "tenant managers insert cashflow" on public.cash_movements;
drop policy if exists "tenant managers update cashflow" on public.cash_movements;
drop policy if exists "tenant managers delete cashflow" on public.cash_movements;

create policy "tenant managers read cashflow"
on public.cash_movements for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers insert cashflow"
on public.cash_movements for insert to authenticated
with check (
  private.can_manage_tenant_operations(tenant_id)
  and created_by = (select auth.uid())
);

create policy "tenant managers update cashflow"
on public.cash_movements for update to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers delete cashflow"
on public.cash_movements for delete to authenticated
using (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers manage commission rules" on public.commission_rules;
drop policy if exists "tenant managers read commission rules" on public.commission_rules;
drop policy if exists "tenant managers insert commission rules" on public.commission_rules;
drop policy if exists "tenant managers update commission rules" on public.commission_rules;
drop policy if exists "tenant managers delete commission rules" on public.commission_rules;

create policy "tenant managers read commission rules"
on public.commission_rules for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers insert commission rules"
on public.commission_rules for insert to authenticated
with check (
  private.can_manage_tenant_operations(tenant_id)
  and created_by = (select auth.uid())
);

create policy "tenant managers update commission rules"
on public.commission_rules for update to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers delete commission rules"
on public.commission_rules for delete to authenticated
using (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers manage commission entries" on public.commission_entries;
drop policy if exists "tenant managers read commission entries" on public.commission_entries;
drop policy if exists "tenant managers insert commission entries" on public.commission_entries;
drop policy if exists "tenant managers update commission entries" on public.commission_entries;
drop policy if exists "tenant managers delete commission entries" on public.commission_entries;

create policy "tenant managers read commission entries"
on public.commission_entries for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers insert commission entries"
on public.commission_entries for insert to authenticated
with check (
  private.can_manage_tenant_operations(tenant_id)
  and created_by = (select auth.uid())
);

create policy "tenant managers update commission entries"
on public.commission_entries for update to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers delete commission entries"
on public.commission_entries for delete to authenticated
using (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers manage commission settlements" on public.commission_settlements;
drop policy if exists "tenant managers read commission settlements" on public.commission_settlements;
drop policy if exists "tenant managers insert commission settlements" on public.commission_settlements;
drop policy if exists "tenant managers update commission settlements" on public.commission_settlements;
drop policy if exists "tenant managers delete commission settlements" on public.commission_settlements;

create policy "tenant managers read commission settlements"
on public.commission_settlements for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers insert commission settlements"
on public.commission_settlements for insert to authenticated
with check (
  private.can_manage_tenant_operations(tenant_id)
  and created_by = (select auth.uid())
);

create policy "tenant managers update commission settlements"
on public.commission_settlements for update to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers delete commission settlements"
on public.commission_settlements for delete to authenticated
using (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers manage commission adjustments" on public.commission_adjustments;
drop policy if exists "tenant managers read commission adjustments" on public.commission_adjustments;
drop policy if exists "tenant managers insert commission adjustments" on public.commission_adjustments;
drop policy if exists "tenant managers update commission adjustments" on public.commission_adjustments;
drop policy if exists "tenant managers delete commission adjustments" on public.commission_adjustments;

create policy "tenant managers read commission adjustments"
on public.commission_adjustments for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers insert commission adjustments"
on public.commission_adjustments for insert to authenticated
with check (
  private.can_manage_tenant_operations(tenant_id)
  and created_by = (select auth.uid())
);

create policy "tenant managers update commission adjustments"
on public.commission_adjustments for update to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

create policy "tenant managers delete commission adjustments"
on public.commission_adjustments for delete to authenticated
using (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers append financial audit" on public.financial_audit_log;
drop policy if exists "tenant managers insert financial audit" on public.financial_audit_log;

create policy "tenant managers insert financial audit"
on public.financial_audit_log for insert to authenticated
with check (
  private.can_manage_tenant_operations(tenant_id)
  and actor_user_id = (select auth.uid())
);

-- Customer booking credentials are intentionally service-role only. The public
-- booking flow reaches them through trusted server functions, never directly
-- from the browser.
drop policy if exists "service role manages customer booking accounts" on public.customer_booking_accounts;
create policy "service role manages customer booking accounts"
on public.customer_booking_accounts for all to service_role
using (true)
with check (true);

drop policy if exists "service role manages customer booking sessions" on public.customer_booking_sessions;
create policy "service role manages customer booking sessions"
on public.customer_booking_sessions for all to service_role
using (true)
with check (true);

drop policy if exists "service role manages customer booking rate limits" on public.customer_booking_rate_limits;
create policy "service role manages customer booking rate limits"
on public.customer_booking_rate_limits for all to service_role
using (true)
with check (true);

drop policy if exists "service role manages customer booking activation codes" on public.customer_booking_activation_codes;
create policy "service role manages customer booking activation codes"
on public.customer_booking_activation_codes for all to service_role
using (true)
with check (true);

comment on table public.customer_booking_accounts is
  'Service-role only credential table for public booking customer accounts.';
comment on table public.customer_booking_sessions is
  'Service-role only session table for public booking customer access.';
comment on table public.customer_booking_rate_limits is
  'Service-role only throttle table for public booking authentication.';
comment on table public.customer_booking_activation_codes is
  'Service-role only activation code table for public booking customer access.';

-- Use explicit role checks in policies so tenant branding writes do not rely
-- solely on an opaque helper function.
drop policy if exists "tenant members read booking branding" on public.tenant_booking_branding;
drop policy if exists "tenant managers create booking branding" on public.tenant_booking_branding;
drop policy if exists "tenant managers update booking branding" on public.tenant_booking_branding;
drop policy if exists "tenant members read booking branding direct" on public.tenant_booking_branding;
drop policy if exists "tenant managers create booking branding direct" on public.tenant_booking_branding;
drop policy if exists "tenant managers update booking branding direct" on public.tenant_booking_branding;

create policy "tenant members read booking branding direct"
on public.tenant_booking_branding for select to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.user_roles as role_row
    where role_row.user_id = (select auth.uid())
      and (
        role_row.role = 'super_admin'::public.app_role
        or role_row.tenant_id = tenant_booking_branding.tenant_id
      )
  )
);

create policy "tenant managers create booking branding direct"
on public.tenant_booking_branding for insert to authenticated
with check (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.user_roles as role_row
    where role_row.user_id = (select auth.uid())
      and (
        role_row.role = 'super_admin'::public.app_role
        or (
          role_row.tenant_id = tenant_booking_branding.tenant_id
          and role_row.role in ('owner'::public.app_role, 'staff'::public.app_role)
        )
      )
  )
);

create policy "tenant managers update booking branding direct"
on public.tenant_booking_branding for update to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.user_roles as role_row
    where role_row.user_id = (select auth.uid())
      and (
        role_row.role = 'super_admin'::public.app_role
        or (
          role_row.tenant_id = tenant_booking_branding.tenant_id
          and role_row.role in ('owner'::public.app_role, 'staff'::public.app_role)
        )
      )
  )
)
with check (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.user_roles as role_row
    where role_row.user_id = (select auth.uid())
      and (
        role_row.role = 'super_admin'::public.app_role
        or (
          role_row.tenant_id = tenant_booking_branding.tenant_id
          and role_row.role in ('owner'::public.app_role, 'staff'::public.app_role)
        )
      )
  )
);

commit;
