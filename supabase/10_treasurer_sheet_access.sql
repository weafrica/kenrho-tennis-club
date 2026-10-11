-- Applied to the live project as migration "treasurer_sheet_access".
alter table public.treasurer_standing
  add column if not exists phone text,
  add column if not exists form_submitted boolean not null default false,
  add column if not exists date_form_received date,
  add column if not exists proof_received boolean not null default false,
  add column if not exists social_media text;

update public.treasurer_standing t set phone = p.phone
from public.pre_registered_members p
where t.phone is null and t.email is not null and lower(t.email) = lower(p.email);

create or replace function public.can_edit_member_sheet()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
      and (role = 'treasurer' or lower(email) = 'saulestoo@gmail.com')
  );
$$ language sql security definer stable set search_path = public;

drop policy if exists treasurer_standing_staff_all on public.treasurer_standing;
drop policy if exists ts_select_staff on public.treasurer_standing;
drop policy if exists ts_insert_sheet on public.treasurer_standing;
drop policy if exists ts_update_sheet on public.treasurer_standing;
drop policy if exists ts_delete_sheet on public.treasurer_standing;
create policy ts_select_staff on public.treasurer_standing for select using (public.is_staff());
create policy ts_insert_sheet on public.treasurer_standing for insert with check (public.can_edit_member_sheet());
create policy ts_update_sheet on public.treasurer_standing for update using (public.can_edit_member_sheet()) with check (public.can_edit_member_sheet());
create policy ts_delete_sheet on public.treasurer_standing for delete using (public.can_edit_member_sheet());

update public.profiles set role = 'admin', status = 'approved'
where lower(email) = 'saulestoo@gmail.com' and (role <> 'admin' or status <> 'approved');
