-- Appointment request workflow MVP.
-- Adds explicit intent, completeness, workflow status, and owner action fields.

alter table public.appointment_requests
  add column if not exists requested_datetime_text text,
  add column if not exists appointment_intent_detected boolean not null default true,
  add column if not exists missing_fields text[] not null default array[]::text[],
  add column if not exists needs_review boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists suggested_datetime_text text,
  add column if not exists contacted_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.appointment_requests
  drop constraint if exists appointment_requests_status_check;

alter table public.appointment_requests
  add constraint appointment_requests_status_check
  check (status in ('new', 'needs_review', 'confirmed', 'suggested_time', 'contacted', 'archived'));

update public.appointment_requests
set
  status = case
    when archived_at is not null then 'archived'
    when approved_at is not null then 'confirmed'
    when needs_review then 'needs_review'
    when status in ('pending', 'quoted', 'declined', 'converted') then 'needs_review'
    else status
  end;

create index if not exists appointment_requests_business_id_status_idx
  on public.appointment_requests (business_id, status);

create index if not exists appointment_requests_business_id_needs_review_idx
  on public.appointment_requests (business_id, needs_review, created_at desc);
