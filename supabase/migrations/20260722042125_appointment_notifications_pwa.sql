begin;

create extension if not exists pg_net with schema extensions;

alter table public.tenant_settings
  add column if not exists appointment_reception_alerts_enabled boolean not null default true,
  add column if not exists appointment_alert_repeat_seconds integer not null default 20;

alter table public.tenant_settings
  drop constraint if exists tenant_settings_appointment_alert_repeat_seconds_check;

alter table public.tenant_settings
  add constraint tenant_settings_appointment_alert_repeat_seconds_check
  check (appointment_alert_repeat_seconds between 5 and 300);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  kind text not null default 'appointment_created',
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_recipient_created_idx
  on public.app_notifications (recipient_user_id, created_at desc);

create index if not exists app_notifications_tenant_created_idx
  on public.app_notifications (tenant_id, created_at desc);

create unique index if not exists app_notifications_appointment_recipient_kind_uidx
  on public.app_notifications (appointment_id, recipient_user_id, kind)
  where appointment_id is not null;

grant select, delete on public.app_notifications to authenticated;
grant update (read_at, acknowledged_at) on public.app_notifications to authenticated;
grant all on public.app_notifications to service_role;

alter table public.app_notifications enable row level security;

drop policy if exists "users read own app notifications"
on public.app_notifications;

create policy "users read own app notifications"
on public.app_notifications for select to authenticated
using (recipient_user_id = (select auth.uid()));

drop policy if exists "users update own app notifications"
on public.app_notifications;

create policy "users update own app notifications"
on public.app_notifications for update to authenticated
using (recipient_user_id = (select auth.uid()))
with check (recipient_user_id = (select auth.uid()));

drop policy if exists "users delete own app notifications"
on public.app_notifications;

create policy "users delete own app notifications"
on public.app_notifications for delete to authenticated
using (recipient_user_id = (select auth.uid()));

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  user_agent text,
  platform text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id, tenant_id, enabled);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

alter table public.push_subscriptions enable row level security;

drop policy if exists "users read own push subscriptions"
on public.push_subscriptions;

create policy "users read own push subscriptions"
on public.push_subscriptions for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users insert own push subscriptions"
on public.push_subscriptions;

create policy "users insert own push subscriptions"
on public.push_subscriptions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.is_tenant_member((select auth.uid()), tenant_id)
);

drop policy if exists "users update own push subscriptions"
on public.push_subscriptions;

create policy "users update own push subscriptions"
on public.push_subscriptions for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and private.is_tenant_member((select auth.uid()), tenant_id)
);

drop policy if exists "users delete own push subscriptions"
on public.push_subscriptions;

create policy "users delete own push subscriptions"
on public.push_subscriptions for delete to authenticated
using (user_id = (select auth.uid()));

create or replace function private.touch_push_subscription_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at := now();
  new.last_seen_at := now();
  return new;
end;
$function$;

drop trigger if exists touch_push_subscription_updated_at
on public.push_subscriptions;

create trigger touch_push_subscription_updated_at
before update on public.push_subscriptions
for each row
execute function private.touch_push_subscription_updated_at();

create or replace function private.invoke_appointment_push_worker(p_appointment_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker_url text;
  v_worker_secret text;
  v_request_id bigint;
begin
  select decrypted_secret
  into v_worker_url
  from vault.decrypted_secrets
  where name = 'linkup_appointment_push_url'
  limit 1;

  select decrypted_secret
  into v_worker_secret
  from vault.decrypted_secrets
  where name = 'linkup_push_worker_secret'
  limit 1;

  if nullif(btrim(coalesce(v_worker_secret, '')), '') is null then
    select decrypted_secret
    into v_worker_secret
    from vault.decrypted_secrets
    where name = 'linkup_whatsapp_connector_secret'
    limit 1;
  end if;

  if nullif(btrim(coalesce(v_worker_url, '')), '') is null
     or nullif(btrim(coalesce(v_worker_secret, '')), '') is null then
    return null;
  end if;

  select net.http_post(
    url := v_worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-linkup-worker-secret', v_worker_secret
    ),
    body := jsonb_build_object(
      'action', 'dispatch-appointment',
      'appointmentId', p_appointment_id
    ),
    timeout_milliseconds := 15000
  )
  into v_request_id;

  return v_request_id;
