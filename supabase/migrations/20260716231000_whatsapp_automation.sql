-- WhatsApp automation for LinkUp Studio.
-- The long-lived Baileys session runs on Render. Supabase only stores
-- tenant-scoped configuration, an auditable delivery queue, and triggers.

begin;

-- Public booking is handled by a server function with the service role.
-- Keep anonymous callers from inserting appointments directly and abusing
-- the notification trigger.
revoke insert on table public.appointments from anon;

-- Keep this migration self-contained. Some Lovable Cloud databases received
-- the financial tables before the tenant-management helper was registered.
-- Recreating the helper here is idempotent and preserves the same access rule:
-- super admins, owners and staff can manage operational integrations.
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

create table if not exists public.tenant_whatsapp_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  session_id text not null unique
    check (session_id = tenant_id::text),
  responsible_whatsapp text,
  connection_status text not null default 'not_connected'
    check (
      connection_status in (
        'not_connected',
        'connecting',
        'qr',
        'connected',
        'disconnected',
        'logged_out',
        'connector_error'
      )
    ),
  connected_phone text,
  last_connection_error text,
  last_status_at timestamptz,
  notify_client_booking boolean not null default true,
  notify_professional_booking boolean not null default true,
  notify_client_cancellation boolean not null default true,
  notify_professional_cancellation boolean not null default true,
  notify_client_reschedule boolean not null default true,
  notify_professional_reschedule boolean not null default true,
  reminder_enabled boolean not null default true,
  reminder_minutes_before integer not null default 120
    check (reminder_minutes_before between 5 and 10080),
  client_booking_template text not null default
    'Olá, {cliente}! Seu agendamento em {salao} está confirmado para {data} às {hora}, com {profissional}. Serviço: {servico}. Para cancelar: {link_cancelamento}',
  professional_booking_template text not null default
    'Olá, {profissional}! Novo agendamento: {cliente}, serviço {servico}, em {data} às {hora}.',
  client_reminder_template text not null default
    'Olá, {cliente}! Passando para lembrar que seu atendimento em {salao} será em {data} às {hora}, com {profissional}. Serviço: {servico}.',
  client_cancellation_template text not null default
    'Olá, {cliente}. Seu agendamento em {salao}, marcado para {data} às {hora}, foi cancelado.',
  professional_cancellation_template text not null default
    'Olá, {profissional}. O agendamento de {cliente}, em {data} às {hora}, foi cancelado.',
  client_reschedule_template text not null default
    'Olá, {cliente}! Seu agendamento em {salao} foi atualizado para {data} às {hora}, com {profissional}. Serviço: {servico}.',
  professional_reschedule_template text not null default
    'Olá, {profissional}. O agendamento de {cliente} foi atualizado para {data} às {hora}. Serviço: {servico}.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_message_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id text not null
    check (session_id = tenant_id::text),
  appointment_id uuid references public.appointments(id) on delete set null,
  event_type text not null
    check (
      event_type in (
        'appointment_created',
        'appointment_reminder',
        'appointment_cancelled',
        'appointment_rescheduled',
        'test'
      )
    ),
  recipient_kind text not null
    check (recipient_kind in ('client', 'professional', 'responsible')),
  recipient_name text,
  recipient_phone text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  rendered_message text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  scheduled_for timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_queue_pending_idx
  on public.whatsapp_message_queue (status, scheduled_for, created_at)
  where status = 'pending';

create index if not exists whatsapp_queue_tenant_idx
  on public.whatsapp_message_queue (tenant_id, created_at desc);

create index if not exists whatsapp_queue_appointment_idx
  on public.whatsapp_message_queue (appointment_id, status);

grant select, insert, update
  on table public.tenant_whatsapp_settings
  to authenticated;
grant all on table public.tenant_whatsapp_settings to service_role;

grant select on table public.whatsapp_message_queue to authenticated;
grant all on table public.whatsapp_message_queue to service_role;

alter table public.tenant_whatsapp_settings enable row level security;
alter table public.whatsapp_message_queue enable row level security;

drop policy if exists "tenant managers read whatsapp settings"
  on public.tenant_whatsapp_settings;
create policy "tenant managers read whatsapp settings"
on public.tenant_whatsapp_settings for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers create whatsapp settings"
  on public.tenant_whatsapp_settings;
create policy "tenant managers create whatsapp settings"
on public.tenant_whatsapp_settings for insert to authenticated
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers update whatsapp settings"
  on public.tenant_whatsapp_settings;
create policy "tenant managers update whatsapp settings"
on public.tenant_whatsapp_settings for update to authenticated
using (private.can_manage_tenant_operations(tenant_id))
with check (private.can_manage_tenant_operations(tenant_id));

