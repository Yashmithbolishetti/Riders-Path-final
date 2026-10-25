-- ============================================================================
-- Migration: Secure Admin Authentication, Initial Super-Admin Bootstrap & Admin Management
-- Purpose:
--   1. Creates/upgrades `private.admin_users` with strict role separation
--      ('super_admin' vs 'admin') and status tracking ('active', 'invited', 'revoked').
--   2. Enforces at the database constraint level that ONLY
--      `yashmithbolishetti01@gmail.com` can ever hold the `super_admin` role.
--   3. Automatically links `auth.users(id)` to pre-authorized/invited `private.admin_users`
--      rows when an administrator completes Supabase Auth signup or password setup.
--   4. Exposes hardened `SECURITY DEFINER` RPCs in `public` with `SET search_path = pg_catalog`:
--        - `public.check_is_admin()`
--        - `public.get_admin_role()`
--        - `public.bootstrap_initial_super_admin()`
--        - `public.list_admin_users()`
--        - `public.admin_add_administrator(p_email text)`
--        - `public.admin_revoke_administrator(p_target_email text)`
-- Safe & Repeatable (Idempotent)
-- ============================================================================

BEGIN;

-- 1. Create private schema and revoke direct access from public/API roles
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

-- 2. Create or upgrade private.admin_users table
CREATE TABLE IF NOT EXISTS private.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  status text NOT NULL DEFAULT 'active',
  added_by_email text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

-- Ensure columns exist if private.admin_users was created by an earlier minimal migration
ALTER TABLE private.admin_users
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS added_by_email text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT pg_catalog.now();

-- Backfill email from auth.users for any existing user_id rows missing email
UPDATE private.admin_users a
SET email = pg_catalog.lower(pg_catalog.btrim(u.email))
FROM auth.users u
WHERE a.user_id = u.id
  AND (a.email IS NULL OR pg_catalog.btrim(a.email) = '');

-- Normalize email casing
UPDATE private.admin_users
SET email = pg_catalog.lower(pg_catalog.btrim(email))
WHERE email IS NOT NULL;

-- Enforce valid roles, statuses, and unique email
ALTER TABLE private.admin_users
  DROP CONSTRAINT IF EXISTS chk_admin_users_role_valid,
  ADD CONSTRAINT chk_admin_users_role_valid
    CHECK (role IN ('super_admin', 'admin'));

ALTER TABLE private.admin_users
  DROP CONSTRAINT IF EXISTS chk_admin_users_status_valid,
  ADD CONSTRAINT chk_admin_users_status_valid
    CHECK (status IN ('active', 'invited', 'revoked'));

-- CRITICAL SECURITY INVARIANT: Only yashmithbolishetti01@gmail.com may hold super_admin
ALTER TABLE private.admin_users
  DROP CONSTRAINT IF EXISTS chk_admin_users_super_admin_email,
  ADD CONSTRAINT chk_admin_users_super_admin_email
    CHECK (
      role <> 'super_admin'
      OR pg_catalog.lower(pg_catalog.btrim(email)) = 'yashmithbolishetti01@gmail.com'
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_private_admin_users_email_lower
  ON private.admin_users (pg_catalog.lower(pg_catalog.btrim(email)));

CREATE UNIQUE INDEX IF NOT EXISTS idx_private_admin_users_single_super_admin
  ON private.admin_users (role)
  WHERE role = 'super_admin';

REVOKE ALL ON TABLE private.admin_users FROM PUBLIC;
REVOKE ALL ON TABLE private.admin_users FROM anon;
REVOKE ALL ON TABLE private.admin_users FROM authenticated;

-- 3. Seed or link the initial super-admin record for yashmithbolishetti01@gmail.com
INSERT INTO private.admin_users (
  user_id,
  email,
  role,
  status,
  added_by_email,
  created_at,
  updated_at
)
SELECT
  u.id,
  'yashmithbolishetti01@gmail.com',
  'super_admin',
  CASE WHEN u.id IS NOT NULL THEN 'active' ELSE 'invited' END,
  'system_bootstrap',
  pg_catalog.now(),
  pg_catalog.now()
FROM (SELECT 1) AS seed
LEFT JOIN auth.users u
  ON pg_catalog.lower(pg_catalog.btrim(u.email)) = 'yashmithbolishetti01@gmail.com'
ON CONFLICT (pg_catalog.lower(pg_catalog.btrim(email))) DO UPDATE
SET
  user_id = COALESCE(private.admin_users.user_id, EXCLUDED.user_id),
  role = 'super_admin',
  status = CASE
    WHEN COALESCE(private.admin_users.user_id, EXCLUDED.user_id) IS NOT NULL THEN 'active'
    ELSE private.admin_users.status
  END,
  updated_at = pg_catalog.now();

-- 4. Trigger to automatically bind auth.users.id when an invited admin or initial super-admin signs up / confirms email
CREATE OR REPLACE FUNCTION private.sync_admin_user_on_auth_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, ''))), '');
  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE private.admin_users
  SET
    user_id = NEW.id,
    status = CASE
      WHEN status = 'invited' AND NEW.email_confirmed_at IS NOT NULL THEN 'active'
      ELSE status
    END,
    updated_at = pg_catalog.now()
  WHERE pg_catalog.lower(pg_catalog.btrim(email)) = v_email
    AND status <> 'revoked';

  RETURN NEW;
