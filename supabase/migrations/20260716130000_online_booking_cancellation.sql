alter table public.appointments
  add column if not exists cancellation_token uuid,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text;

create unique index if not exists appointments_cancellation_token_uidx
  on public.appointments (cancellation_token)
  where cancellation_token is not null;

comment on column public.appointments.cancellation_token is
  'Secret token used by the public booking page to cancel an online appointment.';

comment on column public.appointments.cancelled_at is
  'Timestamp when the appointment was cancelled.';

comment on column public.appointments.cancelled_by is
  'Origin responsible for the cancellation, such as client_link or staff.';
