-- Replace these UUIDs with real auth.users.id values from Supabase Auth.
-- 本部 admin: all-school access.
insert into public.profiles (id, role, school_id, school_ids, full_name)
values (
  '00000000-0000-0000-0000-000000000001',
  'admin',
  null,
  '{}',
  '本部管理者'
)
on conflict (id) do update
set role = excluded.role,
    school_id = excluded.school_id,
    school_ids = excluded.school_ids,
    full_name = excluded.full_name;

-- 教室長 manager: assigned-school access only.
insert into public.profiles (id, role, school_id, school_ids, full_name)
values (
  '00000000-0000-0000-0000-000000000002',
  'manager',
  'school_demo_001',
  array['school_demo_001'],
  'デモ教室長'
)
on conflict (id) do update
set role = excluded.role,
    school_id = excluded.school_id,
    school_ids = excluded.school_ids,
    full_name = excluded.full_name;
