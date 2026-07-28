begin;

-- O endpoint Push pertence ao navegador/dispositivo e pode continuar igual
-- quando a operação alterna entre usuários da mesma loja no mesmo aparelho.
-- A política anterior só permitia atualizar linhas já vinculadas ao usuário atual,
-- causando 403 ao reativar notificações após troca de login.
drop policy if exists "users update own push subscriptions"
on public.push_subscriptions;

drop policy if exists "tenant members claim own push subscriptions"
on public.push_subscriptions;

create policy "tenant members claim own push subscriptions"
on public.push_subscriptions for update to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
)
with check (
  user_id = (select auth.uid())
  and private.is_tenant_member((select auth.uid()), tenant_id)
);

notify pgrst, 'reload schema';

commit;
