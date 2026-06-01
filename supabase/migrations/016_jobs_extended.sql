-- ============================================================================
-- Migration: 016_jobs_extended
-- Extends job management with materials, multi-vehicle assignments, and loads
-- Adds WTN (Waste Transfer Note) generation
-- ============================================================================

-- ============================================================================
-- material_types — shared reference table (platform-level, not per-org)
-- ============================================================================
CREATE TABLE IF NOT EXISTS material_types (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  code       text        NOT NULL UNIQUE,  -- 3-letter identifier used in invoice refs
  direction  text        NOT NULL CHECK (direction IN ('import', 'export', 'both')),
  is_active  boolean     NOT NULL DEFAULT true,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Import (IN) — aggregates coming to site
INSERT INTO material_types (name, code, direction, sort_order) VALUES
  ('Sharp Sand',              'SHS', 'import', 1),
  ('Building Sand',           'BDS', 'import', 2),
  ('Ballast',                 'BAL', 'import', 3),
  ('10mm Shingle',            'S10', 'import', 4),
  ('20mm Shingle',            'S20', 'import', 5),
  ('30mm Shingle',            'S30', 'import', 6),
  ('40mm Shingle',            'S40', 'import', 7),
  ('6F5 Crush',               '6F5', 'import', 8),
  ('Type 1 Crush',            'T1C', 'import', 9),
  ('Oversize Crush',          'OVC', 'import', 10),
  ('Type 1 Granite (Limestone)', 'T1G', 'import', 11),
-- Both
  ('Tarmac',                  'TAR', 'both',   20),
-- Export (OUT) — waste leaving site
  ('Inert Soil',              'INS', 'export', 1),
  ('Topsoil',                 'TOP', 'export', 2),
  ('Screenable',              'SCN', 'export', 3),
  ('Non-Hazardous',           'NHZ', 'export', 4),
  ('Hazardous',               'HAZ', 'export', 5),
  ('Concrete',                'CON', 'export', 6),
  ('Concrete Piles',          'COP', 'export', 7),
  ('Hardcore',                'HCR', 'export', 8),
  ('Green Waste',             'GRW', 'export', 9);

-- ============================================================================
-- Extend jobs table
-- ============================================================================

-- Drop policies and index that reference driver_id before we remove the column
DROP POLICY IF EXISTS "drivers_read_own_jobs"         ON jobs;
DROP POLICY IF EXISTS "drivers_read_own_job_history"  ON job_status_history;
DROP INDEX IF EXISTS idx_jobs_driver_id;

-- Remove the single-vehicle columns — replaced by job_assignments
ALTER TABLE jobs
  DROP COLUMN IF EXISTS vehicle_id,
  DROP COLUMN IF EXISTS driver_id,
  DROP COLUMN IF EXISTS site_address;

-- Add structured job fields
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS material_type_id uuid        REFERENCES material_types(id),
  ADD COLUMN IF NOT EXISTS direction         text        CHECK (direction IN ('import', 'export')),
  ADD COLUMN IF NOT EXISTS collection_address text,
  ADD COLUMN IF NOT EXISTS collection_lat    double precision,
  ADD COLUMN IF NOT EXISTS collection_lng    double precision,
  ADD COLUMN IF NOT EXISTS disposal_address  text,
  ADD COLUMN IF NOT EXISTS disposal_lat      double precision,
  ADD COLUMN IF NOT EXISTS disposal_lng      double precision,
  ADD COLUMN IF NOT EXISTS total_loads       integer     NOT NULL DEFAULT 1 CHECK (total_loads >= 1),
  ADD COLUMN IF NOT EXISTS rate_per_load     numeric(10,2),
  ADD COLUMN IF NOT EXISTS start_date        date;

-- ============================================================================
-- job_assignments — one row per vehicle assigned to a job
-- ============================================================================
CREATE TABLE IF NOT EXISTS job_assignments (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  vehicle_id      uuid    REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id       uuid    REFERENCES users(id)    ON DELETE SET NULL,
  loads_assigned  integer NOT NULL DEFAULT 1 CHECK (loads_assigned  >= 1),
  loads_completed integer NOT NULL DEFAULT 0 CHECK (loads_completed >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_loads_valid CHECK (loads_completed <= loads_assigned)
);

CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id ON job_assignments (job_id);
CREATE INDEX IF NOT EXISTS idx_job_assignments_driver  ON job_assignments (driver_id);

-- ============================================================================
-- loads — one row per individual load within a job assignment
-- ============================================================================
CREATE TABLE IF NOT EXISTS loads (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid    NOT NULL REFERENCES jobs(id)            ON DELETE CASCADE,
  assignment_id uuid   NOT NULL REFERENCES job_assignments(id) ON DELETE CASCADE,
  org_id       uuid    NOT NULL REFERENCES organisations(id)   ON DELETE CASCADE,
  load_number  integer NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'collecting', 'collected', 'delivering', 'completed')),

  -- Collection
  collection_signed_by    text,
  collection_signature    text,   -- base64 data URL stored directly (offline-safe)
  collection_lat          double precision,
  collection_lng          double precision,
  collected_at            timestamptz,

  -- Disposal / Delivery
  disposal_signed_by      text,
  disposal_signature      text,   -- base64 data URL
  disposal_lat            double precision,
  disposal_lng            double precision,
  disposed_at             timestamptz,

  -- WTN
  wtn_reference    text UNIQUE,   -- 6-char uppercase hex, globally unique
  wtn_generated_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (assignment_id, load_number)
);

