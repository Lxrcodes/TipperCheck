ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
