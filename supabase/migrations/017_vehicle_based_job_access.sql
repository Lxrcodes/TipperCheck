-- ============================================================================
-- Migration: 017_vehicle_based_job_access
-- Jobs are now vehicle-assigned, not driver-assigned.
-- Drivers access jobs via the vehicle they last checked, not via driver_id.
-- RLS policies updated: driver access is now scoped to org vehicles.
-- ============================================================================

-- Drop old driver_id-based policies from migrations 016
DROP POLICY IF EXISTS "drivers_read_own_assignments"  ON job_assignments;
DROP POLICY IF EXISTS "drivers_read_own_loads"        ON loads;
DROP POLICY IF EXISTS "drivers_update_own_loads"      ON loads;
DROP POLICY IF EXISTS "drivers_read_own_jobs"         ON jobs;
DROP POLICY IF EXISTS "drivers_read_own_job_history"  ON job_status_history;

-- job_assignments: any driver in the org can see assignments for org vehicles
CREATE POLICY "drivers_read_org_assignments" ON job_assignments
  FOR SELECT TO authenticated
  USING (
    vehicle_id IN (SELECT id FROM vehicles WHERE org_id = auth_user_org_id())
  );

-- loads: drivers can read any load in their org
CREATE POLICY "drivers_read_org_loads" ON loads
  FOR SELECT TO authenticated
  USING (org_id = auth_user_org_id());

-- loads: drivers can update loads for org vehicles (frontend restricts to current vehicle)
CREATE POLICY "drivers_update_org_loads" ON loads
  FOR UPDATE TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM job_assignments
      WHERE vehicle_id IN (SELECT id FROM vehicles WHERE org_id = auth_user_org_id())
    )
  );

-- jobs: drivers can read jobs that have vehicle assignments in their org
CREATE POLICY "drivers_read_org_jobs" ON jobs
  FOR SELECT TO authenticated
  USING (org_id = auth_user_org_id());

-- job_status_history: drivers can read history for jobs in their org
CREATE POLICY "drivers_read_org_job_history" ON job_status_history
  FOR SELECT TO authenticated
  USING (
    job_id IN (SELECT id FROM jobs WHERE org_id = auth_user_org_id())
  );
