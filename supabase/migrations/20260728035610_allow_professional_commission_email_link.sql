begin;

-- Compatibilidade para historico de comissoes criado antes do vinculo de login.
-- O acesso continua restrito ao usuario autenticado: ele le o profissional
-- ligado por auth_user_id e, quando existir legado sem auth_user_id, tambem
-- o cadastro ativo do mesmo e-mail confirmado no Auth.

create or replace function private.current_professional_ids(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns table(id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  with caller as (
    select
      (select auth.uid()) as uid,
      nullif(lower(trim((select auth.jwt() ->> 'email'))), '') as email
  )
  select professional.id
  from public.professionals as professional
  cross join caller
  where professional.tenant_id = p_tenant_id
    and professional.active is true
    and p_user_id = caller.uid
    and (
      professional.auth_user_id = p_user_id
      or (
        professional.auth_user_id is null
        and caller.email is not null
        and professional.email is not null
        and lower(trim(professional.email)) = caller.email
      )
    )
  order by
    (professional.auth_user_id = p_user_id) desc,
    professional.created_at asc;
$function$;

create or replace function private.current_professional_id(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select ids.id
  from private.current_professional_ids(p_tenant_id, p_user_id) as ids
  limit 1;
$function$;

create or replace function private.can_manage_commission_finance(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.professional_has_permission(p_tenant_id, 'commissions', p_user_id)
    or private.professional_has_permission(p_tenant_id, 'finance_general', p_user_id);
$function$;

create or replace function private.can_read_professional_commission(
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
  select
    private.can_manage_commission_finance(p_tenant_id, p_user_id)
    or exists (
      select 1
      from private.current_professional_ids(p_tenant_id, p_user_id) as ids
      where ids.id = p_professional_id
    );
$function$;

revoke all on function private.current_professional_ids(uuid, uuid)
from public, anon;
revoke all on function private.current_professional_id(uuid, uuid)
from public, anon;
revoke all on function private.can_manage_commission_finance(uuid, uuid)
from public, anon;
revoke all on function private.can_read_professional_commission(uuid, uuid, uuid)
from public, anon;

grant execute on function private.current_professional_ids(uuid, uuid)
to authenticated, service_role;
grant execute on function private.current_professional_id(uuid, uuid)
to authenticated, service_role;
grant execute on function private.can_manage_commission_finance(uuid, uuid)
to authenticated, service_role;
grant execute on function private.can_read_professional_commission(uuid, uuid, uuid)
to authenticated, service_role;

drop policy if exists "authorized users read professionals"
on public.professionals;

create policy "authorized users read professionals"
on public.professionals for select to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or private.is_tenant_owner((select auth.uid()), tenant_id)
  or id in (
    select ids.id
    from private.current_professional_ids(tenant_id, (select auth.uid())) as ids
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

notify pgrst, 'reload schema';

commit;
