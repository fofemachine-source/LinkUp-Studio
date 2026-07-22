begin;

alter table public.subscription_charges
  add column if not exists proof_storage_path text,
  add column if not exists proof_file_name text,
  add column if not exists proof_content_type text,
  add column if not exists proof_size_bytes bigint,
  add column if not exists proof_submitted_at timestamptz,
  add column if not exists proof_status text default 'none',
  add column if not exists proof_reviewed_at timestamptz,
  add column if not exists proof_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists proof_rejection_reason text,
  add column if not exists paid_by uuid references auth.users(id) on delete set null,
  add column if not exists payment_token uuid default gen_random_uuid(),
  add column if not exists payment_token_expires_at timestamptz default (now() + interval '2 hours');

update public.subscription_charges
set
  proof_status = coalesce(proof_status, 'none'),
  payment_token = coalesce(payment_token, gen_random_uuid()),
  payment_token_expires_at = coalesce(payment_token_expires_at, now() + interval '2 hours');

alter table public.subscription_charges
  alter column proof_status set default 'none',
  alter column proof_status set not null,
  alter column payment_token set default gen_random_uuid(),
  alter column payment_token set not null,
  alter column payment_token_expires_at set default (now() + interval '2 hours'),
  alter column payment_token_expires_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_charges_proof_status_check'
      and conrelid = 'public.subscription_charges'::regclass
  ) then
    alter table public.subscription_charges
      add constraint subscription_charges_proof_status_check
      check (proof_status in ('none', 'pending_review', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_charges_proof_size_check'
      and conrelid = 'public.subscription_charges'::regclass
  ) then
    alter table public.subscription_charges
      add constraint subscription_charges_proof_size_check
      check (
        proof_size_bytes is null
        or proof_size_bytes between 1 and 5242880
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_charges_proof_consistency_check'
      and conrelid = 'public.subscription_charges'::regclass
  ) then
    alter table public.subscription_charges
      add constraint subscription_charges_proof_consistency_check
      check (
        (
          proof_status = 'none'
          and proof_storage_path is null
        )
        or (
          proof_status in ('pending_review', 'rejected')
          and proof_storage_path is not null
          and status in ('pending', 'overdue')
        )
        or (
          proof_status = 'approved'
          and proof_storage_path is not null
          and status = 'paid'
        )
      );
  end if;
end;
$$;

create index if not exists subscription_charges_pending_proof_idx
  on public.subscription_charges (tenant_id, due_date, proof_submitted_at)
  where proof_status = 'pending_review';

create unique index if not exists subscription_charges_payment_token_uidx
  on public.subscription_charges (payment_token);

select pg_notify('pgrst', 'reload schema');

commit;