drop policy if exists "tenant managers read whatsapp queue"
  on public.whatsapp_message_queue;
create policy "tenant managers read whatsapp queue"
on public.whatsapp_message_queue for select to authenticated
using (private.can_manage_tenant_operations(tenant_id));

create or replace function private.touch_tenant_whatsapp_settings()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_tenant_whatsapp_settings
  on public.tenant_whatsapp_settings;
create trigger touch_tenant_whatsapp_settings
before update on public.tenant_whatsapp_settings
for each row execute function private.touch_tenant_whatsapp_settings();

create or replace function private.touch_whatsapp_message_queue()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_whatsapp_message_queue
  on public.whatsapp_message_queue;
create trigger touch_whatsapp_message_queue
before update on public.whatsapp_message_queue
for each row execute function private.touch_whatsapp_message_queue();

create or replace function private.cancel_whatsapp_queue_when_disabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.enabled and not new.enabled then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = 'Automação do WhatsApp desativada pela loja.'
    where tenant_id = new.tenant_id
      and status in ('pending', 'processing');
  elsif old.reminder_enabled and not new.reminder_enabled then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = 'Lembretes do WhatsApp desativados pela loja.'
    where tenant_id = new.tenant_id
      and event_type = 'appointment_reminder'
      and status in ('pending', 'processing');
  end if;

  return new;
end;
$$;

revoke all on function private.cancel_whatsapp_queue_when_disabled()
  from public, anon, authenticated;

drop trigger if exists cancel_whatsapp_queue_when_disabled
  on public.tenant_whatsapp_settings;
create trigger cancel_whatsapp_queue_when_disabled
after update of enabled, reminder_enabled
on public.tenant_whatsapp_settings
for each row execute function private.cancel_whatsapp_queue_when_disabled();

insert into public.tenant_whatsapp_settings (tenant_id, session_id)
select tenant.id, tenant.id::text
from public.tenants as tenant
on conflict (tenant_id) do nothing;

create or replace function private.seed_tenant_whatsapp_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_whatsapp_settings (tenant_id, session_id)
  values (new.id, new.id::text)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

revoke all on function private.seed_tenant_whatsapp_settings() from public;
revoke all on function private.seed_tenant_whatsapp_settings() from anon;
revoke all on function private.seed_tenant_whatsapp_settings() from authenticated;

drop trigger if exists seed_tenant_whatsapp_settings on public.tenants;
create trigger seed_tenant_whatsapp_settings
after insert on public.tenants
for each row execute function private.seed_tenant_whatsapp_settings();

