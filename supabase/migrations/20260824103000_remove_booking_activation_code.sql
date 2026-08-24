-- Migration: Remove customer activation/liberation code requirement
-- Created at: 2026-08-24T10:30:00

CREATE OR REPLACE FUNCTION public.register_booking_customer(
  p_tenant_id uuid,
  p_full_name text,
  p_cpf text,
  p_whatsapp text,
  p_cpf_hash text,
  p_password_hash text,
  p_whatsapp_consent boolean DEFAULT false,
  p_activation_code text DEFAULT NULL::text
)
RETURNS TABLE(account_id uuid, client_id uuid, full_name text, whatsapp text, cpf text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_client public.clients%rowtype;
  v_existing_account public.customer_booking_accounts%rowtype;
  v_has_existing_account boolean := false;
  v_account_id uuid;
  v_has_subscription boolean := false;
BEGIN
  if not exists (
    select 1
    from public.tenants as tenant
    where tenant.id = p_tenant_id
      and tenant.status = 'active'
  ) then
    raise exception 'BOOKING_LINK_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) < 2
    or p_cpf !~ '^[0-9]{11}$'
    or p_whatsapp !~ '^[0-9]{10,13}$'
    or p_cpf_hash !~ '^[a-f0-9]{64}$'
    or p_password_hash is null
  then
    raise exception 'INVALID_CUSTOMER_REGISTRATION' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || p_cpf_hash, 0)
  );

  select account.*
    into v_existing_account
  from public.customer_booking_accounts as account
  where account.tenant_id = p_tenant_id
    and account.cpf_hash = p_cpf_hash
  for update;

  v_has_existing_account := found;

  if v_has_existing_account then
    select client.*
      into v_client
    from public.clients as client
    where client.tenant_id = p_tenant_id
      and client.id = v_existing_account.client_id
    for update;

    if not found then
      raise exception 'CUSTOMER_ACCOUNT_EXISTS' using errcode = 'P0001';
    end if;

    -- Normalize and check if WhatsApp matches for security when account already exists
    if private.normalize_booking_whatsapp(v_client.whatsapp) <> private.normalize_booking_whatsapp(p_whatsapp) then
      raise exception 'CUSTOMER_ACCOUNT_EXISTS' using errcode = 'P0001';
    end if;

    -- Update existing client data
    update public.clients
    set
      full_name = btrim(p_full_name),
      whatsapp = p_whatsapp,
      cpf = p_cpf
    where id = v_client.id
      and tenant_id = p_tenant_id
    returning * into v_client;

    -- Update account password (acting as password reset/update since WhatsApp is confirmed)
    update public.customer_booking_accounts
    set
      password_hash = p_password_hash,
      failed_login_attempts = 0,
      locked_until = null,
      whatsapp_consent_at = case
        when p_whatsapp_consent then coalesce(whatsapp_consent_at, clock_timestamp())
        else whatsapp_consent_at
      end
    where id = v_existing_account.id
      and tenant_id = p_tenant_id
    returning id into v_account_id;

    update public.client_subscriptions
    set
      client_id = v_client.id,
      subscriber_name = v_client.full_name,
      whatsapp = v_client.whatsapp,
      cpf = p_cpf
    where tenant_id = p_tenant_id
      and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = p_cpf
      and (client_id is null or client_id = v_client.id);

    delete from public.customer_booking_sessions
    where account_id = v_existing_account.id
      and tenant_id = p_tenant_id;

    return query
    select
      v_account_id,
      v_client.id,
      v_client.full_name,
      v_client.whatsapp,
      v_client.cpf;
    return;
  end if;

  -- Case: No existing customer_booking_account
  select client.*
    into v_client
  from public.clients as client
  where client.tenant_id = p_tenant_id
    and client.cpf = p_cpf
  for update;

  if found then
    -- First access: client exists in clients table, but has no online account.
    -- Update WhatsApp and details with no activation code requirement
    update public.clients
    set
      full_name = btrim(p_full_name),
      whatsapp = p_whatsapp,
      cpf = p_cpf
    where id = v_client.id
      and tenant_id = p_tenant_id
    returning * into v_client;
  else
    -- Completely new client
    select exists (
      select 1
      from public.client_subscriptions as subscription
      where subscription.tenant_id = p_tenant_id
        and regexp_replace(coalesce(subscription.cpf, ''), '[^0-9]', '', 'g') = p_cpf
    )
    into v_has_subscription;

    insert into public.clients (
      tenant_id,
      full_name,
      whatsapp,
      cpf,
      is_subscriber
    )
    values (
      p_tenant_id,
      btrim(p_full_name),
      p_whatsapp,
      p_cpf,
      v_has_subscription
    )
    returning * into v_client;
  end if;

  update public.client_subscriptions
  set
    client_id = v_client.id,
    subscriber_name = v_client.full_name,
    whatsapp = v_client.whatsapp,
    cpf = p_cpf
  where tenant_id = p_tenant_id
    and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = p_cpf
    and (client_id is null or client_id = v_client.id);

  update public.clients
  set is_subscriber = exists (
    select 1
    from public.client_subscriptions as subscription
    where subscription.tenant_id = p_tenant_id
      and subscription.client_id = v_client.id
      and subscription.status in ('pending_activation', 'active', 'overdue', 'suspended')
  )
  where id = v_client.id
    and tenant_id = p_tenant_id
  returning * into v_client;

  insert into public.customer_booking_accounts (
    tenant_id,
    client_id,
    cpf_hash,
    password_hash,
    whatsapp_consent_at
  )
  values (
    p_tenant_id,
    v_client.id,
    p_cpf_hash,
    p_password_hash,
    case when p_whatsapp_consent then now() else null end
  )
  returning id into v_account_id;

  return query
  select
    v_account_id,
    v_client.id,
    v_client.full_name,
    v_client.whatsapp,
    v_client.cpf;
END;
$function$;

notify pgrst, 'reload schema';
