alter table public.platform_billing_contracts
  add column if not exists promotional_discount_type text not null default 'none',
  add column if not exists promotional_discount_value numeric(14,2) not null default 0,
  add column if not exists promotional_discount_duration text not null default 'none',
  add column if not exists promotional_discount_starts_on date,
  add column if not exists promotional_discount_ends_on date;

update public.platform_billing_contracts
set
  promotional_discount_type = coalesce(nullif(promotional_discount_type, ''), 'none'),
  promotional_discount_value = coalesce(promotional_discount_value, 0),
  promotional_discount_duration = coalesce(nullif(promotional_discount_duration, ''), 'none')
where promotional_discount_type is null
   or promotional_discount_type = ''
   or promotional_discount_value is null
   or promotional_discount_duration is null
   or promotional_discount_duration = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_billing_contracts_promo_type_check'
      and conrelid = 'public.platform_billing_contracts'::regclass
  ) then
    alter table public.platform_billing_contracts
      add constraint platform_billing_contracts_promo_type_check
      check (promotional_discount_type in ('none', 'percentage', 'fixed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_billing_contracts_promo_value_check'
      and conrelid = 'public.platform_billing_contracts'::regclass
  ) then
    alter table public.platform_billing_contracts
      add constraint platform_billing_contracts_promo_value_check
      check (
        promotional_discount_value >= 0
        and (
          promotional_discount_type <> 'percentage'
          or promotional_discount_value <= 100
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_billing_contracts_promo_duration_check'
      and conrelid = 'public.platform_billing_contracts'::regclass
  ) then
    alter table public.platform_billing_contracts
      add constraint platform_billing_contracts_promo_duration_check
      check (
        promotional_discount_duration in (
          'none',
          '1_month',
          '2_months',
          '3_months',
          '6_months',
          '12_months',
          'custom'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_billing_contracts_promo_period_check'
      and conrelid = 'public.platform_billing_contracts'::regclass
  ) then
    alter table public.platform_billing_contracts
      add constraint platform_billing_contracts_promo_period_check
      check (
        (
          promotional_discount_type = 'none'
          and promotional_discount_value = 0
          and promotional_discount_duration = 'none'
        )
        or (
          promotional_discount_type <> 'none'
          and promotional_discount_value > 0
          and promotional_discount_duration <> 'none'
          and promotional_discount_starts_on is not null
          and promotional_discount_ends_on is not null
          and promotional_discount_ends_on >= promotional_discount_starts_on
        )
      );
  end if;
end $$;

create index if not exists platform_billing_contracts_promo_period_idx
  on public.platform_billing_contracts (promotional_discount_starts_on, promotional_discount_ends_on)
  where promotional_discount_type <> 'none';

create or replace function private.platform_billing_effective_amount(
  p_base_amount numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_discount_starts_on date,
  p_discount_ends_on date,
  p_reference_date date default current_date
)
returns numeric
language sql
stable
set search_path = public, private
as $$
  select greatest(
    0,
    round(
      case
        when coalesce(p_discount_type, 'none') = 'none'
          or coalesce(p_discount_value, 0) <= 0
          or p_discount_starts_on is null
          or p_discount_ends_on is null
          or p_reference_date < p_discount_starts_on
          or p_reference_date > p_discount_ends_on
          then coalesce(p_base_amount, 0)
        when p_discount_type = 'percentage'
          then coalesce(p_base_amount, 0)
            - (coalesce(p_base_amount, 0) * least(coalesce(p_discount_value, 0), 100) / 100)
        when p_discount_type = 'fixed'
          then coalesce(p_base_amount, 0) - coalesce(p_discount_value, 0)
        else coalesce(p_base_amount, 0)
      end,
      2
    )
  );
$$;
