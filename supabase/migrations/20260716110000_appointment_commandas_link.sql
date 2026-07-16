alter table public.commandas
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists scheduled_at timestamptz,
  add column if not exists source text default 'manual';

update public.commandas
set scheduled_at = coalesce(closed_at, created_at)
where scheduled_at is null;

-- Vincula o histórico criado pela versão anterior, que armazenava o ID da comanda nas observações.
update public.commandas as commanda
set
  appointment_id = appointment.id,
  scheduled_at = appointment.start_at,
  source = coalesce(appointment.source, commanda.source, 'manual')
from public.appointments as appointment
where commanda.appointment_id is null
  and appointment.notes ~ 'Comanda ID: [0-9a-fA-F-]{36}'
  and commanda.id = split_part(split_part(appointment.notes, 'Comanda ID: ', 2), ' | ', 1)::uuid;

create index if not exists commandas_tenant_scheduled_idx
  on public.commandas(tenant_id, scheduled_at);

create index if not exists commandas_appointment_idx
  on public.commandas(appointment_id)
  where appointment_id is not null;

create unique index if not exists commandas_one_per_appointment_uidx
  on public.commandas(appointment_id)
  where appointment_id is not null;
