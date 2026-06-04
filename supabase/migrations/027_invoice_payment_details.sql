ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS paid_at            date,
  ADD COLUMN IF NOT EXISTS payment_method     varchar(20),
  ADD COLUMN IF NOT EXISTS payment_reference  text;
