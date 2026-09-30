-- ============================================================================
-- KenRho Park Tennis Club — Real membership categories + full registration
-- Sourced from the club's actual 2026 membership form.
-- Run this AFTER 01-05.
-- ============================================================================

-- ---------------------------------------------------------------- membership types
create table if not exists public.membership_types (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  fee        numeric(12,2) not null,
  note       text,
  sort_order int not null default 0,
  is_active  boolean not null default true
);

insert into public.membership_types (code, name, fee, note, sort_order) values
  ('league',    'League',    1500.00, 'Includes TSA affiliation fees', 1),
  ('social',    'Social',    1250.00, null, 2),
  ('family',    'Family',    2000.00, 'Covers one household', 3),
  ('junior',    'Junior',    500.00,  'Under 18', 4),
  ('pensioner', 'Pensioner', 600.00,  'Over 60', 5)
on conflict (code) do nothing;

alter table public.membership_types enable row level security;
drop policy if exists "membership_types_select_all" on public.membership_types;
create policy "membership_types_select_all" on public.membership_types for select using (true);
drop policy if exists "membership_types_staff_write" on public.membership_types;
create policy "membership_types_staff_write" on public.membership_types for all
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------- richer registration fields
alter table public.profiles add column if not exists membership_type_id uuid references public.membership_types(id);
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists residential_address text;
alter table public.profiles add column if not exists postal_code text;
alter table public.profiles add column if not exists previous_club text;
alter table public.profiles add column if not exists tennis_level text check (tennis_level in ('beginner','intermediate','advanced'));
alter table public.profiles add column if not exists played_league boolean;
alter table public.profiles add column if not exists photo_consent boolean;

-- ---------------------------------------------------------------- real club bank details
update public.settings set
  bank_details = 'Bank: First National Bank (FNB) | Branch: Eastgate (branch code 257705) | Account: 62920283009 | Reference must include your name, surname, and membership category (e.g. Junior, Family). You can also pay via the Yoco card machine at the clubhouse (no cash accepted) or set up a monthly stop order.'
where id = 1;
