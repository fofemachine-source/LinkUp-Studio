begin;

create or replace function public.register_appointment_push_subscription(
  p_tenant_id uuid,
  p_endpoint text,
  p_subscription jsonb,
  p_user_agent text default null,
  p_platform text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.'
      using errcode = '28000';
  end if;

  if p_tenant_id is null then
    raise exception 'Loja não informada.'
      using errcode = '22023';
  end if;

  if coalesce(trim(p_endpoint), '') = '' then
    raise exception 'Endpoint push inválido.'
      using errcode = '22023';
  end if;

  if p_subscription is null or jsonb_typeof(p_subscription) <> 'object' then
    raise exception 'Inscrição push inválida.'
      using errcode = '22023';
  end if;

  if not private.is_tenant_member(v_user_id, p_tenant_id) then
    raise exception 'Usuário sem acesso à loja.'
      using errcode = '42501';
  end if;

  delete from public.push_subscriptions
  where endpoint = p_endpoint
    and (
      user_id <> v_user_id
      or tenant_id <> p_tenant_id
    );

  insert into public.push_subscriptions (
    tenant_id,
    user_id,
    endpoint,
    subscription,
    user_agent,
    platform,
    enabled,
    last_seen_at
  )
  values (
    p_tenant_id,
    v_user_id,
    p_endpoint,
    p_subscription,
    p_user_agent,
    p_platform,
    true,
    now()
  )
  on conflict (endpoint) do update
  set
    tenant_id = excluded.tenant_id,
    user_id = excluded.user_id,
    subscription = excluded.subscription,
    user_agent = excluded.user_agent,
    platform = excluded.platform,
    enabled = true,
    last_seen_at = now(),
    updated_at = now();
end;
$function$;

revoke all on function public.register_appointment_push_subscription(uuid, text, jsonb, text, text)
from public, anon;

grant execute on function public.register_appointment_push_subscription(uuid, text, jsonb, text, text)
to authenticated;

notify pgrst, 'reload schema';

commit;
