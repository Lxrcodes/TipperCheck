-- Add invoice-related fields to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS address          text,
  ADD COLUMN IF NOT EXISTS company_number   varchar(20),
  ADD COLUMN IF NOT EXISTS vat_number       varchar(20),
  ADD COLUMN IF NOT EXISTS bank_name        text,
  ADD COLUMN IF NOT EXISTS bank_account_number varchar(10),
  ADD COLUMN IF NOT EXISTS bank_sort_code   varchar(8);

-- Expose new fields on the public invoice endpoint
CREATE OR REPLACE FUNCTION get_invoice_public(p_number text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $func$
  SELECT json_build_object(
    'invoice',  row_to_json(i),
    'items', (
      SELECT json_agg(row_to_json(ii) ORDER BY ii.sort_order)
      FROM invoice_items ii
      WHERE ii.invoice_id = i.id
    ),
    'org_name',                 o.name,
    'org_address',              o.address,
    'org_contact_email',        o.contact_email,
    'org_contact_phone',        o.contact_phone,
    'org_company_number',       o.company_number,
    'org_vat_number',           o.vat_number,
    'org_bank_name',            o.bank_name,
    'org_bank_account_number',  o.bank_account_number,
    'org_bank_sort_code',       o.bank_sort_code
  )
  FROM invoices i
  JOIN organisations o ON o.id = i.org_id
  WHERE i.number = upper(p_number)
    AND i.status != 'void'
$func$;
