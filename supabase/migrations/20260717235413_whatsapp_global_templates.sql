-- Global WhatsApp message templates managed by LinkUp Studio matrix.
-- Tenants inherit the global templates by default and can receive custom
-- overrides without affecting other salons.

begin;

alter table public.tenant_whatsapp_settings
  add column if not exists message_templates_source text not null default 'global';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_whatsapp_settings_message_templates_source_check'
  ) then
    alter table public.tenant_whatsapp_settings
      add constraint tenant_whatsapp_settings_message_templates_source_check
      check (message_templates_source in ('global', 'custom'));
  end if;
end $$;

update public.tenant_whatsapp_settings
set message_templates_source = 'global'
where message_templates_source is null;

create table if not exists public.whatsapp_global_templates (
  id text primary key default 'global' check (id = 'global'),
  client_registration_template text not null default
    'Olá, {cliente}! Seu cadastro em {salao} foi confirmado. Agora você pode entrar com seu CPF e senha para agendar com mais rapidez.',
  client_booking_template text not null default
    'Olá, {cliente}! Seu agendamento em {salao} está confirmado para {data} às {hora}, com {profissional}. Serviço: {servico}. Para cancelar: {link_cancelamento}',
  professional_booking_template text not null default
    '📅 *Olá, {profissional}! Você recebeu um novo agendamento.*

👤 Cliente: *{cliente}*
💼 Serviço: *{servico}*
📆 Data: *{data}*
🕒 Horário: *{hora}*

✨ Desejamos um excelente atendimento!',
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

insert into public.whatsapp_global_templates (id)
values ('global')
on conflict (id) do nothing;

grant select, insert, update on table public.whatsapp_global_templates to authenticated;
grant all on table public.whatsapp_global_templates to service_role;

alter table public.whatsapp_global_templates enable row level security;

drop policy if exists "super admins read global whatsapp templates"
  on public.whatsapp_global_templates;
create policy "super admins read global whatsapp templates"
on public.whatsapp_global_templates for select to authenticated
using (private.is_super_admin((select auth.uid())));

drop policy if exists "super admins create global whatsapp templates"
  on public.whatsapp_global_templates;
create policy "super admins create global whatsapp templates"
on public.whatsapp_global_templates for insert to authenticated
with check (id = 'global' and private.is_super_admin((select auth.uid())));

drop policy if exists "super admins update global whatsapp templates"
  on public.whatsapp_global_templates;
create policy "super admins update global whatsapp templates"
on public.whatsapp_global_templates for update to authenticated
using (private.is_super_admin((select auth.uid())))
with check (id = 'global' and private.is_super_admin((select auth.uid())));

create or replace function private.touch_whatsapp_global_templates()
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

drop trigger if exists touch_whatsapp_global_templates
  on public.whatsapp_global_templates;
create trigger touch_whatsapp_global_templates
before update on public.whatsapp_global_templates
for each row execute function private.touch_whatsapp_global_templates();

revoke all on function private.touch_whatsapp_global_templates()
from public, anon, authenticated;

create or replace function private.whatsapp_effective_template(
  p_template_source text,
  p_field text,
  p_tenant_template text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  global_template text;
begin
  if coalesce(p_template_source, 'global') = 'custom' then
    return p_tenant_template;
  end if;

  select
    case p_field
      when 'client_registration_template' then defaults.client_registration_template
      when 'client_booking_template' then defaults.client_booking_template
      when 'professional_booking_template' then defaults.professional_booking_template
      when 'client_reminder_template' then defaults.client_reminder_template
      when 'client_cancellation_template' then defaults.client_cancellation_template
      when 'professional_cancellation_template' then defaults.professional_cancellation_template
      when 'client_reschedule_template' then defaults.client_reschedule_template
      when 'professional_reschedule_template' then defaults.professional_reschedule_template
      else null
    end
    into global_template
  from public.whatsapp_global_templates as defaults
  where defaults.id = 'global';

  return coalesce(nullif(global_template, ''), p_tenant_template);
end;
$$;

revoke all on function private.whatsapp_effective_template(text, text, text)
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
  client_booking_template text;
  professional_booking_template text;
  client_reminder_template text;
  client_cancellation_template text;
  professional_cancellation_template text;
  client_reschedule_template text;
  professional_reschedule_template text;
begin
  select whatsapp_settings.*
    into settings
  from public.tenant_whatsapp_settings as whatsapp_settings
  where whatsapp_settings.tenant_id = appointment_row.tenant_id
    and whatsapp_settings.enabled = true;

  if not found then
    return;
  end if;

  client_booking_template := private.whatsapp_effective_template(
    settings.message_templates_source,
    'client_booking_template',
    settings.client_booking_template
  );
  professional_booking_template := private.whatsapp_effective_template(
    settings.message_templates_source,
    'professional_booking_template',
    settings.professional_booking_template
  );
  client_reminder_template := private.whatsapp_effective_template(
    settings.message_templates_source,
    'client_reminder_template',
    settings.client_reminder_template
  );
  client_cancellation_template := private.whatsapp_effective_template(
    settings.message_templates_source,
    'client_cancellation_template',
    settings.client_cancellation_template
  );
  professional_cancellation_template := private.whatsapp_effective_template(
    settings.message_templates_source,
    'professional_cancellation_template',
    settings.professional_cancellation_template
  );
  client_reschedule_template := private.whatsapp_effective_template(
    settings.message_templates_source,
    'client_reschedule_template',
    settings.client_reschedule_template
  );
  professional_reschedule_template := private.whatsapp_effective_template(
    settings.message_templates_source,
    'professional_reschedule_template',
    settings.professional_reschedule_template
  );

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
        client_booking_template,
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
        professional_booking_template,
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
        client_reminder_template,
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
        client_cancellation_template,
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
        professional_cancellation_template,
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
        client_reschedule_template,
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
        professional_reschedule_template,
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
        client_reminder_template,
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
) from public, anon, authenticated;

create or replace function private.enqueue_customer_registration_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.tenant_whatsapp_settings%rowtype;
  client_row public.clients%rowtype;
  tenant_name text;
  client_phone text;
  client_registration_template text;
begin
  if new.whatsapp_consent_at is null then
    return new;
  end if;

  select whatsapp_settings.*
    into settings
  from public.tenant_whatsapp_settings as whatsapp_settings
  where whatsapp_settings.tenant_id = new.tenant_id
    and whatsapp_settings.enabled = true
    and whatsapp_settings.notify_client_registration = true;

  if not found then
    return new;
  end if;

  client_registration_template := private.whatsapp_effective_template(
    settings.message_templates_source,
    'client_registration_template',
    settings.client_registration_template
  );

  select client.*
    into client_row
  from public.clients as client
  where client.id = new.client_id
    and client.tenant_id = new.tenant_id;

  if not found then
    return new;
  end if;

  client_phone := regexp_replace(coalesce(client_row.whatsapp, ''), '[^0-9]', '', 'g');
  if length(client_phone) < 10 then
    return new;
  end if;

  select tenant.name
    into tenant_name
  from public.tenants as tenant
  where tenant.id = new.tenant_id;

  insert into public.whatsapp_message_queue (
    tenant_id,
    session_id,
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
    new.tenant_id,
    settings.session_id,
    'client_registered',
    'client',
    client_row.full_name,
    client_phone,
    client_registration_template,
    jsonb_build_object(
      'account_id', new.id,
      'tenant_id', new.tenant_id,
      'salao', coalesce(tenant_name, 'Salão'),
      'cliente', client_row.full_name
    ),
    now() + interval '3 seconds',
    new.id::text || ':registered:client'
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_customer_registration_whatsapp()
  from public, anon, authenticated;

commit;
