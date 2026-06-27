ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'year';
