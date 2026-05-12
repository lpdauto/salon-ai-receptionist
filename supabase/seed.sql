-- Salon AI Receptionist MVP seed data.
-- This creates one demo business and related salon data.
-- User membership rows require real auth.users IDs, so they are not seeded here.

insert into public.businesses (id, name, slug, phone, timezone)
values (
  '11111111-1111-1111-1111-111111111111',
  'Luxe Nail Studio',
  'luxe-nail-studio',
  '+16265550100',
  'America/Los_Angeles'
)
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  phone = excluded.phone,
  timezone = excluded.timezone;

insert into public.business_hours (business_id, day_of_week, opens_at, closes_at, is_closed)
values
  ('11111111-1111-1111-1111-111111111111', 0, null, null, true),
  ('11111111-1111-1111-1111-111111111111', 1, '09:30', '18:30', false),
  ('11111111-1111-1111-1111-111111111111', 2, '09:30', '18:30', false),
  ('11111111-1111-1111-1111-111111111111', 3, '09:30', '18:30', false),
  ('11111111-1111-1111-1111-111111111111', 4, '09:30', '18:30', false),
  ('11111111-1111-1111-1111-111111111111', 5, '09:30', '19:00', false),
  ('11111111-1111-1111-1111-111111111111', 6, '10:00', '17:00', false)
on conflict (business_id, day_of_week) do update
set
  opens_at = excluded.opens_at,
  closes_at = excluded.closes_at,
  is_closed = excluded.is_closed;

insert into public.services (business_id, name, description, price_cents, duration_minutes, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'Gel Manicure', 'Long-wear gel polish manicure with shaping and cuticle care.', 4500, 45, true),
  ('11111111-1111-1111-1111-111111111111', 'Classic Pedicure', 'Foot soak, nail care, light callus care, massage, and polish.', 5000, 50, true),
  ('11111111-1111-1111-1111-111111111111', 'Acrylic Full Set', 'Full acrylic extension set with polish.', 7500, 90, true),
  ('11111111-1111-1111-1111-111111111111', 'Acrylic Fill', 'Maintenance fill for existing acrylic extensions.', 5500, 60, true);

insert into public.ai_settings (
  business_id,
  greeting,
  personality,
  primary_language,
  supported_languages,
  language_detection_enabled,
  voice_name,
  escalation_phone,
  booking_policy,
  faq_notes
)
values (
  '11111111-1111-1111-1111-111111111111',
  'Thank you for calling Luxe Nail Studio. How can I help you today?',
  'Warm, calm, efficient, and respectful. Confirm details clearly before ending the call.',
  'English',
  array['English', 'Vietnamese', 'Cantonese', 'Mandarin'],
  true,
  'alloy',
  '+16265550101',
  'Appointment requests should be captured for owner review. Do not confirm bookings unless availability has been verified.',
  'Ask for name, phone number, preferred service, preferred date and time, and whether they need removal or nail art.'
)
on conflict (business_id) do update
set
  greeting = excluded.greeting,
  personality = excluded.personality,
  primary_language = excluded.primary_language,
  supported_languages = excluded.supported_languages,
  language_detection_enabled = excluded.language_detection_enabled,
  voice_name = excluded.voice_name,
  escalation_phone = excluded.escalation_phone,
  booking_policy = excluded.booking_policy,
  faq_notes = excluded.faq_notes;

insert into public.calls (
  business_id,
  twilio_call_sid,
  from_phone,
  to_phone,
  direction,
  status,
  transcript,
  summary,
  unresolved,
  started_at,
  ended_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  'CA_demo_001',
  '+16265551234',
  '+16265550100',
  'inbound',
  'completed',
  'Customer asked about gel manicure availability for Friday afternoon.',
  'Potential gel manicure appointment request for Friday afternoon.',
  true,
  now() - interval '2 hours',
  now() - interval '1 hour 56 minutes'
)
on conflict (twilio_call_sid) do nothing;

insert into public.appointment_requests (
  business_id,
  call_id,
  customer_name,
  customer_phone,
  requested_service,
  requested_date,
  requested_time,
  notes,
  status
)
select
  '11111111-1111-1111-1111-111111111111',
  calls.id,
  'Maya L.',
  '+16265551234',
  'Gel Manicure',
  current_date + interval '3 days',
  '15:00',
  'Customer prefers Friday afternoon. This is an appointment request, not a confirmed booking.',
  'pending'
from public.calls
where calls.twilio_call_sid = 'CA_demo_001'
limit 1;
