begin;

-- Estas funções são executadas apenas por triggers internos. Elas não fazem
-- parte da API pública e não devem ser chamadas diretamente por clientes.
revoke execute
on function public.apply_cash_movement_financial_defaults()
from public, anon, authenticated;

revoke execute
on function public.seed_tenant_financial_defaults()
from public, anon, authenticated;

grant execute
on function public.apply_cash_movement_financial_defaults()
to service_role;

grant execute
on function public.seed_tenant_financial_defaults()
to service_role;

commit;
