-- ============================================================================
-- KenRho Park Tennis Club — Roles, committee content access, pre-registration,
-- help messages, and a real gallery/announcements system.
-- Run this AFTER 01-06.
-- ============================================================================

-- ---------------------------------------------------------------- expand roles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('member','committee','treasurer','secretary','chairman','admin'));

create or replace function public.is_staff()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','treasurer','secretary','chairman')
  );
$$ language sql security definer stable set search_path = public;

create or replace function public.can_edit_content()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','treasurer','secretary','chairman','committee')
  );
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------------- staff email allowlist
-- Anyone signing up with one of these emails is auto-approved with the
-- matching role — no admin click needed, since they ARE the admin/committee.
create table if not exists public.staff_roles (
  email        text primary key,
  role         text not null check (role in ('committee','treasurer','secretary','chairman','admin')),
  display_name text
);

insert into public.staff_roles (email, role, display_name) values
  ('saulestoo@gmail.com', 'admin', 'Saul Moyo'),
  ('deongrey@gmail.com', 'treasurer', 'Deon Greyling'),
  ('ngcobor@gmail.com', 'secretary', 'Rob Ngcobo'),
  ('modise.gb@gmail.com', 'chairman', 'Gops Modise'),
  ('christiaanscholtz@protonmail.com', 'committee', 'Christiaan Scholtz'),
  ('dkrige@tuta.io', 'committee', 'Detlev Krige'),
  ('karenh@global.co.za', 'committee', 'Karen Hurt'),
  ('rowenarmstrong2@gmail.com', 'committee', 'Rowen Armstrong'),
  ('ruan@sapreciousmetals.com', 'committee', 'Ruan Manickum'),
  ('sweatennisacademy@gmail.com', 'committee', 'Pilate Ngwenya')
on conflict (email) do update set role = excluded.role, display_name = excluded.display_name;

-- ---------------------------------------------------------------- pre-registration from paper forms
create table if not exists public.pre_registered_members (
  email                 text primary key,
  full_name             text,
  phone                 text,
  membership_type_code  text references public.membership_types(code),
  date_of_birth         date,
  residential_address   text,
  postal_code           text,
  previous_club         text,
  tennis_level          text check (tennis_level in ('beginner','intermediate','advanced')),
  played_league         boolean,
  photo_consent         boolean,
  note                  text
);

insert into public.pre_registered_members (email, full_name, phone, membership_type_code, tennis_level, note) values
  ('dkrige@tuta.io', 'Detlev Krige', '+27823507949', 'league', null, 'From 2026 membership tracking sheet'),
  ('christiaanscholtz@protonmail.com', 'Christiaan Scholtz', '+27735709181', 'league', null, 'From 2026 membership tracking sheet'),
  ('karenh@global.co.za', 'Karen Hurt', '+27839911443', 'pensioner', null, 'From 2026 membership tracking sheet'),
  ('ngcobor@gmail.com', 'Rob Ngcobo', '+27725196875', 'league', null, 'From 2026 membership tracking sheet'),
  ('deongrey@gmail.com', 'Deon Greyling', '+27670255646', 'league', null, 'From 2026 membership tracking sheet'),
  ('anopasinanda10@gmail.com', 'Anopa Sibanda', '+27611794174', 'junior', null, 'From 2026 membership tracking sheet'),
  ('ruan@sapreciousmetals.com', 'Ruan Manickum', '+27822591882', 'league', null, 'From 2026 membership tracking sheet'),
  ('molemo.gapare@gmail.com', 'Molemo Gapare (Goloa & Pelonomi Moiloa family)', '+27723554965', 'family', null, 'From 2026 membership tracking sheet'),
  ('sparklinglebogang@gmail.com', 'Sparkling Lebogang Matana', '+27837551713', 'social', null, 'From 2026 membership tracking sheet — balance owing at time of import'),
  ('nestaamani2010@gmail.com', 'Nesta Khukuse-Krige', '+27823507949', 'junior', null, 'From 2026 membership tracking sheet'),
  ('hellyardm@gmail.com', 'Deirdre Hellyar', '+27729696172', 'family', null, 'From 2026 membership tracking sheet'),
  ('tasneem.essop0@gmail.com', 'Tasneem Essop', '+27715028674', 'league', null, 'From 2026 membership tracking sheet'),
  ('rowenarmstrong2@gmail.com', 'Rowen Armstrong', '+27825794356', 'league', null, 'From 2026 membership tracking sheet — balance owing at time of import'),
  ('saulestoo@gmail.com', 'Saul Moyo', '+27694362789', 'league', null, 'From 2026 membership tracking sheet'),
  ('modise.gb@gmail.com', 'Gops Modise', '+27824111683', 'league', null, 'From 2026 membership tracking sheet — balance owing at time of import'),
  ('samuel@valvespec.co.za', 'Samuel Thenadu', '+27725964939', 'league', null, 'From 2026 membership tracking sheet — balance owing at time of import'),
  ('uyanda.mabece@ymail.com', 'Uyanda Mabece', '+27832048739', 'social', null, 'From 2026 membership tracking sheet'),
  ('tony.oseitutu@gmail.com', 'Anthony (Tony) Osei-Tutu', '+27834438218', 'pensioner', 'beginner', 'From 2026 membership tracking sheet and paper form'),
  ('uhland@ltgfreight.co.za', 'Uhland Muller', '+27832528607', 'social', null, 'From 2026 membership tracking sheet'),
  ('jenniferkeey60@gmail.com', 'Jennifer Bipendu', '+27697743602', 'social', 'beginner', 'From 2026 membership tracking sheet and paper form'),
  ('candicempoyi@gmail.com', 'Candice Mphoyi', '+27817572029', 'social', null, 'From 2026 membership tracking sheet'),
  ('denise@scrappersvillage.co.za', 'Denise Van Deventer', '+27832801271', 'social', null, 'From 2026 membership tracking sheet'),
  ('leratodikooe1@gmail.com', 'Lerato Mhlango', '+27722882007', 'family', null, 'From 2026 membership tracking sheet'),
  ('lynette.motso@gmail.com', 'Lynette Moleleki', '+27617356062', 'social', null, 'Former club secretary — from 2026 membership tracking sheet'),
  ('naziemah.cooper@gmail.com', 'Rabia Cooper', '+27645248405', 'junior', 'intermediate', 'From paper form — email may belong to a parent/guardian, DOB illegible on scan'),
  ('loupe.shekinan@gmail.com', 'Shekinah Kikonde', '+27713900442', null, 'intermediate', 'From paper form — membership category not indicated on form')
