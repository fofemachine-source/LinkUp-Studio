-- Unblock tenant Ernesth due to billing overdue
update tenants
set status = 'active',
    status_reason = null,
    billing_blocked_at = null,
    plan_expires_at = now() + interval '30 days'
where id = 'db172c59-6220-493f-9ea3-98fb5b6d61ac';