end;
$function$;

create or replace function private.enqueue_appointment_app_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_service_name text;
  v_professional_name text;
  v_client_name text;
  v_title text;
  v_body text;
  v_recipient uuid;
begin
  if lower(coalesce(new.status, '')) in ('cancelled', 'canceled', 'cancelado') then
    return new;
  end if;

  select s.name
  into v_service_name
  from public.services s
  where s.id = new.service_id;

  select p.full_name
  into v_professional_name
  from public.professionals p
  where p.id = new.professional_id;

  v_client_name := nullif(btrim(coalesce(new.client_name, '')), '');
  v_client_name := coalesce(v_client_name, 'Cliente');
  v_service_name := coalesce(nullif(btrim(coalesce(v_service_name, '')), ''), 'Serviço agendado');
  v_professional_name := coalesce(nullif(btrim(coalesce(v_professional_name, '')), ''), 'Profissional');
  v_title := 'Novo agendamento';
  v_body := v_client_name || ' · ' || to_char(new.start_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ' · ' || v_service_name;

  for v_recipient in
    select distinct recipient_user_id
    from (
      select p.auth_user_id as recipient_user_id
      from public.professionals p
      where p.id = new.professional_id
        and p.tenant_id = new.tenant_id
        and p.active is distinct from false
        and p.auth_user_id is not null

      union all

      select ur.user_id as recipient_user_id
      from public.user_roles ur
      where ur.tenant_id = new.tenant_id
        and ur.role in ('owner'::public.app_role, 'staff'::public.app_role)
        and coalesce((
          select ts.appointment_reception_alerts_enabled
          from public.tenant_settings ts
          where ts.tenant_id = ur.tenant_id
          limit 1
        ), true)
    ) recipients
    where recipient_user_id is not null
  loop
    insert into public.app_notifications (
      tenant_id,
      recipient_user_id,
      appointment_id,
      kind,
      title,
      body,
      data
    )
    values (
      new.tenant_id,
      v_recipient,
      new.id,
      'appointment_created',
      v_title,
      v_body,
      jsonb_build_object(
        'appointmentId', new.id,
        'tenantId', new.tenant_id,
        'professionalId', new.professional_id,
        'professionalName', v_professional_name,
        'serviceId', new.service_id,
        'serviceName', v_service_name,
        'clientId', new.client_id,
        'clientName', v_client_name,
        'clientWhatsapp', new.client_whatsapp,
        'startAt', new.start_at,
        'endAt', new.end_at,
        'url', '/app/agenda'
      )
    )
    on conflict (appointment_id, recipient_user_id, kind)
    where appointment_id is not null
    do nothing;
  end loop;

  begin
    perform private.invoke_appointment_push_worker(new.id);
  exception
    when others then
      null;
  end;

  return new;
end;
$function$;

drop trigger if exists enqueue_appointment_app_notifications
on public.appointments;

create trigger enqueue_appointment_app_notifications
after insert on public.appointments
for each row
execute function private.enqueue_appointment_app_notifications();

do $block$
declare
  v_secret_id uuid;
begin
  select id
  into v_secret_id
  from vault.secrets
  where name = 'linkup_appointment_push_url'
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(
      'https://dcysbrxooqibozgctprn.supabase.co/functions/v1/appointment-push',
      'linkup_appointment_push_url',
      'URL interna do envio Push de novos agendamentos'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      'https://dcysbrxooqibozgctprn.supabase.co/functions/v1/appointment-push',
      'linkup_appointment_push_url',
      'URL interna do envio Push de novos agendamentos'
    );
  end if;

  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'app_notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.app_notifications';
    end if;

  end if;
exception
  when duplicate_object then
    null;
end;
$block$;

commit;
