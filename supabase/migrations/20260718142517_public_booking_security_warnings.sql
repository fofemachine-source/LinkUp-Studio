begin;

-- Lovable security review: the public booking flow can show subscription/VIP
-- choices, but anonymous visitors must only see presentation-safe, active plan
-- summaries. The actual customer contract validation remains server-side.
revoke all on public.subscription_plans from anon;
grant select (
  id,
  tenant_id,
  name,
  description,
  category,
  image_url,
  status,
  model,
  session_limit,
  max_per_month,
  max_per_week,
  max_per_day,
  allow_multiple_same_day,
  allow_reschedule,
  allow_cancellation,
  allow_rollover,
  sessions_expire,
  session_validity_days,
  duration_days,
  price,
  billing_cycle,
  booking_show_name,
  booking_show_benefits,
  booking_show_remaining,
  booking_show_validity,
  booking_show_discount,
  included_services_only,
  allow_extras
) on public.subscription_plans to anon;

drop policy if exists "public booking read active subscription plan summaries"
on public.subscription_plans;
create policy "public booking read active subscription plan summaries"
on public.subscription_plans
for select
to anon
using (
  status = 'active'
  and exists (
    select 1
    from public.tenants as tenant
    where tenant.id = subscription_plans.tenant_id
      and coalesce(tenant.status, 'active') <> 'blocked'
  )
);

-- The public branding bucket stores only generated WEBP variants used by the
-- booking page. Source uploads stay in the private source bucket.
grant select on storage.objects to anon, authenticated;

drop policy if exists "public read booking branding generated variants"
on storage.objects;
create policy "public read booking branding generated variants"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'booking-branding-public'
  and name ~* (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' ||
    '/immersive/' ||
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' ||
    '/(mobile|tablet|desktop)\.webp$'
  )
);

commit;
