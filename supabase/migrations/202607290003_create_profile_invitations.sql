create table if not exists public.profile_invitations (
  email text primary key,
  role text not null default 'manager',
  school_id text,
  status text not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_invitations_email_check check (position('@' in email) > 1),
  constraint profile_invitations_role_check check (role in ('admin', 'manager')),
  constraint profile_invitations_status_check check (status in ('pending', 'accepted', 'revoked')),
  constraint profile_invitations_manager_school_check check (
    role = 'admin'
    or nullif(school_id, '') is not null
  )
);

create index if not exists profile_invitations_school_id_idx
  on public.profile_invitations(school_id);

create index if not exists profile_invitations_status_idx
  on public.profile_invitations(status);

alter table public.profile_invitations enable row level security;

drop trigger if exists profile_invitations_set_updated_at on public.profile_invitations;
create trigger profile_invitations_set_updated_at
  before update on public.profile_invitations
  for each row
  execute function public.set_updated_at();
