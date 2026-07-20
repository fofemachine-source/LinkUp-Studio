
CREATE OR REPLACE FUNCTION public.register_booking_customer(p_tenant_id uuid, p_full_name text, p_cpf text, p_whatsapp text, p_cpf_hash text, p_password_hash text, p_whatsapp_consent boolean DEFAULT false, p_activation_code text DEFAULT NULL::text)
 RETURNS TABLE(account_id uuid, client_id uuid, full_name text, whatsapp text, cpf text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_client public.clients%rowtype;
  v_existing_account public.customer_booking_accounts%rowtype;
  v_has_existing_account boolean := false;
  v_account_id uuid;
  v_activation public.customer_booking_activation_codes%rowtype;
  v_has_subscription boolean := false;
begin
  if not exists (
    select 1 from public.tenants as tenant
    where tenant.id = p_tenant_id and tenant.status = 'active'
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

  select account.* into v_existing_account
  from public.customer_booking_accounts as account
  where account.tenant_id = p_tenant_id and account.cpf_hash = p_cpf_hash
  for update;
  v_has_existing_account := found;

  -- If an account already exists, tell caller clearly to log in.
  if v_has_existing_account then
    raise exception 'CUSTOMER_ACCOUNT_EXISTS' using errcode = 'P0001';
  end if;

  select client.* into v_client
  from public.clients as client
  where client.tenant_id = p_tenant_id and client.cpf = p_cpf
  for update;

  if found then
    -- Client pre-registered by staff. If they have a subscription, require activation.
    select exists(
      select 1 from public.client_subscriptions as subscription
      where subscription.tenant_id = p_tenant_id
        and regexp_replace(coalesce(subscription.cpf, ''), '[^0-9]', '', 'g') = p_cpf
    ) into v_has_subscription;

    if v_has_subscription then
      if p_activation_code is null or btrim(p_activation_code) = '' then
        raise exception 'EXISTING_CUSTOMER_REQUIRES_ACTIVATION' using errcode = 'P0001';
      end if;

      select activation.* into v_activation
      from public.customer_booking_activation_codes as activation
      where activation.tenant_id = p_tenant_id
        and activation.client_id = v_client.id
        and activation.code_hash = encode(
          extensions.digest(
            upper(regexp_replace(p_activation_code, '[^0-9A-Fa-f]', '', 'g')),
            'sha256'
          ),
          'hex'
        )
        and activation.used_at is null
        and activation.expires_at > clock_timestamp()
      order by activation.created_at desc
      limit 1
      for update;

      if not found then
        raise exception 'INVALID_CUSTOMER_ACTIVATION' using errcode = 'P0001';
      end if;

      update public.customer_booking_activation_codes
      set used_at = clock_timestamp() where id = v_activation.id;
    end if;

    update public.clients
    set full_name = btrim(p_full_name),
        whatsapp = p_whatsapp,
        cpf = p_cpf
    where id = v_client.id
    returning * into v_client;

    update public.client_subscriptions
    set client_id = v_client.id,
        subscriber_name = v_client.full_name,
        whatsapp = v_client.whatsapp,
        cpf = p_cpf
    where tenant_id = p_tenant_id
      and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = p_cpf
      and (client_id is null or client_id = v_client.id);

    update public.clients
    set is_subscriber = exists (
      select 1 from public.client_subscriptions as subscription
      where subscription.tenant_id = p_tenant_id
        and subscription.client_id = v_client.id
        and subscription.status in ('pending_activation', 'active', 'overdue', 'suspended')
    )
    where id = v_client.id and tenant_id = p_tenant_id;
  else
    insert into public.clients (tenant_id, full_name, whatsapp, cpf)
    values (p_tenant_id, btrim(p_full_name), p_whatsapp, p_cpf)
    returning * into v_client;
  end if;

  insert into public.customer_booking_accounts (
    tenant_id, client_id, cpf_hash, password_hash, whatsapp_consent_at
  ) values (
    p_tenant_id, v_client.id, p_cpf_hash, p_password_hash,
    case when p_whatsapp_consent then now() else null end
  )
  returning id into v_account_id;

  return query
  select v_account_id, v_client.id, v_client.full_name, v_client.whatsapp, v_client.cpf;
end;
$function$;
