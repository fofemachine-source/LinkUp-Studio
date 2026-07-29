begin;

-- The customer access-code fallback is triggered from the authenticated salon app.
-- Keep it unavailable to anonymous callers, but explicitly allow logged-in staff.
revoke all on function public.create_customer_booking_activation_code(uuid, uuid)
from public, anon;

grant execute on function public.create_customer_booking_activation_code(uuid, uuid)
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
