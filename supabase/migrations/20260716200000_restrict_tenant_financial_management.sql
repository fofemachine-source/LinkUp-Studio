begin;

-- Operações financeiras e configurações administrativas pertencem somente à
-- gestão da loja. Profissionais continuam podendo consultar as próprias
-- comissões, mas não podem alterar regras, contas, pagamentos ou assinaturas.
create or replace function private.can_manage_tenant_operations(
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_super_admin((select auth.uid()))
    or exists (
      select 1
      from public.user_roles
      where user_id = (select auth.uid())
        and tenant_id = p_tenant_id
        and role in ('owner'::public.app_role, 'staff'::public.app_role)
    );
$$;

revoke all on function private.can_manage_tenant_operations(uuid)
from public, anon;
grant execute on function private.can_manage_tenant_operations(uuid)
to authenticated, service_role;

create or replace function private.can_read_professional_commission(
  p_tenant_id uuid,
  p_professional_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.can_manage_tenant_operations(p_tenant_id)
    or exists (
      select 1
      from public.professionals
      where id = p_professional_id
        and tenant_id = p_tenant_id
        and auth_user_id = (select auth.uid())
    );
$$;

revoke all on function private.can_read_professional_commission(uuid, uuid)
from public, anon;
grant execute on function private.can_read_professional_commission(uuid, uuid)
to authenticated, service_role;

create or replace function private.can_read_commission_settlement(
  p_tenant_id uuid,
  p_settlement_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.can_manage_tenant_operations(p_tenant_id)
    or exists (
      select 1
      from public.commission_settlements as settlement
      join public.professionals as professional
        on professional.id = settlement.professional_id
       and professional.tenant_id = settlement.tenant_id
      where settlement.id = p_settlement_id
        and settlement.tenant_id = p_tenant_id
        and professional.auth_user_id = (select auth.uid())
    );
$$;

revoke all on function private.can_read_commission_settlement(uuid, uuid)
from public, anon;
grant execute on function private.can_read_commission_settlement(uuid, uuid)
to authenticated, service_role;

-- O cadastro do profissional contém campos administrativos sensíveis, como
-- vínculo com auth.users, percentual de comissão e centro de custo.
drop policy if exists "tenant members manage pros" on public.professionals;
drop policy if exists "tenant members read pros" on public.professionals;
drop policy if exists "tenant managers manage pros" on public.professionals;
create policy "tenant members read pros"
on public.professionals for select to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);
create policy "tenant managers manage pros"
on public.professionals for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

-- O PDV continua consultável pelos membros da loja para preservar as telas
-- operacionais, mas fechamento, itens e composição de pagamento ficam sob a
-- gestão. Isso impede alteração direta de valores após o fechamento.
drop policy if exists "tenant members manage commandas" on public.commandas;
drop policy if exists "tenant members read commandas" on public.commandas;
drop policy if exists "tenant managers manage commandas" on public.commandas;
create policy "tenant members read commandas"
on public.commandas for select to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);
create policy "tenant managers manage commandas"
on public.commandas for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members manage commanda items"
on public.commanda_items;
drop policy if exists "tenant members read commanda items"
on public.commanda_items;
drop policy if exists "tenant managers manage commanda items"
on public.commanda_items;
create policy "tenant members read commanda items"
on public.commanda_items for select to authenticated
using (
  private.is_tenant_member((select auth.uid()), tenant_id)
  or private.is_super_admin((select auth.uid()))
);
create policy "tenant managers manage commanda items"
on public.commanda_items for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members manage commanda payments"
on public.commanda_payments;
drop policy if exists "tenant managers manage commanda payments"
on public.commanda_payments;
create policy "tenant managers manage commanda payments"
on public.commanda_payments for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

-- register_subscription_usage é SECURITY DEFINER para conseguir renovar saldos.
-- Portanto o guard precisa validar explicitamente a função administrativa e não
-- pode depender apenas das policies da tabela.
create or replace function private.enforce_subscription_usage_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'anon'
     or (
       coalesce((select auth.role()), '') = 'authenticated'
       and not private.can_manage_tenant_operations(new.tenant_id)
     ) then
    raise exception 'Seu perfil não pode registrar consumo nesta assinatura.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_subscription_usage_access()
from public, anon, authenticated;
grant execute on function private.enforce_subscription_usage_access()
to service_role;

-- Dados completos de contratos e consumo VIP contêm informações financeiras e
-- pessoais. A agenda continua usando appointments.is_vip, sem depender dessas
-- tabelas.
drop policy if exists "tenant members read client subscriptions"
on public.client_subscriptions;
drop policy if exists "subscription managers read client subscriptions"
on public.client_subscriptions;
create policy "subscription managers read client subscriptions"
on public.client_subscriptions for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members read subscription usages"
on public.subscription_usages;
drop policy if exists "subscription managers read subscription usages"
on public.subscription_usages;
create policy "subscription managers read subscription usages"
on public.subscription_usages for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

-- O bucket assets também guarda fotos e arquivos operacionais comuns. Somente
-- as subpastas de comprovantes exigem perfil gestor; os demais caminhos mantêm
-- o comportamento atual para membros da loja.
create or replace function private.can_access_tenant_asset(
  p_user_id uuid,
  p_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with asset_path as (
    select storage.foldername(p_name) as parts
  )
  select case
    when parts[1] is null
      or parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then false
    when parts[2] in ('commission-proofs', 'payable-proofs')
      then private.can_manage_tenant_operations(parts[1]::uuid)
    else
      private.is_tenant_member(p_user_id, parts[1]::uuid)
      or private.is_super_admin(p_user_id)
  end
  from asset_path;
$$;

revoke all on function private.can_access_tenant_asset(uuid, text)
from public, anon;
grant execute on function private.can_access_tenant_asset(uuid, text)
to authenticated, service_role;

drop policy if exists "tenant members read assets" on storage.objects;
drop policy if exists "tenant members upload assets" on storage.objects;
drop policy if exists "tenant members update assets" on storage.objects;
drop policy if exists "tenant members delete assets" on storage.objects;

create policy "tenant members read assets"
on storage.objects for select to authenticated
using (
  bucket_id = 'assets'
  and private.can_access_tenant_asset((select auth.uid()), name)
);

create policy "tenant members upload assets"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'assets'
  and private.can_access_tenant_asset((select auth.uid()), name)
);

create policy "tenant members update assets"
on storage.objects for update to authenticated
using (
  bucket_id = 'assets'
  and private.can_access_tenant_asset((select auth.uid()), name)
)
with check (
  bucket_id = 'assets'
  and private.can_access_tenant_asset((select auth.uid()), name)
);

create policy "tenant members delete assets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'assets'
  and private.can_access_tenant_asset((select auth.uid()), name)
);

