-- Add is_demo flag to organisations to allow demo accounts without a subscription
ALTER TABLE organisations
  ADD COLUMN is_demo BOOLEAN DEFAULT FALSE NOT NULL;
