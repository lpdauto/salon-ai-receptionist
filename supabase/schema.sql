-- Salon AI Receptionist MVP schema.
-- Run this before policies.sql and seed.sql.

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, day_of_week)
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category text not null default 'manicure',
  name text not null,
  description text,
  price_cents integer check (price_cents is null or price_cents >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);

create table if not exists public.ai_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  greeting text not null default 'Thank you for calling. How can I help you today?',
  personality text not null default 'Warm, concise, and professional.',
  primary_language text not null default 'English',
  supported_languages text[] not null default array['English'],
  language_detection_enabled boolean not null default true,
  voice_name text not null default 'alloy',
  escalation_phone text,
  booking_policy text,
  faq_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  twilio_call_sid text unique,
  from_phone text,
  to_phone text,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  status text not null default 'new' check (status in ('new', 'answered', 'missed', 'completed', 'failed')),
  transcript text,
  summary text,
  unresolved boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  customer_name text,
  customer_phone text,
  requested_service text,
  requested_date date,
  requested_day text,
  requested_time time,
  requested_datetime_text text,
  appointment_intent_detected boolean not null default true,
  missing_fields text[] not null default array[]::text[],
  needs_review boolean not null default false,
  approved_at timestamptz,
  suggested_datetime_text text,
  contacted_at timestamptz,
  archived_at timestamptz,
  notes text,
  status text not null default 'new' check (status in ('new', 'needs_review', 'confirmed', 'suggested_time', 'contacted', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists users_business_id_idx on public.users (business_id);
create index if not exists business_hours_business_id_idx on public.business_hours (business_id);
create index if not exists services_business_id_active_idx on public.services (business_id, is_active);
create index if not exists services_business_id_category_idx on public.services (business_id, category, created_at);
create index if not exists service_categories_business_id_sort_idx on public.service_categories (business_id, sort_order, created_at);
create index if not exists ai_settings_business_id_idx on public.ai_settings (business_id);
create index if not exists calls_business_id_created_at_idx on public.calls (business_id, created_at desc);
create index if not exists calls_twilio_call_sid_idx on public.calls (twilio_call_sid);
create index if not exists appointment_requests_business_id_created_at_idx on public.appointment_requests (business_id, created_at desc);
create index if not exists appointment_requests_business_id_status_idx on public.appointment_requests (business_id, status);
create index if not exists appointment_requests_business_id_needs_review_idx on public.appointment_requests (business_id, needs_review, created_at desc);
