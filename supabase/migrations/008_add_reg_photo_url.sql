-- ============================================================================
-- Add reg_photo_url column to check_runs
-- Migration: 008_add_reg_photo_url
-- ============================================================================

ALTER TABLE check_runs
ADD COLUMN IF NOT EXISTS reg_photo_url TEXT;

