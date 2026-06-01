-- Add subscription tier and price tracking to organisations
-- subscription_tier: 1 = Comply, 2 = Manage, 3 = Control
-- stripe_price_id: the active Stripe price ID for this org's subscription

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS subscription_tier smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- All existing orgs are Tier 1 by default — no data migration needed beyond the DEFAULT
