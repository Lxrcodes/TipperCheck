-- Migration: Add subscription cancellation tracking columns
-- Allows tracking when a subscription is set to cancel at period end

ALTER TABLE organisations
  ADD COLUMN current_period_end TIMESTAMPTZ,
  ADD COLUMN cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN organisations.current_period_end IS 'End date of the current billing period from Stripe';
COMMENT ON COLUMN organisations.cancel_at_period_end IS 'Whether the subscription is set to cancel at period end';
