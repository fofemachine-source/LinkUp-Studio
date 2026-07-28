begin;

create table if not exists public.staff_positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_positions_tenant_name_key
on public.staff_positions (tenant_id, lower(name));

create unique index if not exists staff_positions_id_tenant_key
on public.staff_positions (id, tenant_id);

create index if not exists staff_positions_tenant_active_idx
on public.staff_positions (tenant_id, active, sort_order, name);

alter table public.staff_positions enable row level security;
grant select, insert, update, delete on public.staff_positions to authenticated;
grant all on public.staff_positions to service_role;

alter table public.professionals
  add column if not exists position_id uuid,
  add column if not exists access_profile text not null default 'professional',
  add column if not exists access_permissions text[] not null default array[]::text[],
  add column if not exists available_for_booking boolean not null default true,
  add column if not exists show_on_booking boolean not null default true,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists receive_operational_notifications boolean not null default false;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.professionals'::regclass
      and conname = 'professionals_position_id_fkey'
  ) then
    alter table public.professionals
      add constraint professionals_position_id_fkey
      foreign key (position_id)
      references public.staff_positions(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.professionals'::regclass
      and conname = 'professionals_position_tenant_fkey'
  ) then
    alter table public.professionals
      add constraint professionals_position_tenant_fkey
      foreign key (position_id, tenant_id)
      references public.staff_positions(id, tenant_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.professionals'::regclass
      and conname = 'professionals_access_profile_check'
  ) then
    alter table public.professionals
      add constraint professionals_access_profile_check
      check (access_profile in ('owner', 'manager', 'professional', 'reception'));
  end if;
end;
$constraints$;

create index if not exists professionals_tenant_position_idx
on public.professionals (tenant_id, position_id);

create index if not exists professionals_booking_visibility_idx
on public.professionals (tenant_id, active, available_for_booking, show_on_booking);

create index if not exists professionals_auth_access_idx
on public.professionals (tenant_id, auth_user_id, active)
where auth_user_id is not null;

do $duplicates$
begin
  if exists (
    select 1
    from public.professionals
    where auth_user_id is not null
    group by tenant_id, auth_user_id
    having count(*) > 1
  ) then
    raise exception 'Há logins vinculados a mais de um profissional na mesma loja. Corrija os vínculos duplicados antes de aplicar esta migração.';
  end if;
end;
$duplicates$;

-- O vínculo é único dentro da loja, mas o mesmo usuário pode participar de
-- lojas diferentes sem que uma associação sobrescreva a outra.
drop index if exists public.professionals_auth_user_id_key;
create unique index if not exists professionals_tenant_auth_user_key
on public.professionals (tenant_id, auth_user_id)
where auth_user_id is not null;

insert into public.staff_positions (tenant_id, name, description, sort_order)
select
  tenant.id,
  defaults.name,
  defaults.description,
  defaults.sort_order
from public.tenants as tenant
cross join (
  values
    ('Proprietária', 'Responsável pelo salão e pela operação.', 10),
    ('Gerente', 'Gestão da equipe e da operação.', 20),
    ('Barbeiro', 'Profissional de barbearia.', 30),
    ('Cabeleireira', 'Profissional de cabelo e beleza.', 40),
    ('Recepção', 'Atendimento e organização da agenda.', 50),
    ('Financeiro', 'Rotinas financeiras autorizadas.', 60)
) as defaults(name, description, sort_order)
where not exists (
  select 1
  from public.staff_positions as existing
  where existing.tenant_id = tenant.id
    and lower(existing.name) = lower(defaults.name)
);

update public.professionals as professional
set position_id = position.id
from public.staff_positions as position
where position.tenant_id = professional.tenant_id
  and professional.position_id is null
  and lower(position.name) = lower(coalesce(nullif(trim(professional.role_label), ''), 'Barbeiro'));

