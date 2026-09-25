-- ============================================================================
-- KenRho Park Tennis Club — Court booking feature
-- Run this AFTER 01_schema.sql, 02_policies.sql and 03_seed_accounts.sql.
-- Adds: courts, bookings, a safe booking RPC (paid bookings can bump a free
-- booking off a slot; nothing can bump a paid booking), public availability
-- for the homepage, and wires paid bookings into the same accounting flow
-- as membership fees (upload proof → admin verifies → journal entry posted).
-- ============================================================================

-- ---------------------------------------------------------------- settings
alter table public.settings add column if not exists court_fee_per_hour numeric(12,2) not null default 100.00;
alter table public.settings add column if not exists booking_open_time time not null default '06:00';
alter table public.settings add column if not exists booking_close_time time not null default '18:00';
alter table public.settings add column if not exists booking_days_ahead int not null default 14;

-- ---------------------------------------------------------------- courts
create table if not exists public.courts (
  id        uuid primary key default gen_random_uuid(),
  code      text unique not null,
  name      text not null,
  is_active boolean not null default true,
  sort_order int not null default 0
);
insert into public.courts (code, name, sort_order)
select c, 'Court ' || c, c::int from generate_series(1,6) as c
where not exists (select 1 from public.courts);

-- ---------------------------------------------------------------- bookings
create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  court_id       uuid not null references public.courts(id),
  member_id      uuid references public.profiles(id),
  guest_name     text, -- used for admin-entered walk-in / day-visitor bookings with no account
  booking_date   date not null,
  start_time     time not null,
  end_time       time not null,
  type           text not null check (type in ('free','paid')),
  amount         numeric(12,2) not null default 0,
  payment_status text not null default 'not_required' check (payment_status in ('not_required','pending','verified')),
  status         text not null default 'confirmed' check (status in ('confirmed','cancelled','overridden')),
  receipt_id     uuid references public.receipts(id),
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  constraint chk_time_order check (end_time > start_time)
);
create index if not exists idx_bookings_slot on public.bookings(court_id, booking_date, start_time) where status = 'confirmed';
create index if not exists idx_bookings_member on public.bookings(member_id);

-- Link receipts to a booking (in addition to the existing invoice_id link for membership fees)
alter table public.receipts add column if not exists booking_id uuid references public.bookings(id);

-- ---------------------------------------------------------------- booking RPC
-- The only supported way to create a booking. Runs as the function owner so
-- it can safely read/override conflicting rows regardless of the caller's
-- own row-level permissions; the logic itself is what keeps things safe:
--   * an empty slot            -> booked
--   * a slot held by a FREE booking + this request is PAID  -> the free
--     booking is bumped to 'overridden', the paid one takes the slot
--   * a slot held by a FREE booking + this request is FREE   -> rejected
--   * a slot held by a PAID booking (any new request)        -> rejected
create or replace function public.create_booking(
  p_court_id uuid,
  p_date date,
  p_start time,
  p_end time,
  p_type text,
  p_member_id uuid,
  p_guest_name text default null,
  p_amount numeric default 0
) returns public.bookings as $$
declare
  v_existing public.bookings;
  v_new public.bookings;
  v_settings public.settings;
begin
  select * into v_settings from public.settings where id = 1;
  if p_date < current_date then
    raise exception 'Cannot book a date in the past.';
  end if;
  if p_date > current_date + v_settings.booking_days_ahead then
    raise exception 'Bookings can only be made up to % days in advance.', v_settings.booking_days_ahead;
  end if;

  select * into v_existing
  from public.bookings
  where court_id = p_court_id
    and booking_date = p_date
    and start_time = p_start
    and status = 'confirmed'
  limit 1;

  if found then
    if v_existing.type = 'paid' then
      raise exception 'This slot is already booked and paid for — it cannot be changed.';
    elsif p_type = 'free' then
      raise exception 'This slot is already booked. Choose a paid booking if you need to secure it anyway.';
    else
      -- paid request bumping a free booking
      update public.bookings set status = 'overridden' where id = v_existing.id;
    end if;
  end if;

  insert into public.bookings (court_id, member_id, guest_name, booking_date, start_time, end_time, type, amount, payment_status, created_by)
  values (
    p_court_id, p_member_id, p_guest_name, p_date, p_start, p_end, p_type,
    case when p_type = 'paid' then coalesce(p_amount, v_settings.court_fee_per_hour) else 0 end,
    case when p_type = 'paid' then 'pending' else 'not_required' end,
    coalesce(p_member_id, auth.uid())
  )
  returning * into v_new;

  return v_new;