create or replace function private.whatsapp_phone(value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g')
$$;

revoke all on function private.whatsapp_phone(text)
  from public, anon, authenticated;

create or replace function private.enqueue_appointment_whatsapp(
  appointment_row public.appointments,
  event_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.tenant_whatsapp_settings%rowtype;
  tenant_name text;
  tenant_slug text;
  professional_name text;
  professional_phone text;
  service_name text;
  client_phone text;
  appointment_date text;
  appointment_time text;
  common_payload jsonb;
  event_suffix text;
begin
  select whatsapp_settings.*
    into settings
  from public.tenant_whatsapp_settings as whatsapp_settings
  where whatsapp_settings.tenant_id = appointment_row.tenant_id
    and whatsapp_settings.enabled = true;

  if not found then
    return;
  end if;

  select tenant.name, tenant.slug
    into tenant_name, tenant_slug
  from public.tenants as tenant
  where tenant.id = appointment_row.tenant_id;

  select professional.full_name, private.whatsapp_phone(professional.whatsapp)
    into professional_name, professional_phone
  from public.professionals as professional
  where professional.id = appointment_row.professional_id
    and professional.tenant_id = appointment_row.tenant_id;

  select service.name
    into service_name
  from public.services as service
  where service.id = appointment_row.service_id
    and service.tenant_id = appointment_row.tenant_id;

  client_phone := private.whatsapp_phone(appointment_row.client_whatsapp);
  appointment_date := to_char(
    appointment_row.start_at at time zone 'America/Sao_Paulo',
    'DD/MM/YYYY'
  );
  appointment_time := to_char(
    appointment_row.start_at at time zone 'America/Sao_Paulo',
    'HH24:MI'
  );
  common_payload := jsonb_build_object(
    'appointment_id', appointment_row.id,
    'tenant_id', appointment_row.tenant_id,
    'tenant_slug', coalesce(tenant_slug, ''),
    'salao', coalesce(tenant_name, 'Salão'),
    'cliente', coalesce(appointment_row.client_name, 'Cliente'),
    'profissional', coalesce(professional_name, 'Profissional'),
    'servico', coalesce(service_name, 'Serviço'),
    'data', appointment_date,
    'hora', appointment_time,
    'start_at', appointment_row.start_at,
    'cancellation_token', appointment_row.cancellation_token
  );
  event_suffix := txid_current()::text || ':' || md5(common_payload::text);

  if event_name = 'appointment_created' then
    if settings.notify_client_booking and length(client_phone) >= 10 then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        appointment_id,
        event_type,
        recipient_kind,
        recipient_name,
        recipient_phone,
        template,
        payload,
        scheduled_for,
        idempotency_key
      )
      values (
        appointment_row.tenant_id,
        settings.session_id,
        appointment_row.id,
        event_name,
        'client',
        appointment_row.client_name,
        client_phone,
        settings.client_booking_template,
        common_payload,
        now() + interval '5 seconds',
        appointment_row.id::text || ':created:client:' || event_suffix
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if settings.notify_professional_booking and length(professional_phone) >= 10 then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        appointment_id,
        event_type,
        recipient_kind,
        recipient_name,
        recipient_phone,
        template,
        payload,
        scheduled_for,
        idempotency_key
      )
      values (
        appointment_row.tenant_id,
        settings.session_id,
        appointment_row.id,
        event_name,
        'professional',
        professional_name,
        professional_phone,
        settings.professional_booking_template,
        common_payload,
        now() + interval '5 seconds',
        appointment_row.id::text || ':created:professional:' || event_suffix
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if
      settings.reminder_enabled
      and length(client_phone) >= 10
      and appointment_row.start_at > now()
    then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        appointment_id,
        event_type,
        recipient_kind,
        recipient_name,
        recipient_phone,
        template,
        payload,
        scheduled_for,
        idempotency_key
      )
      values (
        appointment_row.tenant_id,
        settings.session_id,
        appointment_row.id,
        'appointment_reminder',
        'client',
        appointment_row.client_name,
        client_phone,
        settings.client_reminder_template,
        common_payload,
        greatest(
          now() + interval '10 seconds',
          appointment_row.start_at
            - make_interval(mins => settings.reminder_minutes_before)
        ),
        appointment_row.id::text || ':reminder:client:' || event_suffix
      )
      on conflict (idempotency_key) do nothing;
    end if;
  elsif event_name = 'appointment_cancelled' then
    if settings.notify_client_cancellation and length(client_phone) >= 10 then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        appointment_id,
        event_type,
        recipient_kind,
        recipient_name,
        recipient_phone,
        template,
        payload,
        scheduled_for,
        idempotency_key
      )
      values (
        appointment_row.tenant_id,
        settings.session_id,
        appointment_row.id,
        event_name,
        'client',
        appointment_row.client_name,
        client_phone,
        settings.client_cancellation_template,
        common_payload,
        now() + interval '3 seconds',
        appointment_row.id::text || ':cancelled:client:' || event_suffix
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if settings.notify_professional_cancellation and length(professional_phone) >= 10 then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        appointment_id,
        event_type,
        recipient_kind,
        recipient_name,
        recipient_phone,
        template,
        payload,
        scheduled_for,
        idempotency_key
      )
      values (
        appointment_row.tenant_id,
        settings.session_id,
        appointment_row.id,
        event_name,
        'professional',
        professional_name,
        professional_phone,
        settings.professional_cancellation_template,
        common_payload,
        now() + interval '3 seconds',
        appointment_row.id::text || ':cancelled:professional:' || event_suffix
      )
      on conflict (idempotency_key) do nothing;
    end if;
  elsif event_name = 'appointment_rescheduled' then
    if settings.notify_client_reschedule and length(client_phone) >= 10 then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        appointment_id,
        event_type,
        recipient_kind,
        recipient_name,
        recipient_phone,
        template,
        payload,
        scheduled_for,
        idempotency_key
      )
      values (
        appointment_row.tenant_id,
        settings.session_id,
        appointment_row.id,
        event_name,
        'client',
        appointment_row.client_name,
        client_phone,
        settings.client_reschedule_template,
        common_payload,
        now() + interval '5 seconds',
        appointment_row.id::text || ':rescheduled:client:' || event_suffix
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if settings.notify_professional_reschedule and length(professional_phone) >= 10 then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        appointment_id,
        event_type,
        recipient_kind,
        recipient_name,
        recipient_phone,
        template,
        payload,
        scheduled_for,
        idempotency_key
      )
      values (
        appointment_row.tenant_id,
        settings.session_id,
        appointment_row.id,
        event_name,
        'professional',
        professional_name,
        professional_phone,
        settings.professional_reschedule_template,
        common_payload,
        now() + interval '5 seconds',
        appointment_row.id::text || ':rescheduled:professional:' || event_suffix
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if
      settings.reminder_enabled
      and length(client_phone) >= 10
      and appointment_row.start_at > now()
    then
      insert into public.whatsapp_message_queue (
        tenant_id,
        session_id,
        appointment_id,
        event_type,
        recipient_kind,
        recipient_name,
        recipient_phone,
        template,
        payload,
        scheduled_for,
        idempotency_key
      )
      values (
        appointment_row.tenant_id,
        settings.session_id,
        appointment_row.id,
        'appointment_reminder',
        'client',
        appointment_row.client_name,
        client_phone,
        settings.client_reminder_template,
        common_payload,
        greatest(
          now() + interval '10 seconds',
          appointment_row.start_at
            - make_interval(mins => settings.reminder_minutes_before)
        ),
        appointment_row.id::text || ':reminder:client:' || event_suffix
      )
      on conflict (idempotency_key) do nothing;
    end if;
  end if;
end;
$$;

revoke all on function private.enqueue_appointment_whatsapp(
  public.appointments,
  text
) from public;
revoke all on function private.enqueue_appointment_whatsapp(
  public.appointments,
  text
) from anon;
revoke all on function private.enqueue_appointment_whatsapp(
  public.appointments,
  text
) from authenticated;

create or replace function private.queue_appointment_whatsapp_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_cancelled boolean;
  new_cancelled boolean;
  schedule_changed boolean;
begin
  if tg_op = 'INSERT' then
    new_cancelled := lower(coalesce(new.status, '')) in (
      'cancelled',
      'canceled',
      'no_show',
      'noshow'
    );
    if not new_cancelled then
      perform private.enqueue_appointment_whatsapp(
        new,
        'appointment_created'
      );
    end if;
    return new;
  end if;

  old_cancelled := lower(coalesce(old.status, '')) in (
    'cancelled',
    'canceled',
    'no_show',
    'noshow'
  );
  new_cancelled := lower(coalesce(new.status, '')) in (
    'cancelled',
    'canceled',
    'no_show',
    'noshow'
  );

  if new_cancelled and not old_cancelled then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = 'Substituída pela notificação de cancelamento.'
    where appointment_id = new.id
      and status in ('pending', 'processing', 'failed');

    perform private.enqueue_appointment_whatsapp(
      new,
      'appointment_cancelled'
    );
    return new;
  end if;

  if old_cancelled and not new_cancelled then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = 'Cancelamento revertido; notificação substituída.'
    where appointment_id = new.id
      and event_type = 'appointment_cancelled'
      and status in ('pending', 'processing', 'failed');

    perform private.enqueue_appointment_whatsapp(
      new,
      'appointment_rescheduled'
    );
    return new;
  end if;

  if lower(coalesce(new.status, '')) in ('completed', 'done') then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = 'Atendimento concluído antes do lembrete.'
    where appointment_id = new.id
      and event_type = 'appointment_reminder'
      and status in ('pending', 'processing', 'failed');
    return new;
  end if;

  schedule_changed :=
    new.start_at is distinct from old.start_at
    or new.end_at is distinct from old.end_at
    or new.professional_id is distinct from old.professional_id
    or new.service_id is distinct from old.service_id
    or new.client_name is distinct from old.client_name
    or new.client_whatsapp is distinct from old.client_whatsapp;

  if schedule_changed and not new_cancelled then
    update public.whatsapp_message_queue
    set
      status = 'cancelled',
      locked_at = null,
      last_error = 'Substituída após alteração do agendamento.'
    where appointment_id = new.id
      and status in ('pending', 'processing', 'failed');

    perform private.enqueue_appointment_whatsapp(
      new,
      'appointment_rescheduled'
    );
  end if;

  return new;
end;
$$;

revoke all on function private.queue_appointment_whatsapp_messages()
  from public;
revoke all on function private.queue_appointment_whatsapp_messages()
  from anon;
revoke all on function private.queue_appointment_whatsapp_messages()
  from authenticated;

create or replace function private.cancel_deleted_appointment_whatsapp_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.whatsapp_message_queue
  set
    status = 'cancelled',
    locked_at = null,
    last_error = 'Agendamento removido antes do envio.'
  where appointment_id = old.id
    and status in ('pending', 'processing', 'failed');

  return old;
end;
$$;

revoke all on function private.cancel_deleted_appointment_whatsapp_messages()
  from public, anon, authenticated;

drop trigger if exists cancel_deleted_appointment_whatsapp_messages
  on public.appointments;
create trigger cancel_deleted_appointment_whatsapp_messages
before delete on public.appointments
for each row
execute function private.cancel_deleted_appointment_whatsapp_messages();

drop trigger if exists queue_appointment_whatsapp_messages
  on public.appointments;
create trigger queue_appointment_whatsapp_messages
after insert or update on public.appointments
for each row execute function private.queue_appointment_whatsapp_messages();

notify pgrst, 'reload schema';

commit;
