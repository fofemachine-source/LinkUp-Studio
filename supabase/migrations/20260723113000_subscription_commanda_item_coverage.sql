begin;

alter table public.commanda_items
  add column if not exists covered_by_subscription boolean not null default false,
  add column if not exists subscription_id uuid,
  add column if not exists subscription_benefit_id uuid,
  add column if not exists billable_amount numeric(14,2);

create index if not exists commanda_items_subscription_idx
  on public.commanda_items (subscription_id)
  where subscription_id is not null;

create index if not exists commanda_items_coverage_idx
  on public.commanda_items (tenant_id, covered_by_subscription)
  where covered_by_subscription;

with covered_items as (
  select
    item.id as item_id,
    commanda.subscription_id,
    benefit.id as benefit_id
  from public.commanda_items item
  join public.commandas commanda
    on commanda.id = item.commanda_id
   and commanda.tenant_id = item.tenant_id
  join public.client_subscriptions subscription
    on subscription.id = commanda.subscription_id
   and subscription.tenant_id = item.tenant_id
  join public.subscription_plan_benefits benefit
    on benefit.plan_id = subscription.plan_id
   and benefit.tenant_id = item.tenant_id
   and benefit.service_id = item.ref_id
   and benefit.benefit_type = 'service'
   and benefit.active
  where item.kind = 'service'
    and commanda.subscription_id is not null
)
update public.commanda_items item
set
  covered_by_subscription = true,
  subscription_id = covered_items.subscription_id,
  subscription_benefit_id = covered_items.benefit_id,
  billable_amount = 0
from covered_items
where item.id = covered_items.item_id;

update public.commanda_items item
set billable_amount = round(coalesce(item.unit_price, 0) * greatest(1, coalesce(item.quantity, 1)), 2)
where item.billable_amount is null;

with item_totals as (
  select
    item.commanda_id,
    item.tenant_id,
    round(coalesce(sum(coalesce(item.billable_amount, round(coalesce(item.unit_price, 0) * greatest(1, coalesce(item.quantity, 1)), 2))), 0), 2) as billable_subtotal
  from public.commanda_items item
  group by item.commanda_id, item.tenant_id
)
update public.commandas commanda
set
  subtotal = item_totals.billable_subtotal,
  total = greatest(
    0,
    round(item_totals.billable_subtotal - coalesce(commanda.discount, 0) + coalesce(commanda.addition, 0), 2)
  ),
  updated_at = now()
from item_totals
where commanda.id = item_totals.commanda_id
  and commanda.tenant_id = item_totals.tenant_id
  and commanda.subscription_id is not null
  and coalesce(commanda.status, 'open') in ('open', 'awaiting_payment');

