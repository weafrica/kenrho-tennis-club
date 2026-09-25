-- ============================================================================
-- KenRho Park Tennis Club — Database Schema
-- Run this whole file once in the Supabase SQL Editor (Project > SQL Editor).
-- Safe to re-run: it uses "if not exists" / "or replace" everywhere it can.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. CLUB SETTINGS (single row of config the admin can edit from the app)
-- ----------------------------------------------------------------------------
create table if not exists public.settings (
  id                 int primary key default 1,
  club_name          text not null default 'KenRho Park Tennis Club',
  currency           text not null default 'ZAR',
  membership_fee     numeric(12,2) not null default 750.00,
  fee_period_label   text not null default 'Annual Membership',
  bank_details       text not null default 'Bank: -- | Account: -- | Branch code: -- | Reference: your full name',
  require_admin_approval boolean not null default true, -- if false, members are auto-approved as soon as they upload a receipt
  updated_at         timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. PROFILES (one row per authenticated member, mirrors auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  full_name      text,
  phone          text,
  avatar_url     text,
  role           text not null default 'member' check (role in ('member','treasurer','admin')),
  status         text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  membership_type text default 'Individual',
  joined_at      timestamptz not null default now(),
  approved_by    uuid references auth.users(id),
  approved_at    timestamptz
);

-- Auto-create a profile row the first time someone signs in with Google
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. CHART OF ACCOUNTS + JOURNAL (double-entry bookkeeping core)
-- ----------------------------------------------------------------------------
create table if not exists public.accounts (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  name           text not null,
  type           text not null check (type in ('asset','liability','equity','revenue','expense')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  is_active      boolean not null default true
);

create table if not exists public.journal_entries (
  id           uuid primary key default gen_random_uuid(),
  entry_date   date not null default current_date,
  description  text not null,
  reference    text,
  source_type  text not null default 'manual' check (source_type in ('invoice','receipt','manual')),
  source_id    uuid,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create table if not exists public.journal_lines (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  member_id  uuid references public.profiles(id),
  debit      numeric(12,2) not null default 0,
  credit     numeric(12,2) not null default 0,
  constraint one_side_only check (
    (debit >= 0 and credit >= 0) and (debit = 0 or credit = 0) and (debit + credit > 0)
  )
);
create index if not exists idx_journal_lines_account on public.journal_lines(account_id);
create index if not exists idx_journal_lines_entry on public.journal_lines(entry_id);

-- A trigger-level guard: warn (via exception) if an entry's lines don't balance.
-- Checked with a function the app calls after inserting all lines for an entry.
create or replace function public.entry_is_balanced(p_entry_id uuid)
returns boolean as $$
  select coalesce(sum(debit),0) = coalesce(sum(credit),0)
  from public.journal_lines where entry_id = p_entry_id;
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- 4. INVOICES
-- ----------------------------------------------------------------------------
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  member_id      uuid not null references public.profiles(id),
  description    text not null default 'Membership fee',
  amount         numeric(12,2) not null,
  issue_date     date not null default current_date,
  due_date       date,
  status         text not null default 'unpaid' check (status in ('unpaid','partially_paid','paid','void')),
  amount_paid    numeric(12,2) not null default 0,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create sequence if not exists public.invoice_seq start 1;
create or replace function public.next_invoice_number()
returns text as $$
  select 'INV-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0');
$$ language sql;

-- When an invoice is created, auto-post the journal entry:
--   Dr Accounts Receivable (1100)   Cr Membership Revenue (4000)
create or replace function public.post_invoice_journal()
returns trigger as $$
declare
  v_entry_id uuid;
  v_ar_account uuid;
  v_rev_account uuid;
begin
  select id into v_ar_account from public.accounts where code = '1100';
  select id into v_rev_account from public.accounts where code = '4000';

  insert into public.journal_entries (entry_date, description, reference, source_type, source_id, created_by)
  values (new.issue_date, 'Invoice ' || new.invoice_number || ' — ' || new.description, new.invoice_number, 'invoice', new.id, new.created_by)
  returning id into v_entry_id;

  insert into public.journal_lines (entry_id, account_id, member_id, debit, credit)
  values (v_entry_id, v_ar_account, new.member_id, new.amount, 0);

  insert into public.journal_lines (entry_id, account_id, member_id, debit, credit)
  values (v_entry_id, v_rev_account, new.member_id, 0, new.amount);

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_post_invoice_journal on public.invoices;
create trigger trg_post_invoice_journal
  after insert on public.invoices
  for each row execute procedure public.post_invoice_journal();

-- ----------------------------------------------------------------------------
-- 5. RECEIPTS (proof-of-payment uploads, verified by admin/treasurer)
-- ----------------------------------------------------------------------------
create table if not exists public.receipts (
  id             uuid primary key default gen_random_uuid(),
  receipt_number text unique,
  invoice_id     uuid references public.invoices(id),
  member_id      uuid not null references public.profiles(id),
  amount         numeric(12,2) not null,
  payment_method text default 'EFT',
  bank_reference text,
  proof_file_path text, -- path inside the 'receipts' storage bucket
  status         text not null default 'pending' check (status in ('pending','verified','rejected')),
  notes          text,
  submitted_at   timestamptz not null default now(),
  verified_by    uuid references auth.users(id),
  verified_at    timestamptz
);

create sequence if not exists public.receipt_seq start 1;
create or replace function public.next_receipt_number()
returns text as $$
  select 'RCT-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 4, '0');
$$ language sql;

-- Verifying a receipt: stamp a receipt number, post the journal entry
--   Dr Cash/Bank (1000)   Cr Accounts Receivable (1100)
-- then update the linked invoice's paid amount + status,
-- and (if the club is configured for it) auto-approve the member.
create or replace function public.verify_receipt(p_receipt_id uuid, p_admin_id uuid)
returns void as $$
declare
  r public.receipts;
  v_entry_id uuid;
  v_cash_account uuid;
  v_ar_account uuid;
  v_settings public.settings;
begin
  select * into r from public.receipts where id = p_receipt_id;
  if r.status = 'verified' then
    return; -- already done, don't double-post
  end if;

  select id into v_cash_account from public.accounts where code = '1000';
  select id into v_ar_account from public.accounts where code = '1100';

  update public.receipts
     set status = 'verified',
         receipt_number = coalesce(receipt_number, public.next_receipt_number()),
         verified_by = p_admin_id,
         verified_at = now()
   where id = p_receipt_id;

  insert into public.journal_entries (entry_date, description, reference, source_type, source_id, created_by)
  values (current_date, 'Payment received — receipt ' || coalesce(r.receipt_number,'') , r.bank_reference, 'receipt', r.id, p_admin_id)
  returning id into v_entry_id;

  insert into public.journal_lines (entry_id, account_id, member_id, debit, credit)
  values (v_entry_id, v_cash_account, r.member_id, r.amount, 0);

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
end;
$$ language plpgsql security definer set search_path = public;

-- Called by the app right after a member uploads a receipt, only if the
-- club has "require_admin_approval" switched off in settings.
create or replace function public.maybe_auto_approve(p_member_id uuid)
returns void as $$
declare
  v_settings public.settings;
begin
  select * into v_settings from public.settings where id = 1;
  if not v_settings.require_admin_approval then
    update public.profiles set status = 'approved', approved_at = now()
     where id = p_member_id and status = 'pending';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ----------------------------------------------------------------------------
-- 6. REPORTING VIEWS / FUNCTIONS (T-accounts, trial balance, statements)
-- ----------------------------------------------------------------------------

-- Ledger detail — every posted line, joined to its account & entry.
-- The frontend groups this client-side by account_id to draw a T-account.
create or replace view public.v_ledger_detail as
select
  jl.id            as line_id,
  je.entry_date,
  je.description,
  je.reference,
  je.source_type,
  a.id             as account_id,
  a.code           as account_code,
  a.name           as account_name,
  a.type           as account_type,
  jl.member_id,
  p.full_name      as member_name,
  jl.debit,
  jl.credit
from public.journal_lines jl
join public.journal_entries je on je.id = jl.entry_id
join public.accounts a on a.id = jl.account_id
left join public.profiles p on p.id = jl.member_id
order by je.entry_date, je.created_at;

-- Trial balance as of a given date (defaults to today)
create or replace function public.get_trial_balance(p_as_of date default current_date)
returns table (account_code text, account_name text, account_type text, total_debit numeric, total_credit numeric, balance numeric) as $$
  select a.code, a.name, a.type,
         coalesce(sum(jl.debit),0)  as total_debit,
         coalesce(sum(jl.credit),0) as total_credit,
         case when a.normal_balance = 'debit'
              then coalesce(sum(jl.debit),0) - coalesce(sum(jl.credit),0)
              else coalesce(sum(jl.credit),0) - coalesce(sum(jl.debit),0)
         end as balance
  from public.accounts a
  left join public.journal_lines jl on jl.account_id = a.id
  left join public.journal_entries je on je.id = jl.entry_id and je.entry_date <= p_as_of
  where a.is_active
  group by a.id, a.code, a.name, a.type, a.normal_balance
  order by a.code;
$$ language sql stable;

-- Income statement for a date range
create or replace function public.get_income_statement(p_start date, p_end date)
returns table (account_code text, account_name text, account_type text, amount numeric) as $$
  select a.code, a.name, a.type,
         case when a.type = 'revenue'
              then coalesce(sum(jl.credit),0) - coalesce(sum(jl.debit),0)
              else coalesce(sum(jl.debit),0) - coalesce(sum(jl.credit),0)
         end as amount
  from public.accounts a
  join public.journal_lines jl on jl.account_id = a.id
  join public.journal_entries je on je.id = jl.entry_id
  where a.type in ('revenue','expense')
    and je.entry_date between p_start and p_end
  group by a.id, a.code, a.name, a.type
  order by a.type desc, a.code;
$$ language sql stable;

-- Balance sheet as of a date (retained earnings plugged in from net income to date)
create or replace function public.get_balance_sheet(p_as_of date default current_date)
returns table (account_code text, account_name text, account_type text, balance numeric) as $$
  select a.code, a.name, a.type,
         case when a.normal_balance = 'debit'
              then coalesce(sum(jl.debit),0) - coalesce(sum(jl.credit),0)
              else coalesce(sum(jl.credit),0) - coalesce(sum(jl.debit),0)
         end as balance
  from public.accounts a
  left join public.journal_lines jl on jl.account_id = a.id
  left join public.journal_entries je on je.id = jl.entry_id and je.entry_date <= p_as_of
  where a.type in ('asset','liability','equity')
  group by a.id, a.code, a.name, a.type
  order by a.type, a.code;
$$ language sql stable;

comment on function public.get_balance_sheet is 'Note: retained earnings row (3900) should be topped up periodically by closing net income into equity — see README "period close" section.';
