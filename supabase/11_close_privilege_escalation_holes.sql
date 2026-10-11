-- NOT YET APPLIED — needs your OK. Closes two holes that let anyone become admin.

-- 1) staff_roles / pre_registered_members have RLS off: anyone holding the public anon key
--    can insert their own email as 'admin' and then sign up. handle_new_user() is
--    SECURITY DEFINER so it keeps working after this.
alter table public.staff_roles enable row level security;
alter table public.pre_registered_members enable row level security;

-- 2) profiles_update_own lets a member UPDATE their own row with no column limits,
--    including role and status. Only staff may change those.
create or replace function public.guard_profile_privileges()
returns trigger as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status
      or new.approved_by is distinct from old.approved_by)
     and not public.is_staff()
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres','supabase_admin') then
    raise exception 'Only staff can change role or status';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges before update on public.profiles
  for each row execute function public.guard_profile_privileges();
-- Note: only treasurer-or-admin should be able to make someone a treasurer/admin; the
-- trigger above stops members, but any staff role (secretary, chairman) can still do it.
