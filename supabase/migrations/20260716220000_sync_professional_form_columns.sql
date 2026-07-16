begin;

-- Garante que o banco publicado possua todos os campos enviados pelo
-- formulário de cadastro de profissionais.
alter table public.professionals
  add column if not exists email text,
  add column if not exists specialty text,
  add column if not exists lunch_start time without time zone,
  add column if not exists lunch_end time without time zone,
  add column if not exists auth_user_id uuid,
  add column if not exists work_days integer[]
    default array[1, 2, 3, 4, 5, 6]::integer[],
  add column if not exists blocked_dates text[]
    default array[]::text[];

create unique index if not exists professionals_auth_user_id_key
on public.professionals (auth_user_id)
where auth_user_id is not null;

update public.professionals
set work_days = array[1, 2, 3, 4, 5, 6]::integer[]
where work_days is null;

update public.professionals
set blocked_dates = array[]::text[]
where blocked_dates is null;

notify pgrst, 'reload schema';

commit;