create or replace function public.finalize_commanda_with_subscription(
  p_commanda_id uuid,
  p_tenant_id uuid,
  p_subscription_id uuid,
  p_subtotal numeric,
  p_discount numeric,
  p_addition numeric,
  p_total numeric,
  p_notes text,
  p_amount_received numeric,
  p_change_amount numeric,
  p_payments jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription public.client_subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_commanda public.commandas%rowtype;
  v_item record;
  v_benefit_id uuid;
  v_item_line_total numeric;
  v_item_billable numeric;
  v_extra_subtotal numeric := 0;
  v_covered_items integer := 0;
  v_result jsonb;
begin
  select * into v_subscription
  from public.client_subscriptions
  where id = p_subscription_id
    and tenant_id = p_tenant_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Assinatura ativa não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = v_subscription.plan_id
    and tenant_id = p_tenant_id;

  if not found then
    raise exception 'Plano da assinatura não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_commanda
  from public.commandas
  where id = p_commanda_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Comanda não encontrada.' using errcode = 'P0002';
  end if;

  if v_subscription.client_id is not null
     and v_commanda.client_id is distinct from v_subscription.client_id then
    raise exception 'A assinatura não pertence ao cliente da comanda.' using errcode = 'P0001';
  end if;

  for v_item in
    select item.*
    from public.commanda_items item
    where item.commanda_id = p_commanda_id
      and item.tenant_id = p_tenant_id
  loop
    v_item_line_total := round(coalesce(v_item.unit_price, 0) * greatest(1, coalesce(v_item.quantity, 1)), 2);
    v_item_billable := round(coalesce(v_item.billable_amount, v_item_line_total), 2);

    if coalesce(v_item.covered_by_subscription, false) then
      if v_item.kind <> 'service' then
        raise exception 'Apenas serviços podem ser baixados pela assinatura.' using errcode = 'P0001';
      end if;

      if v_item.subscription_id is not null and v_item.subscription_id <> p_subscription_id then
        raise exception 'Item coberto pertence a outra assinatura.' using errcode = 'P0001';
      end if;

      v_benefit_id := v_item.subscription_benefit_id;

      if v_benefit_id is null then
        select benefit.id into v_benefit_id
        from public.subscription_plan_benefits benefit
        where benefit.plan_id = v_subscription.plan_id
          and benefit.tenant_id = p_tenant_id
          and benefit.service_id = v_item.ref_id
          and benefit.benefit_type = 'service'
          and benefit.active
        order by benefit.created_at
        limit 1;
      end if;

      if v_benefit_id is null then
        raise exception 'Item marcado como assinatura não está incluso no plano.' using errcode = 'P0001';
      end if;

      v_covered_items := v_covered_items + greatest(1, coalesce(v_item.quantity, 1));
    else
      if v_item_billable > 0 and not v_plan.allow_extras then
        raise exception 'A comanda possui item não coberto e este plano não permite extras.'
          using errcode = 'P0001';
      end if;

      v_extra_subtotal := v_extra_subtotal + v_item_billable;
    end if;
  end loop;

  if v_covered_items = 0 then
    raise exception 'Nenhum serviço desta comanda está coberto pela assinatura.'
      using errcode = 'P0001';
  end if;

  if abs(round(v_extra_subtotal, 2) - round(p_subtotal, 2)) > 0.009 then
    raise exception 'O subtotal excedente não confere com os itens fora da assinatura.'
      using errcode = 'P0001';
  end if;

  v_result := public.finalize_commanda(
    p_commanda_id,
    p_tenant_id,
    p_subtotal,
    p_discount,
    p_addition,
    p_total,
    p_notes,
    p_amount_received,
    p_change_amount,
    p_payments
  );

  for v_item in
    select item.*
    from public.commanda_items item
    where item.commanda_id = p_commanda_id
      and item.tenant_id = p_tenant_id
      and item.kind = 'service'
      and coalesce(item.covered_by_subscription, false)
  loop
    v_benefit_id := v_item.subscription_benefit_id;

    if v_benefit_id is null then
      select benefit.id into v_benefit_id
      from public.subscription_plan_benefits benefit
      where benefit.plan_id = v_subscription.plan_id
        and benefit.tenant_id = p_tenant_id
        and benefit.service_id = v_item.ref_id
        and benefit.benefit_type = 'service'
        and benefit.active
      order by benefit.created_at
      limit 1;
    end if;

    if v_benefit_id is not null then
      perform public.register_subscription_usage(
        p_subscription_id,
        v_benefit_id,
        p_commanda_id,
        v_item.id,
        v_commanda.appointment_id,
        v_item.ref_id,
        v_item.professional_id,
        greatest(1, coalesce(v_item.quantity, 1)),
        'Consumo automático no fechamento da comanda',
        'checkout'
      );
    end if;
  end loop;

  return v_result || jsonb_build_object('subscription_id', p_subscription_id);
end;
$$;

revoke execute on function public.finalize_commanda_with_subscription(
  uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, jsonb
) from public, anon;

grant execute on function public.finalize_commanda_with_subscription(
  uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
