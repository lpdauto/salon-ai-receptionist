-- Salon AI Receptionist MVP row level security policies.
-- These policies let authenticated salon owners/staff access only rows for
-- businesses they belong to through public.users.

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.business_id = target_business_id
  );
$$;

alter table public.businesses enable row level security;
alter table public.users enable row level security;
alter table public.business_hours enable row level security;
alter table public.services enable row level security;
alter table public.ai_settings enable row level security;
alter table public.calls enable row level security;
alter table public.appointment_requests enable row level security;

drop policy if exists "members can view their business" on public.businesses;
create policy "members can view their business"
on public.businesses
for select
to authenticated
using (public.is_business_member(id));

drop policy if exists "members can update their business" on public.businesses;
create policy "members can update their business"
on public.businesses
for update
to authenticated
using (public.is_business_member(id))
with check (public.is_business_member(id));

drop policy if exists "users can view members of their business" on public.users;
create policy "users can view members of their business"
on public.users
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists "users can update their own profile" on public.users;
create policy "users can update their own profile"
on public.users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and public.is_business_member(business_id));

drop policy if exists "members can manage business hours" on public.business_hours;
create policy "members can manage business hours"
on public.business_hours
for all
to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

drop policy if exists "members can manage services" on public.services;
create policy "members can manage services"
on public.services
for all
to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

drop policy if exists "members can manage ai settings" on public.ai_settings;
create policy "members can manage ai settings"
on public.ai_settings
for all
to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

drop policy if exists "members can view calls" on public.calls;
create policy "members can view calls"
on public.calls
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists "members can update calls" on public.calls;
create policy "members can update calls"
on public.calls
for update
to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

drop policy if exists "members can create calls" on public.calls;
create policy "members can create calls"
on public.calls
for insert
to authenticated
with check (public.is_business_member(business_id));

drop policy if exists "members can view appointment requests" on public.appointment_requests;
create policy "members can view appointment requests"
on public.appointment_requests
for select
to authenticated
using (public.is_business_member(business_id));

drop policy if exists "members can update appointment requests" on public.appointment_requests;
create policy "members can update appointment requests"
on public.appointment_requests
for update
to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

drop policy if exists "members can create appointment requests" on public.appointment_requests;
create policy "members can create appointment requests"
on public.appointment_requests
for insert
to authenticated
with check (public.is_business_member(business_id));
