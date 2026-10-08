-- KenRho Park Tennis Club - 09: family links
-- Members say which family they belong to (typeahead on family NAMES only, or the
-- name + phone/email of whoever paid). The treasurer confirms in Admin; only then does
-- the member see the family's balance. Contact details are for the treasurer only and
-- are never used to sign in or to match an account.
-- Requires 08 (treasurer_standing). Safe to re-run. (Already applied to the live project.)

create table if not exists public.family_link_requests (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null unique references public.profiles(id) on delete cascade,
  standing_id   uuid references public.treasurer_standing(id) on delete set null,
  typed_family  text,
  payer_name    text,
  contact_email text,
  contact_phone text,
  status        text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  staff_note    text,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles(id) on delete set null
);
comment on column public.family_link_requests.contact_email is 'Contact detail only, for the treasurer to verify a family. NEVER used for sign-in or account matching.';
comment on column public.family_link_requests.contact_phone is 'Contact detail only (E.164, e.g. +27821234567). NEVER used for sign-in or account matching.';

create table if not exists public.family_members (
  standing_id uuid not null references public.treasurer_standing(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  added_by    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (standing_id, profile_id)
);

alter table public.family_link_requests enable row level security;
alter table public.family_members enable row level security;
drop policy if exists "flr_staff_all" on public.family_link_requests;
create policy "flr_staff_all" on public.family_link_requests for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "flr_own_select" on public.family_link_requests;
create policy "flr_own_select" on public.family_link_requests for select using (profile_id = auth.uid());
drop policy if exists "fm_staff_all" on public.family_members;
create policy "fm_staff_all" on public.family_members for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "fm_own_select" on public.family_members;
create policy "fm_own_select" on public.family_members for select using (profile_id = auth.uid());

create or replace function public.search_families(p_q text)
returns table (id uuid, label text)
language plpgsql security definer stable set search_path = public as $$
declare q text := trim(coalesce(p_q, ''));
begin
  if auth.uid() is null or length(q) < 2 or length(q) > 60 then return; end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select s.id, s.full_name from public.treasurer_standing s
     where s.membership_type_code = 'family' and s.full_name ilike '%' || q || '%'
     order by s.full_name limit 8;
end;
$$;
revoke all on function public.search_families(text) from public, anon;
grant execute on function public.search_families(text) to authenticated;

create or replace function public.submit_family_link(
  p_standing_id uuid, p_typed_family text, p_payer_name text, p_contact_email text, p_contact_phone text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_typed    text := nullif(left(trim(coalesce(p_typed_family, '')), 120), '');
  v_payer    text := nullif(left(trim(coalesce(p_payer_name, '')), 120), '');
  v_email    text := nullif(lower(left(trim(coalesce(p_contact_email, '')), 254)), '');
  v_phone    text := nullif(regexp_replace(trim(coalesce(p_contact_phone, '')), '[^0-9+]', '', 'g'), '');
  v_family   public.treasurer_standing;
  v_existing public.family_link_requests;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Please sign in first';
  end if;
  select * into v_existing from public.family_link_requests where profile_id = v_uid;
  if found and v_existing.status = 'confirmed' then return 'already confirmed'; end if;

  if p_standing_id is not null then
    select * into v_family from public.treasurer_standing where id = p_standing_id and membership_type_code = 'family';
    if not found then raise exception 'That family could not be found'; end if;
    v_typed := coalesce(v_typed, v_family.full_name);
  else
    if v_payer is null or length(v_payer) < 2 then
      raise exception 'Please type the surname or first name of the person who paid or submitted the registration form';
    end if;
    if v_email is null and v_phone is null then
      raise exception 'Please give an email address or phone number for that person';
    end if;
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email address does not look right';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'Phone numbers need a country code, for example +27 82 123 4567';
  end if;

  insert into public.family_link_requests (profile_id, standing_id, typed_family, payer_name, contact_email, contact_phone, status)
  values (v_uid, p_standing_id, v_typed, v_payer, v_email, v_phone, 'pending')
  on conflict (profile_id) do update set
    standing_id = excluded.standing_id, typed_family = excluded.typed_family, payer_name = excluded.payer_name,
    contact_email = excluded.contact_email, contact_phone = excluded.contact_phone,
    status = 'pending', staff_note = null, reviewed_at = null, reviewed_by = null, created_at = now();
  return 'submitted';
end;
$$;
revoke all on function public.submit_family_link(uuid, text, text, text, text) from public, anon;
grant execute on function public.submit_family_link(uuid, text, text, text, text) to authenticated;

create or replace function public.my_family_request()
returns table (status text, family_label text, payer_name text, staff_note text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select r.status, coalesce(s.full_name, r.typed_family), r.payer_name, r.staff_note, r.created_at
    from public.family_link_requests r
    left join public.treasurer_standing s on s.id = r.standing_id
   where r.profile_id = auth.uid();
$$;
revoke all on function public.my_family_request() from public, anon;
grant execute on function public.my_family_request() to authenticated;

-- Staff checks: anyone with a signed-in session must be staff; only direct owner access
-- (SQL Editor / service role, which carry no user id) is exempt.
create or replace function public.admin_confirm_family(p_request_id uuid, p_standing_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare r public.family_link_requests; s public.treasurer_standing; v_type uuid;
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'Staff only'; end if;
  select * into r from public.family_link_requests where id = p_request_id;
  if not found then return 'no such request'; end if;
  select * into s from public.treasurer_standing where id = p_standing_id and membership_type_code = 'family';
  if not found then return 'pick a family from the sheet'; end if;
  select id into v_type from public.membership_types where code = 'family';
  insert into public.family_members (standing_id, profile_id, added_by) values (s.id, r.profile_id, auth.uid()) on conflict do nothing;
  update public.family_link_requests set standing_id = s.id, status = 'confirmed', staff_note = null, reviewed_at = now(), reviewed_by = auth.uid() where id = r.id;
  update public.profiles set
    membership_type_id = coalesce(v_type, membership_type_id),
    status      = case when status = 'pending' then 'approved' else status end,
    approved_at = case when status = 'pending' then now() else approved_at end
  where id = r.profile_id;
  return 'confirmed';
end;
$$;
revoke all on function public.admin_confirm_family(uuid, uuid) from public, anon;
grant execute on function public.admin_confirm_family(uuid, uuid) to authenticated;

create or replace function public.admin_reject_family(p_request_id uuid, p_note text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'Staff only'; end if;
  update public.family_link_requests
     set status = 'rejected', staff_note = nullif(left(trim(coalesce(p_note, '')), 300), ''),
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_request_id;
  return 'rejected';
end;
$$;
revoke all on function public.admin_reject_family(uuid, text) from public, anon;
grant execute on function public.admin_reject_family(uuid, text) to authenticated;

-- family members now see their family's standing (own record first)
create or replace function public.my_standing()
returns table (
  member_no text, membership_type text,
  expected_amount numeric, paid_amount numeric, balance numeric,
  last_payment_date date, confirmed boolean
)
language sql security definer stable set search_path = public as $$
  select s.member_no, mt.name, s.expected_amount, s.paid_amount, s.balance, s.last_payment_date, (s.review_flag is null)
    from public.treasurer_standing s
    left join public.membership_types mt on mt.code = s.membership_type_code
   where s.applied_profile_id = auth.uid()
      or s.id in (select fm.standing_id from public.family_members fm where fm.profile_id = auth.uid())
   order by (s.applied_profile_id = auth.uid()) desc nulls last
   limit 1;
$$;
revoke all on function public.my_standing() from public, anon;
grant execute on function public.my_standing() to authenticated;