-- Caixa e cadastros financeiros.
drop policy if exists "tenant members cashflow" on public.cash_movements;
drop policy if exists "tenant managers manage cashflow" on public.cash_movements;
create policy "tenant managers manage cashflow"
on public.cash_movements for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members manage financial accounts"
on public.financial_accounts;
drop policy if exists "tenant managers manage financial accounts"
on public.financial_accounts;
create policy "tenant managers manage financial accounts"
on public.financial_accounts for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members manage financial categories"
on public.financial_categories;
drop policy if exists "tenant managers manage financial categories"
on public.financial_categories;
create policy "tenant managers manage financial categories"
on public.financial_categories for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members manage cost centers"
on public.cost_centers;
drop policy if exists "tenant managers manage cost centers"
on public.cost_centers;
create policy "tenant managers manage cost centers"
on public.cost_centers for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

-- Regras são administrativas. Lançamentos e pagamentos podem ser consultados
-- pelo próprio profissional, mas somente gestores podem alterá-los.
drop policy if exists "tenant members manage commission rules"
on public.commission_rules;
drop policy if exists "tenant managers manage commission rules"
on public.commission_rules;
create policy "tenant managers manage commission rules"
on public.commission_rules for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members manage commission entries"
on public.commission_entries;
drop policy if exists "professionals read own commission entries"
on public.commission_entries;
drop policy if exists "tenant managers manage commission entries"
on public.commission_entries;
create policy "professionals read own commission entries"
on public.commission_entries for select to authenticated
using (
  private.can_read_professional_commission(tenant_id, professional_id)
);
create policy "tenant managers manage commission entries"
on public.commission_entries for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members manage commission settlements"
on public.commission_settlements;
drop policy if exists "professionals read own commission settlements"
on public.commission_settlements;
drop policy if exists "tenant managers manage commission settlements"
on public.commission_settlements;
create policy "professionals read own commission settlements"
on public.commission_settlements for select to authenticated
using (
  private.can_read_professional_commission(tenant_id, professional_id)
);
create policy "tenant managers manage commission settlements"
on public.commission_settlements for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members manage commission settlement items"
on public.commission_settlement_items;
drop policy if exists "professionals read own commission settlement items"
on public.commission_settlement_items;
drop policy if exists "tenant managers manage commission settlement items"
on public.commission_settlement_items;
create policy "professionals read own commission settlement items"
on public.commission_settlement_items for select to authenticated
using (
  private.can_read_commission_settlement(tenant_id, settlement_id)
);
create policy "tenant managers manage commission settlement items"
on public.commission_settlement_items for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members manage commission adjustments"
on public.commission_adjustments;
drop policy if exists "professionals read own commission adjustments"
on public.commission_adjustments;
drop policy if exists "tenant managers manage commission adjustments"
on public.commission_adjustments;
create policy "professionals read own commission adjustments"
on public.commission_adjustments for select to authenticated
using (
  private.can_read_professional_commission(tenant_id, professional_id)
);
create policy "tenant managers manage commission adjustments"
on public.commission_adjustments for all to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant members read financial audit"
on public.financial_audit_log;
drop policy if exists "tenant members append financial audit"
on public.financial_audit_log;
drop policy if exists "tenant managers read financial audit"
on public.financial_audit_log;
drop policy if exists "tenant managers append financial audit"
on public.financial_audit_log;
create policy "tenant managers read financial audit"
on public.financial_audit_log for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));
create policy "tenant managers append financial audit"
on public.financial_audit_log for insert to authenticated
with check (private.can_manage_tenant_operations(tenant_id));

-- Planos, benefícios e configuração do módulo de assinaturas não são
-- configurações operacionais do profissional.
drop policy if exists "tenant members manage subscription plans"
on public.subscription_plans;
drop policy if exists "subscription managers manage plans"
on public.subscription_plans;
create policy "subscription managers manage plans"
on public.subscription_plans for all to authenticated
using (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
)
with check (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
);

drop policy if exists "tenant members manage subscription benefits"
on public.subscription_plan_benefits;
drop policy if exists "subscription managers manage benefits"
on public.subscription_plan_benefits;
create policy "subscription managers manage benefits"
on public.subscription_plan_benefits for all to authenticated
using (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
)
with check (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
);

drop policy if exists "tenant members manage subscription settings"
on public.subscription_module_settings;
drop policy if exists "subscription managers manage settings"
on public.subscription_module_settings;
create policy "subscription managers manage settings"
on public.subscription_module_settings for all to authenticated
using (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
)
with check (
  private.can_manage_subscription_payments((select auth.uid()), tenant_id)
);

commit;
