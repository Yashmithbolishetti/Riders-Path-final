-- ============================================================================
-- Migration: Add bike metadata & admin review fields to public.bikes
-- Target Table: public.bikes
-- Foreign Key Target: public.pickup_locations(id) [UUID]
-- Safe & Repeatable (Idempotent)
-- ============================================================================

BEGIN;

-- 1. pickup_location_id: nullable UUID referencing public.pickup_locations(id) (nullable for drafts)
ALTER TABLE public.bikes
  ADD COLUMN IF NOT EXISTS pickup_location_id UUID;

-- Safely attach the foreign key to public.pickup_locations(id) if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bikes_pickup_location_id_fkey'
      AND conrelid = 'public.bikes'::regclass
  ) THEN
    ALTER TABLE public.bikes
      ADD CONSTRAINT bikes_pickup_location_id_fkey
      FOREIGN KEY (pickup_location_id)
      REFERENCES public.pickup_locations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for fast joins and hub-based filtering
CREATE INDEX IF NOT EXISTS idx_bikes_pickup_location_id
  ON public.bikes (pickup_location_id);

-- 2. specs: JSONB NOT NULL with default empty JSON object
ALTER TABLE public.bikes
  ADD COLUMN IF NOT EXISTS specs JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. approval_notes: nullable TEXT for admin review feedback / rejection reasons
ALTER TABLE public.bikes
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- 4. display_registration_to_public: BOOLEAN NOT NULL DEFAULT false
ALTER TABLE public.bikes
  ADD COLUMN IF NOT EXISTS display_registration_to_public BOOLEAN NOT NULL DEFAULT false;

COMMIT;
