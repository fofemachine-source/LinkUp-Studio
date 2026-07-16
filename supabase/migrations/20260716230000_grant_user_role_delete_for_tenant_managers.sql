-- A policy RLS continua decidindo quais papéis podem ser removidos.
-- Este GRANT apenas permite que a exclusão autenticada alcance a policy
-- de proprietário/superadministrador já existente em public.user_roles.
grant delete on table public.user_roles to authenticated;
