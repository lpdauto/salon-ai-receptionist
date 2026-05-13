-- Adds menu categories for salon services.
-- Run this once in Supabase before using category tabs in the dashboard.

alter table public.services
  add column if not exists category text not null default 'manicure';

create index if not exists services_business_id_category_idx
  on public.services (business_id, category, created_at);