update public.professionals as professional
set
  access_profile = case
    when exists (
      select 1
      from public.user_roles as role
      where role.user_id = professional.auth_user_id
        and role.tenant_id = professional.tenant_id
        and role.role = 'owner'::public.app_role
    ) then 'owner'
    when exists (
      select 1
      from public.user_roles as role
      where role.user_id = professional.auth_user_id
        and role.tenant_id = professional.tenant_id
        and role.role = 'staff'::public.app_role
    ) then 'manager'
    else coalesce(professional.access_profile, 'professional')
  end,
  access_permissions = case
    when exists (
      select 1
      from public.user_roles as role
      where role.user_id = professional.auth_user_id
        and role.tenant_id = professional.tenant_id
        and role.role = 'owner'::public.app_role
    ) then array[
      'dashboard', 'own_agenda', 'agenda_all', 'commandas', 'clients',
      'manage_staff', 'services', 'products', 'subscriptions',
      'own_finance', 'finance_general', 'commissions', 'inventory',
      'settings', 'manage_operations', 'receive_operational_notifications'
    ]::text[]
    when exists (
      select 1
      from public.user_roles as role
      where role.user_id = professional.auth_user_id
        and role.tenant_id = professional.tenant_id
        and role.role = 'staff'::public.app_role
    ) and coalesce(array_length(professional.access_permissions, 1), 0) = 0 then array[
      'dashboard', 'agenda_all', 'commandas', 'clients', 'manage_staff',
      'services', 'products', 'subscriptions', 'finance_general',
      'commissions', 'inventory', 'settings', 'manage_operations',
      'receive_operational_notifications'
    ]::text[]
    when coalesce(array_length(professional.access_permissions, 1), 0) = 0 then
      array['own_agenda', 'own_finance']::text[]
    else professional.access_permissions
  end,
  available_for_booking = coalesce(professional.active, true),
  show_on_booking = coalesce(professional.active, true)
where professional.auth_user_id is not null
   or professional.available_for_booking is distinct from coalesce(professional.active, true)
   or professional.show_on_booking is distinct from coalesce(professional.active, true);

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
  select professional.id
  from public.professionals as professional
  where professional.tenant_id = p_tenant_id
    and professional.auth_user_id = p_user_id
    and professional.active is true
  order by professional.created_at asc
  limit 1;
$function$;