end;
$$ language plpgsql security definer set search_path = public;

-- Cancelling: the member who made the booking, or staff, can cancel it.
create or replace function public.cancel_booking(p_booking_id uuid)
returns void as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found.';
  end if;
  if v_booking.member_id is distinct from auth.uid() and not public.is_staff() then
    raise exception 'You can only cancel your own bookings.';
  end if;
  update public.bookings set status = 'cancelled' where id = p_booking_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Public, identity-free availability grid for the homepage & booking page.
-- Exposes only which slots are taken and whether they're free/paid — never
-- who booked them.
create or replace function public.get_availability(p_date date)
returns table (
  court_id uuid, court_code text, court_name text,
  start_time time, end_time time, type text, is_mine boolean
) as $$
  select b.court_id, c.code, c.name, b.start_time, b.end_time, b.type,
         (b.member_id = auth.uid()) as is_mine
  from public.bookings b
  join public.courts c on c.id = b.court_id
  where b.booking_date = p_date and b.status = 'confirmed';
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------- verify_receipt: also handle bookings
create or replace function public.verify_receipt(p_receipt_id uuid, p_admin_id uuid)
returns void as $$
declare
  r public.receipts;
  v_entry_id uuid;
  v_cash_account uuid;
  v_ar_account uuid;
  v_court_rev_account uuid;
  v_settings public.settings;
begin
  select * into r from public.receipts where id = p_receipt_id;
  if r.status = 'verified' then
    return;
  end if;

  select id into v_cash_account from public.accounts where code = '1000';
  select id into v_ar_account from public.accounts where code = '1100';
  select id into v_court_rev_account from public.accounts where code = '4200';

  update public.receipts
     set status = 'verified',
         receipt_number = coalesce(receipt_number, public.next_receipt_number()),
         verified_by = p_admin_id,
         verified_at = now()
   where id = p_receipt_id;

  insert into public.journal_entries (entry_date, description, reference, source_type, source_id, created_by)
  values (current_date, 'Payment received — receipt ' || coalesce(r.receipt_number,''), r.bank_reference, 'receipt', r.id, p_admin_id)
  returning id into v_entry_id;

  insert into public.journal_lines (entry_id, account_id, member_id, debit, credit)
  values (v_entry_id, v_cash_account, r.member_id, r.amount, 0);

  if r.booking_id is not null then
    -- court hire payment: Dr Cash / Cr Court Hire Revenue
    insert into public.journal_lines (entry_id, account_id, member_id, debit, credit)
    values (v_entry_id, v_court_rev_account, r.member_id, 0, r.amount);

    update public.bookings set payment_status = 'verified', receipt_id = r.id where id = r.booking_id;
  else
    -- membership payment: Dr Cash / Cr Accounts Receivable
    insert into public.journal_lines (entry_id, account_id, member_id, debit, credit)
    values (v_entry_id, v_ar_account, r.member_id, 0, r.amount);

    if r.invoice_id is not null then
      update public.invoices
         set amount_paid = amount_paid + r.amount,
             status = case when amount_paid + r.amount >= amount then 'paid' else 'partially_paid' end
       where id = r.invoice_id;
    end if;

    select * into v_settings from public.settings where id = 1;
    update public.profiles set status = 'approved', approved_by = p_admin_id, approved_at = now()
     where id = r.member_id and status = 'pending';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------- RLS
alter table public.courts enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "courts_select_all" on public.courts;
create policy "courts_select_all" on public.courts for select using (true);
drop policy if exists "courts_staff_write" on public.courts;
create policy "courts_staff_write" on public.courts for all using (public.is_staff()) with check (public.is_staff());

-- Direct table access stays tight (own bookings, or staff) — everyone else
-- reads availability through get_availability() above, which never reveals
-- who a booking belongs to.
drop policy if exists "bookings_select_own_or_staff" on public.bookings;
create policy "bookings_select_own_or_staff" on public.bookings for select
  using (member_id = auth.uid() or public.is_staff());
drop policy if exists "bookings_staff_write" on public.bookings;
create policy "bookings_staff_write" on public.bookings for all
  using (public.is_staff()) with check (public.is_staff());