on conflict (email) do update set
  full_name = excluded.full_name, phone = excluded.phone, membership_type_code = excluded.membership_type_code,
  tennis_level = excluded.tennis_level, note = excluded.note;

-- Auto-approve staff + prefill known applicants, on top of the existing
-- "create a blank profile row" behaviour.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_staff public.staff_roles;
  v_pre public.pre_registered_members;
  v_type_id uuid;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;

  select * into v_pre from public.pre_registered_members where lower(email) = lower(new.email);
  if found then
    select id into v_type_id from public.membership_types where code = v_pre.membership_type_code;
    update public.profiles set
      full_name = coalesce(full_name, v_pre.full_name),
      phone = coalesce(phone, v_pre.phone),
      membership_type_id = coalesce(membership_type_id, v_type_id),
      date_of_birth = coalesce(date_of_birth, v_pre.date_of_birth),
      residential_address = coalesce(residential_address, v_pre.residential_address),
      postal_code = coalesce(postal_code, v_pre.postal_code),
      previous_club = coalesce(previous_club, v_pre.previous_club),
      tennis_level = coalesce(tennis_level, v_pre.tennis_level),
      played_league = coalesce(played_league, v_pre.played_league),
      photo_consent = coalesce(photo_consent, v_pre.photo_consent)
    where id = new.id;
  end if;

  select * into v_staff from public.staff_roles where lower(email) = lower(new.email);
  if found then
    update public.profiles set role = v_staff.role, status = 'approved', approved_at = now()
    where id = new.id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------- announcements (committee-editable)
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  is_active  boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists "announcements_select_all" on public.announcements;
create policy "announcements_select_all" on public.announcements for select using (is_active or public.can_edit_content());
drop policy if exists "announcements_content_write" on public.announcements;
create policy "announcements_content_write" on public.announcements for all
  using (public.can_edit_content()) with check (public.can_edit_content());

insert into public.announcements (title, body, sort_order) values
  ('Court booking is here', 'You can now book a court online — for free casual play, or with a paid booking that guarantees your slot. Sign in and head to "Book a court" to reserve up to two weeks ahead.', 1),
  ('Social tennis this weekend', 'Social tennis runs every Saturday and Sunday from 7:30am — open to all members, any standard of play welcome. Just arrive and join in.', 2),
  ('Coaching bookings open', 'Coach Pilate is taking bookings for private and group lessons, and for the junior development squad. WhatsApp 076 433 0722 to book your slot.', 3)
on conflict do nothing;

-- ---------------------------------------------------------------- gallery photos (committee-editable)
create table if not exists public.gallery_photos (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  caption    text,
  sort_order int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.gallery_photos enable row level security;
drop policy if exists "gallery_select_all" on public.gallery_photos;
create policy "gallery_select_all" on public.gallery_photos for select using (true);
drop policy if exists "gallery_content_write" on public.gallery_photos;
create policy "gallery_content_write" on public.gallery_photos for all
  using (public.can_edit_content()) with check (public.can_edit_content());

insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

drop policy if exists "gallery_bucket_select_all" on storage.objects;
create policy "gallery_bucket_select_all" on storage.objects for select
  using (bucket_id = 'gallery');
drop policy if exists "gallery_bucket_write" on storage.objects;
create policy "gallery_bucket_write" on storage.objects for insert
  with check (bucket_id = 'gallery' and public.can_edit_content());
drop policy if exists "gallery_bucket_delete" on storage.objects;
create policy "gallery_bucket_delete" on storage.objects for delete
  using (bucket_id = 'gallery' and public.can_edit_content());

-- ---------------------------------------------------------------- help / contact messages
create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  message     text not null,
  status      text not null default 'open' check (status in ('open','resolved')),
  member_id   uuid references public.profiles(id),
  reply       text,
  replied_by  uuid references auth.users(id),
  replied_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.support_messages enable row level security;
drop policy if exists "support_messages_insert_anyone" on public.support_messages;
create policy "support_messages_insert_anyone" on public.support_messages for insert with check (true);
drop policy if exists "support_messages_select_own_or_staff" on public.support_messages;
create policy "support_messages_select_own_or_staff" on public.support_messages for select
  using (public.is_staff() or (member_id is not null and member_id = auth.uid()));
drop policy if exists "support_messages_staff_update" on public.support_messages;
create policy "support_messages_staff_update" on public.support_messages for update
  using (public.is_staff());
