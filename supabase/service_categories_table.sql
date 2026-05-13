-- Adds editable main service/menu categories.
-- Run this once in Supabase.

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);

create index if not exists service_categories_business_id_sort_idx
  on public.service_categories (business_id, sort_order, created_at);

insert into public.service_categories (business_id, slug, name, sort_order)
select id, 'manicure', 'Manicure', 10 from public.businesses
on conflict (business_id, slug) do nothing;

insert into public.service_categories (business_id, slug, name, sort_order)
select id, 'pedicure', 'Pedicure', 20 from public.businesses
on conflict (business_id, slug) do nothing;

insert into public.service_categories (business_id, slug, name, sort_order)
select id, 'extensions', 'Extensions', 30 from public.businesses
on conflict (business_id, slug) do nothing;

insert into public.service_categories (business_id, slug, name, sort_order)
select id, 'eyebrows', 'Eyebrows', 40 from public.businesses
on conflict (business_id, slug) do nothing;

insert into public.service_categories (business_id, slug, name, sort_order)
select id, 'extras', 'Extras', 50 from public.businesses
on conflict (business_id, slug) do nothing;

insert into public.service_categories (business_id, slug, name, sort_order)
select id, 'lash-brows', 'Lash & Brows', 60 from public.businesses
on conflict (business_id, slug) do nothing;
