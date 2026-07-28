alter table public.profiles
  add column if not exists status text not null default 'pending';

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending', 'active'));

create index if not exists profiles_status_idx on public.profiles(status);

update public.profiles
set status = 'active'
where status = 'pending'
  and (
    role = 'admin'
    or nullif(school_id, '') is not null
  );
