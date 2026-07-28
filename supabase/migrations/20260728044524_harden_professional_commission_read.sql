begin;

-- Centraliza a autorização de leitura financeira sem depender de joins da
-- interface. A função permanece no schema privado e valida que o identificador
-- recebido é o mesmo usuário autenticado antes de consultar qualquer vínculo.
create or replace function private.can_read_professional_commission_v2(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with caller as (
    select
      (select auth.uid()) as user_id,
      nullif(lower(trim((select auth.jwt() ->> 'email'))), '') as email
  )
  select
    p_user_id is not null
    and p_user_id = caller.user_id
    and (
      private.is_super_admin(p_user_id)
      or private.is_tenant_owner(p_user_id, p_tenant_id)
      or private.professional_has_permission(
        p_tenant_id,
        'commissions',
        p_user_id
      )
      or private.professional_has_permission(
        p_tenant_id,
        'finance_general',
        p_user_id
      )
      or exists (
        select 1
        from public.professionals as professional
        where professional.id = p_professional_id
          and professional.tenant_id = p_tenant_id
          and professional.active is true
          and (
            professional.auth_user_id = p_user_id
            or (
              professional.auth_user_id is null
              and caller.email is not null
              and professional.email is not null
              and lower(trim(professional.email)) = caller.email
            )
          )
      )
    )
  from caller;
$function$;

revoke all on function private.can_read_professional_commission_v2(uuid, uuid, uuid)
from public, anon;

grant execute on function private.can_read_professional_commission_v2(uuid, uuid, uuid)
to authenticated, service_role;

grant select on public.professionals to authenticated;
grant select on public.commission_entries to authenticated;
grant select on public.commission_settlements to authenticated;
grant select on public.commission_settlement_items to authenticated;
grant select on public.commission_adjustments to authenticated;

drop policy if exists "authorized users read professionals"
on public.professionals;

create policy "authorized users read professionals"
on public.professionals for select to authenticated
using (
  private.can_read_professional_commission_v2(
    tenant_id,
    id,
    (select auth.uid())
  )
  or private.professional_has_permission(
    tenant_id,
    'manage_staff',
    (select auth.uid())
  )
  or private.professional_has_permission(
    tenant_id,
    'agenda_all',
    (select auth.uid())
  )
);

drop policy if exists "tenant members manage commission entries"
on public.commission_entries;
drop policy if exists "professionals read own commission entries"
on public.commission_entries;
drop policy if exists "tenant managers manage commission entries"
on public.commission_entries;
drop policy if exists "tenant managers read commission entries"
on public.commission_entries;
drop policy if exists "authorized users read commission entries"
on public.commission_entries;

create policy "authorized users read commission entries"
on public.commission_entries for select to authenticated
using (
  private.can_read_professional_commission_v2(
    tenant_id,
    professional_id,
    (select auth.uid())
  )
);

drop policy if exists "tenant members manage commission settlements"
on public.commission_settlements;
drop policy if exists "professionals read own commission settlements"
on public.commission_settlements;
drop policy if exists "tenant managers manage commission settlements"
on public.commission_settlements;
drop policy if exists "tenant managers read commission settlements"
on public.commission_settlements;
drop policy if exists "authorized users read commission settlements"
on public.commission_settlements;

create policy "authorized users read commission settlements"
on public.commission_settlements for select to authenticated
using (
  private.can_read_professional_commission_v2(
    tenant_id,
    professional_id,
    (select auth.uid())
  )
);

drop policy if exists "tenant members manage commission settlement items"
on public.commission_settlement_items;
drop policy if exists "professionals read own commission settlement items"
on public.commission_settlement_items;
drop policy if exists "tenant managers manage commission settlement items"
on public.commission_settlement_items;
drop policy if exists "tenant managers read commission settlement items"
on public.commission_settlement_items;
drop policy if exists "authorized users read commission settlement items"
on public.commission_settlement_items;

create policy "authorized users read commission settlement items"
on public.commission_settlement_items for select to authenticated
using (
  exists (
    select 1
    from public.commission_settlements as settlement
    where settlement.id = commission_settlement_items.settlement_id
      and settlement.tenant_id = commission_settlement_items.tenant_id
      and private.can_read_professional_commission_v2(
        settlement.tenant_id,
        settlement.professional_id,
        (select auth.uid())
      )
  )
);

drop policy if exists "tenant members manage commission adjustments"
on public.commission_adjustments;
drop policy if exists "professionals read own commission adjustments"
on public.commission_adjustments;
drop policy if exists "tenant managers manage commission adjustments"
on public.commission_adjustments;
drop policy if exists "tenant managers read commission adjustments"
on public.commission_adjustments;
drop policy if exists "authorized users read commission adjustments"
on public.commission_adjustments;

create policy "authorized users read commission adjustments"
on public.commission_adjustments for select to authenticated
using (
  private.can_read_professional_commission_v2(
    tenant_id,
    professional_id,
    (select auth.uid())
  )
);

notify pgrst, 'reload schema';

commit;