END;
$$;

ALTER FUNCTION private.sync_admin_user_on_auth_change() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.sync_admin_user_on_auth_change() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS on_auth_user_admin_sync ON auth.users;
CREATE TRIGGER on_auth_user_admin_sync
  AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_admin_user_on_auth_change();

-- 5. Internal helper functions in private schema
CREATE OR REPLACE FUNCTION private.get_current_admin_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_role text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid
    AND u.email_confirmed_at IS NOT NULL;

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  v_email := pg_catalog.lower(pg_catalog.btrim(v_email));

  -- Auto-bind user_id if the admin was invited by email and has now verified their email
  UPDATE private.admin_users
  SET
    user_id = v_uid,
    status = 'active',
    updated_at = pg_catalog.now()
  WHERE pg_catalog.lower(pg_catalog.btrim(email)) = v_email
    AND status IN ('active', 'invited')
    AND (user_id IS NULL OR user_id = v_uid);

  SELECT a.role INTO v_role
  FROM private.admin_users a
  WHERE a.user_id = v_uid
    AND pg_catalog.lower(pg_catalog.btrim(a.email)) = v_email
    AND a.status = 'active';

  -- Enforce super_admin email invariant
  IF v_role = 'super_admin' AND v_email <> 'yashmithbolishetti01@gmail.com' THEN
    RETURN NULL;
  END IF;

  RETURN v_role;
END;
$$;

ALTER FUNCTION private.get_current_admin_role() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.get_current_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_current_admin_role() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT private.get_current_admin_role() IN ('super_admin', 'admin');
$$;

ALTER FUNCTION private.is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(private.get_current_admin_role() = 'super_admin', false);
$$;

ALTER FUNCTION private.is_super_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_super_admin() TO authenticated, service_role;

-- 6. Public RPC: check_is_admin()
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(private.is_admin(), false);
$$;

ALTER FUNCTION public.check_is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_is_admin() TO authenticated, service_role;

-- 7. Public RPC: get_admin_role()
CREATE OR REPLACE FUNCTION public.get_admin_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT private.get_current_admin_role();
$$;

ALTER FUNCTION public.get_admin_role() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_role() TO authenticated, service_role;

-- 8. Public RPC: bootstrap_initial_super_admin()
-- Can ONLY be executed by an authenticated session belonging to yashmithbolishetti01@gmail.com
CREATE OR REPLACE FUNCTION public.bootstrap_initial_super_admin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_existing_uid uuid;
  v_existing_status text;
  v_record private.admin_users%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required to bootstrap initial super admin.';
  END IF;

  SELECT pg_catalog.lower(pg_catalog.btrim(u.email))
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid
    AND u.email_confirmed_at IS NOT NULL;

  IF v_email IS NULL OR v_email <> 'yashmithbolishetti01@gmail.com' THEN
    RAISE EXCEPTION 'Forbidden: Only yashmithbolishetti01@gmail.com can bootstrap the initial super-admin role.';
  END IF;

  SELECT user_id, status
  INTO v_existing_uid, v_existing_status
  FROM private.admin_users
  WHERE role = 'super_admin'
  LIMIT 1;

  IF v_existing_uid IS NOT NULL AND v_existing_uid <> v_uid AND v_existing_status = 'active' THEN
    RAISE EXCEPTION 'Forbidden: Initial super-admin has already been bootstrapped.';
  END IF;

  INSERT INTO private.admin_users (
    user_id,
    email,
    role,
    status,
    added_by_email,
    created_at,
    updated_at
  )
  VALUES (
    v_uid,
    'yashmithbolishetti01@gmail.com',
    'super_admin',
    'active',
    'system_bootstrap',
    pg_catalog.now(),
    pg_catalog.now()
  )
  ON CONFLICT (pg_catalog.lower(pg_catalog.btrim(email))) DO UPDATE
  SET
    user_id = v_uid,
    role = 'super_admin',
    status = 'active',
    updated_at = pg_catalog.now()
  RETURNING * INTO v_record;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_record.id,
    'userId', v_record.user_id,
    'email', v_record.email,
    'role', v_record.role,
    'status', v_record.status,
    'addedBy', COALESCE(v_record.added_by_email, 'system_bootstrap'),
    'createdAt', v_record.created_at,
    'updatedAt', v_record.updated_at
  );
END;
$$;

ALTER FUNCTION public.bootstrap_initial_super_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.bootstrap_initial_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_super_admin() TO authenticated, service_role;

