-- ============================================================================
-- Migration: Automatic public.profiles Synchronization Trigger & Uniqueness Constraints
-- Purpose:
--   1. Enforces database-level case-insensitive uniqueness on public.profiles(email)
--      and public.profiles(enrollment_number) when non-empty.
--   2. Automatically creates or synchronizes the corresponding public.profiles row
--      from auth.users(id, email, raw_user_meta_data) upon Supabase Auth signUp,
--      even when email confirmation is pending and no user JWT exists yet.
-- Safe & Repeatable (Idempotent) — DO NOT EXECUTE WITHOUT REVIEW
-- ============================================================================

BEGIN;

-- 1. Normalize any existing whitespace/case before creating unique partial indexes
UPDATE public.profiles
SET
  email = lower(btrim(email)),
  enrollment_number = upper(btrim(enrollment_number))
WHERE
  (email IS NOT NULL AND email <> lower(btrim(email)))
  OR (enrollment_number IS NOT NULL AND enrollment_number <> upper(btrim(enrollment_number)));

-- 2. Enforce case-insensitive uniqueness on email and enrollment_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_email_lower
  ON public.profiles (lower(btrim(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_enrollment_upper
  ON public.profiles (upper(btrim(enrollment_number)))
  WHERE enrollment_number IS NOT NULL AND btrim(enrollment_number) <> '';

-- 3. Trigger function to synchronize auth.users -> public.profiles on signup / metadata update
CREATE OR REPLACE FUNCTION public.handle_auth_user_profile_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_full_name text;
  v_email text;
  v_phone text;
  v_enrollment text;
  v_academic_year text;
  v_course text;
BEGIN
  v_full_name := pg_catalog.btrim(
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'fullName',
      ''
    )
  );
  v_email := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(NEW.email, ''))), '');
  v_phone := NULLIF(pg_catalog.btrim(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), '');
  v_enrollment := NULLIF(
    pg_catalog.upper(
      pg_catalog.btrim(
        COALESCE(
          NEW.raw_user_meta_data ->> 'enrollment_number',
          NEW.raw_user_meta_data ->> 'icfaiEnrollmentNumber',
          ''
        )
      )
    ),
    ''
  );
  v_academic_year := NULLIF(
    pg_catalog.btrim(
      COALESCE(
        NEW.raw_user_meta_data ->> 'academic_year',
        NEW.raw_user_meta_data ->> 'academicYear',
        ''
      )
    ),
    ''
  );
  v_course := NULLIF(pg_catalog.btrim(COALESCE(NEW.raw_user_meta_data ->> 'course', '')), '');

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    phone,
    enrollment_number,
    academic_year,
    course,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_email,
    v_phone,
    v_enrollment,
    v_academic_year,
    v_course,
    COALESCE(NEW.created_at, pg_catalog.now()),
    pg_catalog.now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = CASE
      WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    enrollment_number = COALESCE(EXCLUDED.enrollment_number, public.profiles.enrollment_number),
    academic_year = COALESCE(EXCLUDED.academic_year, public.profiles.academic_year),
    course = COALESCE(EXCLUDED.course, public.profiles.course),
    updated_at = pg_catalog.now();

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_auth_user_profile_sync() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.handle_auth_user_profile_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_auth_user_profile_sync() FROM anon;
REVOKE ALL ON FUNCTION public.handle_auth_user_profile_sync() FROM authenticated;
REVOKE ALL ON FUNCTION public.handle_auth_user_profile_sync() FROM service_role;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_profile_sync ON auth.users;
CREATE TRIGGER on_auth_user_profile_sync
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_profile_sync();

COMMIT;