create or replace function private.professional_has_permission(
  p_tenant_id uuid,
  p_permission text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_user_id is not null
    and (
      private.is_super_admin(p_user_id)
      or exists (
        select 1
        from public.user_roles as role
        where role.user_id = p_user_id
          and role.tenant_id = p_tenant_id
          and role.role = 'owner'::public.app_role
      )
      or exists (
        select 1
        from public.professionals as professional
        where professional.tenant_id = p_tenant_id
          and professional.auth_user_id = p_user_id
          and professional.active is true
          and (
            professional.access_profile = 'owner'
            or p_permission = any(coalesce(professional.access_permissions, array[]::text[]))
            or (
              professional.access_profile = 'professional'
              and p_permission in ('own_agenda', 'own_finance')
            )
            or (
              professional.access_profile = 'reception'
              and p_permission in (
                'agenda_all', 'commandas', 'clients',
                'receive_operational_notifications'
              )
            )
          )
      )
    );
$function$;

create or replace function private.can_manage_tenant_operations(
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.is_super_admin((select auth.uid()))
    or exists (
      select 1
      from public.user_roles as role
      where role.user_id = (select auth.uid())
        and role.tenant_id = p_tenant_id
        and role.role = 'owner'::public.app_role
    )
    or private.professional_has_permission(
      p_tenant_id,
      'manage_operations',
      (select auth.uid())
    )
    or (
      not exists (
        select 1
        from public.professionals as professional
        where professional.tenant_id = p_tenant_id
          and professional.auth_user_id = (select auth.uid())
      )
      and exists (
        select 1
        from public.user_roles as role
        where role.user_id = (select auth.uid())
          and role.tenant_id = p_tenant_id
          and role.role = 'staff'::public.app_role
      )
    );
$function$;

create or replace function public.get_tenant_operational_settings(
  p_tenant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'tenant_id', settings.tenant_id,
    'open_hour', settings.open_hour,
    'close_hour', settings.close_hour,
    'lunch_start', settings.lunch_start,
    'lunch_end', settings.lunch_end,
    'work_days', settings.work_days,
    'vip_days', settings.vip_days,
    'vip_mode', settings.vip_mode,
    'closed_dates', settings.closed_dates,
    'appointment_alert_repeat_seconds',
      settings.appointment_alert_repeat_seconds,
    'appointment_reception_alerts_enabled',
      settings.appointment_reception_alerts_enabled
  )
  from public.tenant_settings as settings
  where settings.tenant_id = p_tenant_id
    and private.is_tenant_member((select auth.uid()), p_tenant_id);
$function$;

revoke all on function private.current_professional_id(uuid, uuid) from public, anon;
revoke all on function private.professional_has_permission(uuid, text, uuid) from public, anon;
revoke all on function private.can_manage_tenant_operations(uuid) from public, anon;
revoke all on function public.get_tenant_operational_settings(uuid)
from public, anon;

grant execute on function private.current_professional_id(uuid, uuid)
to authenticated, service_role;
grant execute on function private.professional_has_permission(uuid, text, uuid)
to authenticated, service_role;
grant execute on function private.can_manage_tenant_operations(uuid)
to authenticated, service_role;
grant execute on function public.get_tenant_operational_settings(uuid)
to authenticated, service_role;

drop policy if exists "tenant members read staff positions"
on public.staff_positions;
create policy "tenant members read staff positions"
on public.staff_positions for select to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or private.is_tenant_member((select auth.uid()), tenant_id)
);

drop policy if exists "tenant managers insert staff positions"
on public.staff_positions;
create policy "tenant managers insert staff positions"
on public.staff_positions for insert to authenticated
with check (
  private.professional_has_permission(
    tenant_id,
    'manage_staff',
    (select auth.uid())
  )
);

drop policy if exists "tenant managers update staff positions"
on public.staff_positions;
create policy "tenant managers update staff positions"
on public.staff_positions for update to authenticated
using (
  private.professional_has_permission(
    tenant_id,
    'manage_staff',
    (select auth.uid())
  )
)
with check (
  private.professional_has_permission(
    tenant_id,
    'manage_staff',
    (select auth.uid())
  )
);

drop policy if exists "tenant managers delete staff positions"
on public.staff_positions;
create policy "tenant managers delete staff positions"
on public.staff_positions for delete to authenticated
using (
  private.professional_has_permission(
    tenant_id,
    'manage_staff',
    (select auth.uid())
  )
);

drop policy if exists "tenant members read pros" on public.professionals;
drop policy if exists "tenant managers manage pros" on public.professionals;
drop policy if exists "tenant members manage pros" on public.professionals;

create policy "authorized users read professionals"
on public.professionals for select to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or private.is_tenant_owner((select auth.uid()), tenant_id)
  or auth_user_id = (select auth.uid())
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

create policy "authorized users insert professionals"
on public.professionals for insert to authenticated
with check (
  private.professional_has_permission(
    tenant_id,
    'manage_staff',
    (select auth.uid())
  )
);

create policy "authorized users update professionals"
on public.professionals for update to authenticated
using (
  private.professional_has_permission(
    tenant_id,
    'manage_staff',
    (select auth.uid())
  )
  or auth_user_id = (select auth.uid())
)
with check (
  private.professional_has_permission(
    tenant_id,
    'manage_staff',
    (select auth.uid())
  )
  or auth_user_id = (select auth.uid())
);

create policy "authorized users delete professionals"
on public.professionals for delete to authenticated
using (
  private.professional_has_permission(
    tenant_id,
    'manage_staff',
    (select auth.uid())
  )
);

drop policy if exists "public read pros" on public.professionals;
revoke select on public.professionals from anon;
grant select (
  id,
  tenant_id,
  full_name,
  photo_url,
  role_label,
  specialty,
  active,
  work_days,
  blocked_dates,
  lunch_start,
  lunch_end,
  available_for_booking,
  show_on_booking
) on public.professionals to anon;

create policy "public read visible professionals"
on public.professionals for select to anon
using (
  active is true
  and available_for_booking is true
  and show_on_booking is true
);

create or replace function private.protect_professional_access_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_is_service_role boolean :=
    coalesce((select auth.jwt() ->> 'role'), '') = 'service_role';
  v_is_owner boolean;
  v_can_manage_staff boolean;
begin
  if v_is_service_role then
    return new;
  end if;

  v_is_owner :=
    private.is_super_admin(v_user_id)
    or private.is_tenant_owner(v_user_id, new.tenant_id);
  v_can_manage_staff := private.professional_has_permission(
    new.tenant_id,
    'manage_staff',
    v_user_id
  );

  if tg_op = 'INSERT' then
    if not v_is_owner and (
      new.auth_user_id is not null
      or new.access_profile is distinct from 'professional'
      or coalesce(array_length(new.access_permissions, 1), 0) > 0
      or new.must_change_password is true
      or new.receive_operational_notifications is true
    ) then
      raise exception 'Somente o proprietário pode configurar o acesso ao sistema.';
    end if;

    return new;
  end if;

  if new.email is distinct from old.email
     and (old.auth_user_id is not null or new.auth_user_id is not null) then
    raise exception 'O e-mail de um login vinculado só pode ser alterado pelo fluxo seguro de acesso.';
  end if;

  if new.auth_user_id = v_user_id
     and old.must_change_password is true
     and new.must_change_password is false
     and (
       to_jsonb(new) - 'must_change_password'
     ) is not distinct from (
       to_jsonb(old) - 'must_change_password'
     ) then
    return new;
  end if;

  if new.auth_user_id = v_user_id
     and not v_is_owner
     and not v_can_manage_staff then
    if (
      to_jsonb(new) - 'photo_url' - 'must_change_password'
    ) is distinct from (
      to_jsonb(old) - 'photo_url' - 'must_change_password'
    ) then
      raise exception 'O profissional só pode atualizar a própria foto e concluir a troca da senha provisória.';
    end if;

    if new.must_change_password is true
       or (
         old.must_change_password is false
         and new.must_change_password is distinct from old.must_change_password
       ) then
      raise exception 'A troca de senha provisória só pode ser marcada como concluída.';
    end if;

    return new;
  end if;

  if (
    new.auth_user_id is distinct from old.auth_user_id
    or new.access_profile is distinct from old.access_profile
    or new.access_permissions is distinct from old.access_permissions
    or new.must_change_password is distinct from old.must_change_password
    or new.receive_operational_notifications is distinct from old.receive_operational_notifications
  ) and not v_is_owner then
    raise exception 'Somente o proprietário pode alterar o acesso ao sistema.';
  end if;

  return new;
end;
$function$;

revoke all on function private.protect_professional_access_fields()
from public, anon, authenticated;

drop trigger if exists protect_professional_access_fields
on public.professionals;
create trigger protect_professional_access_fields
before insert or update on public.professionals
for each row
execute function private.protect_professional_access_fields();

-- Cadastros globais ficam protegidos no banco. O profissional ainda pode
-- consultar o cliente ligado aos próprios horários e o catálogo necessário
-- para operar a própria agenda, sem receber listagens administrativas.
drop policy if exists "tenant members manage clients" on public.clients;
drop policy if exists "authorized users read clients" on public.clients;
drop policy if exists "authorized users insert clients" on public.clients;
drop policy if exists "authorized users update clients" on public.clients;
drop policy if exists "authorized users delete clients" on public.clients;

create policy "authorized users read clients"
on public.clients for select to authenticated
using (
  private.professional_has_permission(
    tenant_id,
    'clients',
    (select auth.uid())
  )
  or exists (
    select 1
    from public.appointments as appointment
    where appointment.tenant_id = clients.tenant_id
      and appointment.client_id = clients.id
      and appointment.professional_id = private.current_professional_id(
        clients.tenant_id,
        (select auth.uid())
      )
  )
);

create policy "authorized users insert clients"
on public.clients for insert to authenticated
with check (
  private.professional_has_permission(
    tenant_id,
    'clients',
    (select auth.uid())
  )
);

create policy "authorized users update clients"
on public.clients for update to authenticated
using (
  private.professional_has_permission(
    tenant_id,
    'clients',
    (select auth.uid())
  )
)
with check (
  private.professional_has_permission(
    tenant_id,
    'clients',
    (select auth.uid())
  )
);

create policy "authorized users delete clients"
on public.clients for delete to authenticated
using (
  private.professional_has_permission(
    tenant_id,
    'clients',
    (select auth.uid())
  )
);

drop policy if exists "tenant members manage services" on public.services;
drop policy if exists "authorized users read services" on public.services;
drop policy if exists "authorized users manage services" on public.services;

create policy "authorized users read services"
on public.services for select to authenticated
using (
  private.professional_has_permission(tenant_id, 'services', (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'own_agenda', (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'agenda_all', (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
);

create policy "authorized users manage services"
on public.services for all to authenticated
using (
  private.professional_has_permission(tenant_id, 'services', (select auth.uid()))
)
with check (
  private.professional_has_permission(tenant_id, 'services', (select auth.uid()))
);

drop policy if exists "tenant members manage service categories"
on public.service_categories;
drop policy if exists "authorized users read service categories"
on public.service_categories;
drop policy if exists "authorized users manage service categories"
on public.service_categories;

create policy "authorized users read service categories"
on public.service_categories for select to authenticated
using (
  private.professional_has_permission(tenant_id, 'services', (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'own_agenda', (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'agenda_all', (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
);

create policy "authorized users manage service categories"
on public.service_categories for all to authenticated
using (
  private.professional_has_permission(tenant_id, 'services', (select auth.uid()))
)
with check (
  private.professional_has_permission(tenant_id, 'services', (select auth.uid()))
);

drop policy if exists "tenant members manage products" on public.products;
drop policy if exists "authorized users read products" on public.products;
drop policy if exists "authorized users manage products" on public.products;

create policy "authorized users read products"
on public.products for select to authenticated
using (
  private.professional_has_permission(tenant_id, 'products', (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'inventory', (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
);

create policy "authorized users manage products"
on public.products for all to authenticated
using (
  private.professional_has_permission(tenant_id, 'products', (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'inventory', (select auth.uid()))
)
with check (
  private.professional_has_permission(tenant_id, 'products', (select auth.uid()))
  or private.professional_has_permission(tenant_id, 'inventory', (select auth.uid()))
);

drop policy if exists "tenant members manage subs" on public.subscribers;
drop policy if exists "authorized users manage subscribers" on public.subscribers;
create policy "authorized users manage subscribers"
on public.subscribers for all to authenticated
using (
  private.professional_has_permission(
    tenant_id,
    'subscriptions',
    (select auth.uid())
  )
)
with check (
  private.professional_has_permission(
    tenant_id,
    'subscriptions',
    (select auth.uid())
  )
);

-- A tabela contém tokens e modelos privados. Horários e preferências
-- operacionais são fornecidos separadamente pela função segura acima.
drop policy if exists "tenant members settings" on public.tenant_settings;
drop policy if exists "authorized users manage tenant settings"
on public.tenant_settings;
create policy "authorized users manage tenant settings"
on public.tenant_settings for all to authenticated
using (
  private.professional_has_permission(
    tenant_id,
    'settings',
    (select auth.uid())
  )
)
with check (
  private.professional_has_permission(
    tenant_id,
    'settings',
    (select auth.uid())
  )
);

drop policy if exists "owner updates tenant" on public.tenants;
drop policy if exists "owner updates active tenant" on public.tenants;
create policy "authorized users update active tenant"
on public.tenants for update to authenticated
using (
  private.is_tenant_member((select auth.uid()), id)
  and private.professional_has_permission(id, 'settings', (select auth.uid()))
)
with check (
  private.is_tenant_member((select auth.uid()), id)
  and private.professional_has_permission(id, 'settings', (select auth.uid()))
);

drop policy if exists "tenant managers create booking branding direct"
on public.tenant_booking_branding;
drop policy if exists "tenant managers update booking branding direct"
on public.tenant_booking_branding;
create policy "authorized users create booking branding"
on public.tenant_booking_branding for insert to authenticated
with check (
  private.professional_has_permission(
    tenant_id,
    'settings',
    (select auth.uid())
  )
);
create policy "authorized users update booking branding"
on public.tenant_booking_branding for update to authenticated
using (
  private.professional_has_permission(
    tenant_id,
    'settings',
    (select auth.uid())
  )
)
with check (
  private.professional_has_permission(
    tenant_id,
    'settings',
    (select auth.uid())
  )
);

-- Comandas não ficam mais visíveis para todo membro da loja. Profissionais
-- consultam apenas a comanda ligada a um agendamento próprio.
drop policy if exists "tenant members read commandas" on public.commandas;
drop policy if exists "tenant managers insert commandas" on public.commandas;
drop policy if exists "tenant managers update commandas" on public.commandas;
drop policy if exists "tenant managers delete commandas" on public.commandas;

create policy "authorized users read commandas"
on public.commandas for select to authenticated
using (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
  or exists (
    select 1
    from public.appointments as appointment
    where appointment.id = commandas.appointment_id
      and appointment.tenant_id = commandas.tenant_id
      and appointment.professional_id = private.current_professional_id(
        commandas.tenant_id,
        (select auth.uid())
      )
  )
);

create policy "authorized users insert commandas"
on public.commandas for insert to authenticated
with check (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
  or (
    private.professional_has_permission(
      tenant_id,
      'own_agenda',
      (select auth.uid())
    )
    and exists (
      select 1
      from public.appointments as appointment
      where appointment.id = commandas.appointment_id
        and appointment.tenant_id = commandas.tenant_id
        and appointment.professional_id = private.current_professional_id(
          commandas.tenant_id,
          (select auth.uid())
        )
    )
  )
);

create policy "authorized users update commandas"
on public.commandas for update to authenticated
using (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
  or exists (
    select 1
    from public.appointments as appointment
    where appointment.id = commandas.appointment_id
      and appointment.tenant_id = commandas.tenant_id
      and appointment.professional_id = private.current_professional_id(
        commandas.tenant_id,
        (select auth.uid())
      )
  )
)
with check (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
  or exists (
    select 1
    from public.appointments as appointment
    where appointment.id = commandas.appointment_id
      and appointment.tenant_id = commandas.tenant_id
      and appointment.professional_id = private.current_professional_id(
        commandas.tenant_id,
        (select auth.uid())
      )
  )
);

create policy "authorized users delete commandas"
on public.commandas for delete to authenticated
using (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
);

drop policy if exists "tenant members read commanda items"
on public.commanda_items;
drop policy if exists "tenant managers insert commanda items"
on public.commanda_items;
drop policy if exists "tenant managers update commanda items"
on public.commanda_items;
drop policy if exists "tenant managers delete commanda items"
on public.commanda_items;

create policy "authorized users read commanda items"
on public.commanda_items for select to authenticated
using (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
  or professional_id = private.current_professional_id(
    tenant_id,
    (select auth.uid())
  )
);

create policy "authorized users insert commanda items"
on public.commanda_items for insert to authenticated
with check (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
  or (
    professional_id = private.current_professional_id(
      tenant_id,
      (select auth.uid())
    )
    and private.professional_has_permission(
      tenant_id,
      'own_agenda',
      (select auth.uid())
    )
  )
);

create policy "authorized users update commanda items"
on public.commanda_items for update to authenticated
using (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
  or professional_id = private.current_professional_id(
    tenant_id,
    (select auth.uid())
  )
)
with check (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
  or professional_id = private.current_professional_id(
    tenant_id,
    (select auth.uid())
  )
);

create policy "authorized users delete commanda items"
on public.commanda_items for delete to authenticated
using (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
);

drop policy if exists "tenant managers read commanda payments"
on public.commanda_payments;
drop policy if exists "tenant managers insert commanda payments"
on public.commanda_payments;
drop policy if exists "tenant managers delete commanda payments"
on public.commanda_payments;

create policy "authorized users read commanda payments"
on public.commanda_payments for select to authenticated
using (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
);
create policy "authorized users insert commanda payments"
on public.commanda_payments for insert to authenticated
with check (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
  and exists (
    select 1
    from public.commandas as parent_commanda
    where parent_commanda.id = commanda_payments.commanda_id
      and parent_commanda.tenant_id = commanda_payments.tenant_id
  )
);
create policy "authorized users delete commanda payments"
on public.commanda_payments for delete to authenticated
using (
  private.professional_has_permission(tenant_id, 'commandas', (select auth.uid()))
);

drop policy if exists "tenant members manage appts"
on public.appointments;
drop policy if exists "authorized users read appointments"
on public.appointments;
drop policy if exists "authorized users insert appointments"
on public.appointments;
drop policy if exists "authorized users update appointments"
on public.appointments;
drop policy if exists "authorized users delete appointments"
on public.appointments;

create policy "authorized users read appointments"
on public.appointments for select to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or private.is_tenant_owner((select auth.uid()), tenant_id)
  or private.professional_has_permission(
    tenant_id,
    'agenda_all',
    (select auth.uid())
  )
  or professional_id = private.current_professional_id(
    tenant_id,
    (select auth.uid())
  )
);

create policy "authorized users insert appointments"
on public.appointments for insert to authenticated
with check (
  private.is_super_admin((select auth.uid()))
  or private.is_tenant_owner((select auth.uid()), tenant_id)
  or private.professional_has_permission(
    tenant_id,
    'agenda_all',
    (select auth.uid())
  )
  or professional_id = private.current_professional_id(
    tenant_id,
    (select auth.uid())
  )
);

create policy "authorized users update appointments"
on public.appointments for update to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or private.is_tenant_owner((select auth.uid()), tenant_id)
  or private.professional_has_permission(
    tenant_id,
    'agenda_all',
    (select auth.uid())
  )
  or professional_id = private.current_professional_id(
    tenant_id,
    (select auth.uid())
  )
)
with check (
  private.is_super_admin((select auth.uid()))
  or private.is_tenant_owner((select auth.uid()), tenant_id)
  or private.professional_has_permission(
    tenant_id,
    'agenda_all',
    (select auth.uid())
  )
  or professional_id = private.current_professional_id(
    tenant_id,
    (select auth.uid())
  )
);

create policy "authorized users delete appointments"
on public.appointments for delete to authenticated
using (
  private.is_super_admin((select auth.uid()))
  or private.is_tenant_owner((select auth.uid()), tenant_id)
  or private.professional_has_permission(
    tenant_id,
    'agenda_all',
    (select auth.uid())
  )
);

notify pgrst, 'reload schema';
commit;
