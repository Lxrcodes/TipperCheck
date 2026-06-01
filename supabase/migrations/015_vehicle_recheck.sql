-- ============================================================================
-- Migration: 015_vehicle_recheck
-- Adds requires_recheck flag to vehicles.
-- Set to true by managers after a defect is resolved to require driver
-- to complete a fresh walk-around before driving.
-- Cleared automatically when driver completes a passing check.
-- ============================================================================

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS requires_recheck boolean NOT NULL DEFAULT false;
