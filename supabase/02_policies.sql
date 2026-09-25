-- ============================================================================
-- KenRho Park Tennis Club — Row Level Security
-- Run this AFTER 01_schema.sql.
-- ============================================================================

alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.invoices enable row level security;
alter table public.receipts enable row level security;

-- Helper: is the current user an admin/treasurer?
create or replace function public.is_staff()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','treasurer')
  );
$$ language sql security definer stable set search_path = public;

-- ---------- settings: everyone signed in can read, only staff can edit ----------
drop policy if exists "settings_select" on public.settings;
create policy "settings_select" on public.settings for select
  using (auth.uid() is not null);

drop policy if exists "settings_update" on public.settings;
create policy "settings_update" on public.settings for update
  using (public.is_staff());

-- ---------- profiles ----------
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles for select
  using (auth.uid() = id or public.is_staff());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id or public.is_staff());

-- ---------- chart of accounts: staff only ----------
drop policy if exists "accounts_staff_all" on public.accounts;
create policy "accounts_staff_all" on public.accounts for all
  using (public.is_staff()) with check (public.is_staff());

-- ---------- journal: staff only (members see totals via invoices/receipts, not the raw ledger) ----------
drop policy if exists "journal_entries_staff_all" on public.journal_entries;
create policy "journal_entries_staff_all" on public.journal_entries for all
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists "journal_lines_staff_all" on public.journal_lines;
create policy "journal_lines_staff_all" on public.journal_lines for all
  using (public.is_staff()) with check (public.is_staff());

-- ---------- invoices: member sees own, staff sees & creates all ----------
drop policy if exists "invoices_select_own_or_staff" on public.invoices;
create policy "invoices_select_own_or_staff" on public.invoices for select
  using (member_id = auth.uid() or public.is_staff());

drop policy if exists "invoices_staff_write" on public.invoices;
create policy "invoices_staff_write" on public.invoices for insert
  with check (public.is_staff());

drop policy if exists "invoices_staff_update" on public.invoices;
create policy "invoices_staff_update" on public.invoices for update
  using (public.is_staff());

-- ---------- receipts: member can upload & see own, staff sees & verifies all ----------
drop policy if exists "receipts_select_own_or_staff" on public.receipts;
create policy "receipts_select_own_or_staff" on public.receipts for select
  using (member_id = auth.uid() or public.is_staff());

drop policy if exists "receipts_insert_own" on public.receipts;
create policy "receipts_insert_own" on public.receipts for insert
  with check (member_id = auth.uid() or public.is_staff());

drop policy if exists "receipts_staff_update" on public.receipts;
create policy "receipts_staff_update" on public.receipts for update
  using (public.is_staff());

-- ============================================================================
-- STORAGE: bucket + policies for uploaded payment proofs
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts_bucket_insert_own" on storage.objects;
create policy "receipts_bucket_insert_own" on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipts_bucket_select_own_or_staff" on storage.objects;
create policy "receipts_bucket_select_own_or_staff" on storage.objects for select
  using (
    bucket_id = 'receipts'
    and ((auth.uid())::text = (storage.foldername(name))[1] or public.is_staff())
  );
