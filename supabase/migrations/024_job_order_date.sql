-- Add order_date to job_orders so each order can be scheduled on a specific day.
-- A job spans multiple days; orders track which day the loads run.
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS order_date date;
