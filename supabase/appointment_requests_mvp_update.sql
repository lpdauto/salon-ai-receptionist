-- MVP appointment request updates.
-- Run this once before saving voice-server appointment requests.

alter table public.appointment_requests
  add column if not exists requested_day text;

alter table public.appointment_requests
  drop constraint if exists appointment_requests_status_check;

alter table public.appointment_requests
  add constraint appointment_requests_status_check
  check (status in ('new', 'pending', 'needs_review', 'quoted', 'declined', 'converted'));

alter table public.appointment_requests
  alter column status set default 'new';
