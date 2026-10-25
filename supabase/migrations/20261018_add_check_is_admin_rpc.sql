-- ============================================================================
-- Migration: Add read-only public.check_is_admin() RPC wrapper
-- Purpose: Allows authenticated sessions to check their own admin status
--          via private.is_admin() without exposing private.admin_users.
-- Safe & Repeatable (Idempotent)
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(private.is_admin(), false);
$$;

ALTER FUNCTION public.check_is_admin() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.check_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_is_admin() FROM anon;
REVOKE ALL ON FUNCTION public.check_is_admin() FROM service_role;
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO authenticated;

COMMIT;
