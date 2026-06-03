-- ============================================================================
-- Migration: 023_job_orders
-- A job is now a project container. Orders carry material/direction/rate/loads.
-- Each job can have many orders; each order has vehicle assignments.
-- Migrates existing data: one order per existing job.
-- Updates WTN RPC to use order material/direction with job fallback.
-- ============================================================================

-- 1. Create job_orders table
CREATE TABLE job_orders (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  org_id           uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_by       uuid        REFERENCES users(id) ON DELETE SET NULL,
  material_type_id uuid        REFERENCES material_types(id) ON DELETE SET NULL,
  direction        text        CHECK (direction IN ('import', 'export')),
  total_loads      integer     NOT NULL DEFAULT 1,
  rate_per_load    numeric(10, 2),
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE job_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers manage org job orders"
  ON job_orders FOR ALL TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
       WHERE auth_user_id = auth.uid()
         AND 'manager' = ANY(roles)
    )
  );

CREATE POLICY "drivers read assigned job orders"
  ON job_orders FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM job_assignments ja
        JOIN users u ON u.id = ja.driver_id
       WHERE ja.job_order_id = job_orders.id
         AND u.auth_user_id = auth.uid()
    )
  );

-- 3. Add job_order_id FK to job_assignments
ALTER TABLE job_assignments
  ADD COLUMN IF NOT EXISTS job_order_id uuid REFERENCES job_orders(id) ON DELETE SET NULL;

-- 4. Migrate existing data: one order per job, linking existing assignments
WITH migrated AS (
  INSERT INTO job_orders (
    id, job_id, org_id, created_by,
    material_type_id, direction, total_loads, rate_per_load,
    status, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    j.id,
    j.org_id,
    j.created_by,
    j.material_type_id,
    j.direction,
    GREATEST(j.total_loads, 1),
    j.rate_per_load,
    j.status,
    j.created_at,
    j.updated_at
  FROM jobs j
  RETURNING id, job_id
)
UPDATE job_assignments ja
   SET job_order_id = m.id
  FROM migrated m
 WHERE m.job_id = ja.job_id;

-- 5. Update WTN RPC: use order's material/direction, fall back to job columns
CREATE OR REPLACE FUNCTION get_wtn_ticket(p_reference text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT json_build_object(
    'wtn_reference',        l.wtn_reference,
    'wtn_generated_at',     l.wtn_generated_at,
    'load_number',          l.load_number,
    'collected_at',         l.collected_at,
    'disposed_at',          l.disposed_at,
    'collection_signed_by', l.collection_signed_by,
    'collection_signature', l.collection_signature,
    'collection_lat',       l.collection_lat,
    'collection_lng',       l.collection_lng,
    'disposal_signed_by',   l.disposal_signed_by,
    'disposal_signature',   l.disposal_signature,
    'disposal_lat',         l.disposal_lat,
    'disposal_lng',         l.disposal_lng,
    'disposal_photo_url',   l.disposal_photo_url,
    'job_title',            j.title,
    'direction',            COALESCE(jo.direction,    j.direction),
    'collection_address',   j.collection_address,
    'disposal_address',     j.disposal_address,
    'material_name',        COALESCE(mt_o.name, mt_j.name),
    'material_code',        COALESCE(mt_o.code, mt_j.code),
    'vehicle_reg',          v.registration,
    'org_name',             o.name
  )
  FROM  loads l
  JOIN  job_assignments  ja   ON ja.id   = l.assignment_id
  JOIN  jobs             j    ON j.id    = l.job_id
  LEFT JOIN job_orders   jo   ON jo.id   = ja.job_order_id
  LEFT JOIN material_types mt_o ON mt_o.id = jo.material_type_id
  LEFT JOIN material_types mt_j ON mt_j.id = j.material_type_id
  LEFT JOIN vehicles     v    ON v.id    = ja.vehicle_id
  LEFT JOIN organisations o   ON o.id    = j.org_id
  WHERE l.wtn_reference = p_reference
    AND l.wtn_reference IS NOT NULL
  LIMIT 1;
$$;
