-- ============================================================================
-- KenRho Park Tennis Club — Starter chart of accounts
-- Run this AFTER 01_schema.sql and 02_policies.sql.
-- Feel free to add more accounts later from the Admin > Accounts screen —
-- just keep codes unique and pick the right type/normal_balance.
-- ============================================================================

insert into public.accounts (code, name, type, normal_balance) values
  ('1000', 'Cash / Bank',              'asset',     'debit'),
  ('1100', 'Accounts Receivable (member fees owing)', 'asset', 'debit'),
  ('1200', 'Equipment (nets, machines, etc.)',  'asset', 'debit'),
  ('2000', 'Accounts Payable',         'liability', 'credit'),
  ('2100', 'Deferred Membership Income','liability','credit'),
  ('3000', 'Club Equity / Retained Funds', 'equity', 'credit'),
  ('3900', 'Retained Earnings (prior years)', 'equity', 'credit'),
  ('4000', 'Membership Fees Revenue',  'revenue',   'credit'),
  ('4100', 'Coaching & Clinics Revenue','revenue',  'credit'),
  ('4200', 'Court Hire Revenue',       'revenue',   'credit'),
  ('4300', 'Sponsorships & Donations', 'revenue',   'credit'),
  ('4900', 'Other Income',             'revenue',   'credit'),
  ('5000', 'Court Maintenance Expense','expense',   'debit'),
  ('5100', 'Coaching Costs',           'expense',   'debit'),
  ('5200', 'Utilities (water & electricity)','expense','debit'),
  ('5300', 'Equipment & Consumables',  'expense',   'debit'),
  ('5400', 'Affiliation & League Fees','expense',   'debit'),
  ('5500', 'Events & Social',          'expense',   'debit'),
  ('5600', 'Bank Charges',             'expense',   'debit'),
  ('5900', 'General & Admin Expense',  'expense',   'debit')
on conflict (code) do nothing;
