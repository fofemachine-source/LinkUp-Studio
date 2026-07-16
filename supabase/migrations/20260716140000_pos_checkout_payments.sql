-- Frente de Caixa: recebimento detalhado e fechamento transacional da comanda.

alter table public.commandas
  add column if not exists notes text,
  add column if not exists amount_received numeric(14,2) not null default 0,
  add column if not exists change_amount numeric(14,2) not null default 0,
  add column if not exists cancellation_reason text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.commandas
  drop constraint if exists commandas_amount_received_nonnegative;
alter table public.commandas
  add constraint commandas_amount_received_nonnegative
  check (amount_received >= 0) not valid;
alter table public.commandas validate constraint commandas_amount_received_nonnegative;

alter table public.commandas
  drop constraint if exists commandas_change_amount_nonnegative;
alter table public.commandas
  add constraint commandas_change_amount_nonnegative
  check (change_amount >= 0) not valid;
alter table public.commandas validate constraint commandas_change_amount_nonnegative;

create table if not exists public.commanda_payments (
  id uuid primary key default gen_random_uuid(),
  commanda_id uuid not null references public.commandas(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  method text not null check (method in ('pix', 'cash', 'debit', 'credit', 'vip')),
  amount numeric(14,2) not null check (amount >= 0),
  received_amount numeric(14,2) not null default 0 check (received_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists commanda_payments_commanda_idx
  on public.commanda_payments (commanda_id);
create index if not exists commanda_payments_tenant_created_idx
  on public.commanda_payments (tenant_id, created_at desc);

grant select, insert, update, delete on public.commanda_payments to authenticated;
grant all on public.commanda_payments to service_role;
revoke all on public.commanda_payments from anon;

alter table public.commanda_payments enable row level security;

drop policy if exists "tenant members manage commanda payments" on public.commanda_payments;
create policy "tenant members manage commanda payments"
on public.commanda_payments for all to authenticated
using (private.is_tenant_member((select auth.uid()), tenant_id))
with check (private.is_tenant_member((select auth.uid()), tenant_id));

create or replace function public.finalize_commanda(
  p_commanda_id uuid,
  p_tenant_id uuid,
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
  v_commanda public.commandas%rowtype;
  v_payment record;
  v_payment_total numeric(14,2) := 0;
  v_payment_count integer := 0;
  v_payment_method text;
  v_now timestamptz := now();
begin
  select *
    into v_commanda
  from public.commandas
  where id = p_commanda_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Comanda não encontrada ou acesso negado.' using errcode = 'P0002';
  end if;

  if coalesce(v_commanda.status, 'open') not in ('open', 'awaiting_payment') then
    raise exception 'A comanda não está disponível para recebimento.' using errcode = 'P0001';
  end if;

  if p_subtotal < 0 or p_discount < 0 or p_addition < 0 or p_total < 0 then
    raise exception 'Os valores da comanda não podem ser negativos.' using errcode = '22003';
  end if;

  if jsonb_typeof(coalesce(p_payments, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_payments, '[]'::jsonb)) = 0 then
    raise exception 'Informe ao menos uma forma de pagamento.' using errcode = '22000';
  end if;

  for v_payment in
    select
      payment.method,
      round(coalesce(payment.amount, 0)::numeric, 2) as amount,
      round(coalesce(payment.received, payment.amount, 0)::numeric, 2) as received
    from jsonb_to_recordset(p_payments) as payment(method text, amount numeric, received numeric)
  loop
    if v_payment.method not in ('pix', 'cash', 'debit', 'credit', 'vip') then
      raise exception 'Forma de pagamento inválida.' using errcode = '22000';
    end if;

    if v_payment.amount < 0 or v_payment.received < 0 then
      raise exception 'O valor do pagamento não pode ser negativo.' using errcode = '22003';
    end if;

    if v_payment.method = 'cash' and v_payment.received + 0.009 < v_payment.amount then
      raise exception 'O valor recebido em dinheiro é menor que o valor informado.' using errcode = '22000';
    end if;

    v_payment_total := v_payment_total + v_payment.amount;
    v_payment_count := v_payment_count + 1;
    v_payment_method := case
      when v_payment_count = 1 then v_payment.method
      else 'mixed'
    end;
  end loop;

  if abs(round(v_payment_total, 2) - round(p_total, 2)) > 0.009 then
    raise exception 'A soma dos pagamentos deve ser igual ao total da comanda.' using errcode = '22000';
  end if;

  if v_payment_method <> 'vip'
     and abs(round((p_subtotal - p_discount + p_addition)::numeric, 2) - round(p_total::numeric, 2)) > 0.009 then
    raise exception 'O total informado não confere com os ajustes da comanda.' using errcode = '22000';
  end if;

  if p_amount_received < p_total or p_change_amount < 0 then
    raise exception 'Os valores de recebimento ou troco são inválidos.' using errcode = '22000';
  end if;

  update public.commandas
  set
    status = 'closed',
    subtotal = round(p_subtotal, 2),
    discount = round(p_discount, 2),
    addition = round(p_addition, 2),
    total = round(p_total, 2),
    notes = nullif(trim(p_notes), ''),
    payment_method = v_payment_method,
    amount_received = round(p_amount_received, 2),
    change_amount = round(p_change_amount, 2),
    closed_at = v_now,
    updated_at = v_now
  where id = p_commanda_id;

  delete from public.commanda_payments
  where commanda_id = p_commanda_id;

  insert into public.commanda_payments (
    commanda_id,
    tenant_id,
    method,
    amount,
    received_amount
  )
  select
    p_commanda_id,
    p_tenant_id,
    payment.method,
    round(coalesce(payment.amount, 0)::numeric, 2),
    round(coalesce(payment.received, payment.amount, 0)::numeric, 2)
  from jsonb_to_recordset(p_payments) as payment(method text, amount numeric, received numeric);

  delete from public.cash_movements
  where tenant_id = p_tenant_id
    and reference_type = 'comanda'
    and reference_id = p_commanda_id;

  insert into public.cash_movements (
    tenant_id,
    kind,
    amount,
    description,
    payment_method,
    source,
    reference_type,
    reference_id,
    movement_date,
    competence_date,
    due_date,
    paid_at,
    status
  )
  select
    p_tenant_id,
    'in',
    round(coalesce(payment.amount, 0)::numeric, 2),
    'Comanda #' || v_commanda.number || ' · ' || payment.method,
    payment.method,
    'comanda',
    'comanda',
    p_commanda_id,
    v_now::date,
    v_now::date,
    v_now::date,
    v_now,
    'paid'
  from jsonb_to_recordset(p_payments) as payment(method text, amount numeric, received numeric)
  where coalesce(payment.amount, 0) > 0
    and payment.method <> 'vip';

  update public.products product
  set stock = greatest(0, coalesce(product.stock, 0) - sold.quantity)
  from (
    select ref_id, sum(coalesce(quantity, 1))::integer as quantity
    from public.commanda_items
    where commanda_id = p_commanda_id
      and kind = 'product'
      and ref_id is not null
    group by ref_id
  ) sold
  where product.id = sold.ref_id
    and product.tenant_id = p_tenant_id;

  if v_commanda.appointment_id is not null then
    update public.appointments
    set status = 'completed'
    where id = v_commanda.appointment_id
      and tenant_id = p_tenant_id;
  end if;

  return jsonb_build_object(
    'id', p_commanda_id,
    'status', 'closed',
    'total', round(p_total, 2),
    'payment_method', v_payment_method,
    'closed_at', v_now
  );
end;
$$;

revoke all on function public.finalize_commanda(uuid, uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, jsonb) from public;
revoke all on function public.finalize_commanda(uuid, uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, jsonb) from anon;
grant execute on function public.finalize_commanda(uuid, uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, jsonb) to authenticated;
grant execute on function public.finalize_commanda(uuid, uuid, numeric, numeric, numeric, numeric, text, numeric, numeric, jsonb) to service_role;
