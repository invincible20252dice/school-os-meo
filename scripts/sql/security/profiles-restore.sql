-- APPROVAL REQUIRED. Restores the recorded broad UPDATE ACL (reopens the risk).
BEGIN;
SET LOCAL lock_timeout='3s';
REVOKE UPDATE (full_name) ON public.profiles FROM authenticated;
GRANT UPDATE ON TABLE public.profiles TO anon, authenticated;
COMMIT;