-- 9. Public RPC: list_admin_users()
CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Administrator privileges required to list administrators.';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', a.id,
        'userId', a.user_id,
        'email', a.email,
        'role', a.role,
        'status', a.status,
        'addedBy', COALESCE(a.added_by_email, 'system_bootstrap'),
        'createdAt', a.created_at,
        'updatedAt', a.updated_at
      )
      ORDER BY
        CASE WHEN a.role = 'super_admin' THEN 0 ELSE 1 END,
        a.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM private.admin_users a
  WHERE a.status <> 'revoked';

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.list_admin_users() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_admin_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated, service_role;

-- 10. Public RPC: admin_add_administrator(p_email text)
-- Strictly restricted to super_admin (yashmithbolishetti01@gmail.com)
CREATE OR REPLACE FUNCTION public.admin_add_administrator(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_clean_email text;
  v_matched_uid uuid;
  v_matched_confirmed timestamptz;
  v_record private.admin_users%ROWTYPE;
BEGIN
  IF NOT private.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only the Super Admin can add administrators.';
  END IF;

  v_clean_email := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email, ''))), '');
  IF v_clean_email IS NULL OR v_clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid administrator email address.';
  END IF;

  IF v_clean_email = 'yashmithbolishetti01@gmail.com' THEN
    RAISE EXCEPTION 'yashmithbolishetti01@gmail.com is already designated as the Super Admin.';
  END IF;

  SELECT u.id, u.email_confirmed_at
  INTO v_matched_uid, v_matched_confirmed
  FROM auth.users u
  WHERE pg_catalog.lower(pg_catalog.btrim(u.email)) = v_clean_email
  LIMIT 1;

  INSERT INTO private.admin_users (
    user_id,
    email,
    role,
    status,
    added_by_email,
    created_at,
    updated_at
  )
  VALUES (
    v_matched_uid,
    v_clean_email,
    'admin',
    CASE WHEN v_matched_uid IS NOT NULL AND v_matched_confirmed IS NOT NULL THEN 'active' ELSE 'invited' END,
    'yashmithbolishetti01@gmail.com',
    pg_catalog.now(),
    pg_catalog.now()
  )
  ON CONFLICT (pg_catalog.lower(pg_catalog.btrim(email))) DO UPDATE
  SET
    user_id = COALESCE(EXCLUDED.user_id, private.admin_users.user_id),
    role = 'admin',
    status = CASE
      WHEN COALESCE(EXCLUDED.user_id, private.admin_users.user_id) IS NOT NULL AND v_matched_confirmed IS NOT NULL THEN 'active'
      ELSE 'invited'
    END,
    added_by_email = 'yashmithbolishetti01@gmail.com',
    updated_at = pg_catalog.now()
  WHERE private.admin_users.role <> 'super_admin'
  RETURNING * INTO v_record;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_record.id,
    'userId', v_record.user_id,
    'email', v_record.email,
    'role', v_record.role,
    'status', v_record.status,
    'addedBy', COALESCE(v_record.added_by_email, 'yashmithbolishetti01@gmail.com'),
    'createdAt', v_record.created_at,
    'updatedAt', v_record.updated_at
  );
END;
$$;

ALTER FUNCTION public.admin_add_administrator(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_add_administrator(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_administrator(text) TO authenticated, service_role;

-- 11. Public RPC: admin_revoke_administrator(p_target_email text)
-- Strictly restricted to super_admin; cannot revoke yashmithbolishetti01@gmail.com
CREATE OR REPLACE FUNCTION public.admin_revoke_administrator(p_target_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_clean_target text;
  v_record private.admin_users%ROWTYPE;
BEGIN
  IF NOT private.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only the Super Admin can revoke administrator privileges.';
  END IF;

  v_clean_target := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_target_email, ''))), '');
  IF v_clean_target IS NULL THEN
    RAISE EXCEPTION 'Target administrator email is required.';
  END IF;

  IF v_clean_target = 'yashmithbolishetti01@gmail.com' THEN
    RAISE EXCEPTION 'Forbidden: The initial Super Admin account cannot be revoked.';
  END IF;

  UPDATE private.admin_users
  SET
    status = 'revoked',
    updated_at = pg_catalog.now()
  WHERE pg_catalog.lower(pg_catalog.btrim(email)) = v_clean_target
    AND role <> 'super_admin'
  RETURNING * INTO v_record;

  IF v_record.id IS NULL THEN
    RAISE EXCEPTION 'Administrator account not found.';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_record.id,
    'userId', v_record.user_id,
    'email', v_record.email,
    'role', v_record.role,
    'status', v_record.status,
    'updatedAt', v_record.updated_at
  );
END;
$$;

ALTER FUNCTION public.admin_revoke_administrator(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_revoke_administrator(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_administrator(text) TO authenticated, service_role;

COMMIT;
