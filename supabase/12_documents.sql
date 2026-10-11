-- Applied to the live project as migration "documents_invoices_receipts".
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('invoice','receipt')),
  doc_number text not null,
  doc_date date not null default current_date,
  member_name text, member_no text, category text,
  amount numeric not null default 0,
  standing_id uuid references public.treasurer_standing(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doc_type, doc_number)
);
alter table public.documents enable row level security;
drop policy if exists documents_sheet_editors on public.documents;
create policy documents_sheet_editors on public.documents for all
  using (public.can_edit_member_sheet()) with check (public.can_edit_member_sheet());
create index if not exists documents_created_idx on public.documents (created_at desc);
