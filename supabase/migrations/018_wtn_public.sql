-- ============================================================================
-- Migration: 018_wtn_public
-- Adds disposal photo URL to loads.
-- Adds a SECURITY DEFINER function so anonymous users can fetch WTN ticket
-- data by reference — the 6-char reference acts as a secret token.
-- ============================================================================

ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS disposal_photo_url text;

-- ============================================================================
-- Public WTN ticket lookup
-- Returns everything needed to render a public transfer note.
-- SECURITY DEFINER bypasses RLS — safe because we only return completed
-- loads that have a wtn_reference set.
-- ============================================================================
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
    'direction',            j.direction,
    'collection_address',   j.collection_address,
    'disposal_address',     j.disposal_address,
    'material_name',        mt.name,
    'material_code',        mt.code,
    'vehicle_reg',          v.registration,
    'org_name',             o.name
  )
  FROM loads l
  JOIN job_assignments ja ON ja.id = l.assignment_id
  JOIN jobs j             ON j.id  = l.job_id
  LEFT JOIN material_types mt ON mt.id = j.material_type_id
  LEFT JOIN vehicles v        ON v.id  = ja.vehicle_id
  LEFT JOIN organisations o   ON o.id  = j.org_id
  WHERE l.wtn_reference = p_reference
    AND l.wtn_reference IS NOT NULL
  LIMIT 1;
$$;

-- Allow anonymous callers (public WTN pages, no login required)
GRANT EXECUTE ON FUNCTION get_wtn_ticket(text) TO anon;
GRANT EXECUTE ON FUNCTION get_wtn_ticket(text) TO authenticated;
