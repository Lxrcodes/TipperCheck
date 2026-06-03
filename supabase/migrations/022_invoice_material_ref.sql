-- ============================================================================
-- Migration: 022_invoice_material_ref
-- Add material_type_id to invoices and update the number-generation trigger
-- to produce {job_code}-{mat_code}-{seq} (e.g. AAA-INS-0001) when both
-- a job and material type are set; falls back to INV-{seq} otherwise.
-- ============================================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS material_type_id uuid REFERENCES material_types(id) ON DELETE SET NULL;

-- Replace the trigger function with the new format logic
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  new_seq    integer;
  job_code_v text;
  mat_code_v text;
BEGIN
  UPDATE organisations
    SET next_invoice_seq = next_invoice_seq + 1
    WHERE id = NEW.org_id
    RETURNING next_invoice_seq INTO new_seq;

  IF NEW.job_id IS NOT NULL AND NEW.material_type_id IS NOT NULL THEN
    SELECT job_code INTO job_code_v FROM jobs          WHERE id = NEW.job_id;
    SELECT code     INTO mat_code_v  FROM material_types WHERE id = NEW.material_type_id;
    NEW.number := job_code_v || '-' || mat_code_v || '-' || lpad(new_seq::text, 4, '0');
  ELSE
    NEW.number := 'INV-' || lpad(new_seq::text, 4, '0');
  END IF;

  RETURN NEW;
END;
$$;
