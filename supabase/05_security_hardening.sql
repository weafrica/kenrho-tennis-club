-- ============================================================================
-- KenRho Park Tennis Club — Security hardening
-- Run this AFTER 01-04. Fixes issues found by Supabase's advisor after the
-- court booking migration: a ledger view that bypassed RLS, two trigger-only
-- functions that were callable directly via the API, and a few functions
-- missing a pinned search_path.
-- ============================================================================

-- Make the ledger view respect the querying user's own RLS instead of
-- running as the (RLS-bypassing) view owner. Since journal_lines/
-- journal_entries policies already restrict SELECT to staff only, this
-- means a non-staff member now gets zero rows from this view instead of
-- the whole club's financial history.
alter view public.v_ledger_detail set (security_invoker = true);

-- These two functions only ever run as trigger bodies (on_auth_user_created,
-- trg_post_invoice_journal) — they should never be callable directly via
-- the REST API's /rpc/ endpoint by a member or anonymous visitor.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.post_invoice_journal() from public, anon, authenticated;

-- Pin search_path on the remaining plain functions so they can't be tricked
-- by a session with a manipulated search_path into resolving an object from
-- some other schema.
create or replace function public.next_invoice_number()
returns text as $$
  select 'INV-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0');
$$ language sql set search_path = public;

create or replace function public.next_receipt_number()
returns text as $$
  select 'RCT-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 4, '0');
$$ language sql set search_path = public;

create or replace function public.entry_is_balanced(p_entry_id uuid)
returns boolean as $$
  select coalesce(sum(debit),0) = coalesce(sum(credit),0)
  from public.journal_lines where entry_id = p_entry_id;
$$ language sql stable set search_path = public;

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
$$ language sql stable set search_path = public;

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
$$ language sql stable set search_path = public;

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
$$ language sql stable set search_path = public;