CREATE INDEX IF NOT EXISTS idx_loads_job_id       ON loads (job_id);
CREATE INDEX IF NOT EXISTS idx_loads_assignment   ON loads (assignment_id);
CREATE INDEX IF NOT EXISTS idx_loads_org_id       ON loads (org_id);

-- ============================================================================
-- WTN reference generator
-- 6-char uppercase hex (e.g. A3F2B1) — globally unique across all loads
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_wtn_reference() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  ref      text;
  attempts integer := 0;
BEGIN
  LOOP
    ref := upper(encode(gen_random_bytes(3), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM loads WHERE wtn_reference = ref);
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique WTN reference after 20 attempts';
    END IF;
  END LOOP;
  RETURN ref;
END;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- material_types: readable by all authenticated users (platform reference data)
ALTER TABLE material_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_types_read" ON material_types
  FOR SELECT TO authenticated
  USING (is_active = true);

-- job_assignments
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers_all_job_assignments" ON job_assignments
  FOR ALL TO authenticated
  USING    (job_id IN (SELECT id FROM jobs WHERE org_id = auth_user_org_id()) AND auth_user_has_role('manager'))
  WITH CHECK (job_id IN (SELECT id FROM jobs WHERE org_id = auth_user_org_id()) AND auth_user_has_role('manager'));

CREATE POLICY "drivers_read_own_assignments" ON job_assignments
  FOR SELECT TO authenticated
  USING (driver_id = auth_user_id());

-- loads
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers_all_loads" ON loads
  FOR ALL TO authenticated
  USING    (org_id = auth_user_org_id() AND auth_user_has_role('manager'))
  WITH CHECK (org_id = auth_user_org_id() AND auth_user_has_role('manager'));

CREATE POLICY "drivers_read_own_loads" ON loads
  FOR SELECT TO authenticated
  USING (assignment_id IN (SELECT id FROM job_assignments WHERE driver_id = auth_user_id()));

CREATE POLICY "drivers_update_own_loads" ON loads
  FOR UPDATE TO authenticated
  USING  (assignment_id IN (SELECT id FROM job_assignments WHERE driver_id = auth_user_id()));

-- Recreate driver policies for jobs/history — now via job_assignments instead of driver_id column
CREATE POLICY "drivers_read_own_jobs" ON jobs
  FOR SELECT TO authenticated
  USING (id IN (SELECT job_id FROM job_assignments WHERE driver_id = auth_user_id()));

CREATE POLICY "drivers_read_own_job_history" ON job_status_history
  FOR SELECT TO authenticated
  USING (job_id IN (SELECT job_id FROM job_assignments WHERE driver_id = auth_user_id()));
