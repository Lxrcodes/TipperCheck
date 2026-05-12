-- ============================================================================
-- Migration: 011_pmi_records
-- Adds PMI interval to vehicles, PMI record history, and PMI as a defect source
-- ============================================================================

-- ============================================================================
-- PMI INTERVAL ON VEHICLES
-- Configurable per vehicle, defaults to 6 weeks (UK standard HGV)
-- ============================================================================

ALTER TABLE vehicles ADD COLUMN pmi_interval_weeks INTEGER NOT NULL DEFAULT 6;

-- ============================================================================
-- PMI RECORDS
-- Immutable log of each PMI inspection conducted on a vehicle
-- ============================================================================

CREATE TABLE pmi_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,

  -- Denormalized for audit trail
  vehicle_registration VARCHAR(20) NOT NULL,

  -- PMI details
  pmi_date DATE NOT NULL,
  next_due_date DATE NOT NULL,
  interval_weeks INTEGER NOT NULL,
  result VARCHAR(10) NOT NULL CHECK (result IN ('pass', 'fail')),
  advisory_notes TEXT,

  -- Who recorded this
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_by_name VARCHAR(255) NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pmi_records_org ON pmi_records(org_id);
CREATE INDEX idx_pmi_records_vehicle ON pmi_records(vehicle_id);
CREATE INDEX idx_pmi_records_vehicle_date ON pmi_records(vehicle_id, pmi_date DESC);

-- ============================================================================
-- UPDATE DEFECTS TABLE
-- Allow PMI records as a third defect source, alongside check runs and MOT records
-- ============================================================================

ALTER TABLE defects ADD COLUMN pmi_record_id UUID REFERENCES pmi_records(id) ON DELETE CASCADE;

CREATE INDEX idx_defects_pmi_record ON defects(pmi_record_id);

-- Drop the 2-way source constraint from migration 010 and replace with 3-way
ALTER TABLE defects DROP CONSTRAINT IF EXISTS defect_has_source;

ALTER TABLE defects ADD CONSTRAINT defect_has_source
  CHECK (
    (check_run_id IS NOT NULL AND mot_record_id IS NULL AND pmi_record_id IS NULL)
    OR
    (check_run_id IS NULL AND mot_record_id IS NOT NULL AND pmi_record_id IS NULL)
    OR
    (check_run_id IS NULL AND mot_record_id IS NULL AND pmi_record_id IS NOT NULL)
  );

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE pmi_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_org_pmi_records" ON pmi_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
        AND users.org_id = pmi_records.org_id
        AND users.is_active = TRUE
    )
  );

CREATE POLICY "managers_insert_own_org_pmi_records" ON pmi_records
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_user_id = auth.uid()
        AND users.org_id = pmi_records.org_id
        AND 'manager' = ANY(users.roles)
        AND users.is_active = TRUE
    )
  );
