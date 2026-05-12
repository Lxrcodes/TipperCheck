-- ============================================================================
-- Migration: 010_mot_records
-- Adds MOT record history and allows defects to be sourced from MOT tests
-- ============================================================================

-- ============================================================================
-- MOT RECORDS
-- Immutable log of each MOT test conducted on a vehicle
-- ============================================================================

CREATE TABLE mot_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,

  -- Denormalized for audit trail
  vehicle_registration VARCHAR(20) NOT NULL,

  -- MOT details
  mot_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  result VARCHAR(10) NOT NULL CHECK (result IN ('pass', 'fail')),
  advisory_notes TEXT,

  -- Who recorded this
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_by_name VARCHAR(255) NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mot_records_org ON mot_records(org_id);
CREATE INDEX idx_mot_records_vehicle ON mot_records(vehicle_id);
CREATE INDEX idx_mot_records_vehicle_date ON mot_records(vehicle_id, mot_date DESC);

-- ============================================================================
-- UPDATE DEFECTS TABLE
-- Allow defects to be sourced from MOT tests, not just check runs
-- ============================================================================

-- Make check_run_id nullable (was NOT NULL - required for MOT-sourced defects)
ALTER TABLE defects ALTER COLUMN check_run_id DROP NOT NULL;

-- Add mot_record_id as the alternative source
ALTER TABLE defects ADD COLUMN mot_record_id UUID REFERENCES mot_records(id) ON DELETE CASCADE;

CREATE INDEX idx_defects_mot_record ON defects(mot_record_id);

-- Enforce that every defect has exactly one source
ALTER TABLE defects ADD CONSTRAINT defect_has_source
  CHECK (
    (check_run_id IS NOT NULL AND mot_record_id IS NULL)
    OR
    (check_run_id IS NULL AND mot_record_id IS NOT NULL)
  );

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE mot_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers_read_own_org_mot_records" ON mot_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
        AND users.org_id = mot_records.org_id
        AND users.is_active = TRUE
    )
  );

CREATE POLICY "managers_insert_own_org_mot_records" ON mot_records
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
        AND users.org_id = mot_records.org_id
        AND 'manager' = ANY(users.roles)
        AND users.is_active = TRUE
    )
  );
