-- ============================================================================
-- TipperCheck Seed Data
-- Migration: 004_seed_test_data
--
-- Creates:
-- 1. Fleet org: "Smith Haulage" with manager + 3 drivers + 5 vehicles
-- 2. Owner-operator org: "Dave's Tipper" with 1 dual-role user + 1 vehicle
-- ============================================================================

-- NOTE: This seed data uses hardcoded UUIDs for predictability in testing.
-- The auth_user_id fields are left NULL - they get populated when users
-- accept their invites and create Supabase Auth accounts.

-- ============================================================================
-- FLEET ORGANISATION: Smith Haulage
-- ============================================================================

INSERT INTO organisations (id, name, contact_email, contact_phone, o_licence_number, subscription_status)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Smith Haulage Ltd',
  'office@smithhaulage.co.uk',
  '01onalonal234 567890',
  'OB1234567',
  'active'
);

-- Manager: Sarah Smith (Fleet Manager)
INSERT INTO users (id, org_id, email, name, phone, roles, is_billing_admin)
VALUES (
  '22222222-2222-2222-2222-222222222221',
  '11111111-1111-1111-1111-111111111111',
  'sarah@smithhaulage.co.uk',
  'Sarah Smith',
  '07700 900001',
  ARRAY['manager'],
  TRUE
);

-- Driver 1: John Driver
INSERT INTO users (id, org_id, email, name, phone, roles)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'john@smithhaulage.co.uk',
  'John Driver',
  '07700 900002',
  ARRAY['driver']
);

-- Driver 2: Mike Transport
INSERT INTO users (id, org_id, email, name, phone, roles)
VALUES (
  '22222222-2222-2222-2222-222222222223',
  '11111111-1111-1111-1111-111111111111',
  'mike@smithhaulage.co.uk',
  'Mike Transport',
  '07700 900003',
  ARRAY['driver']
);

-- Driver 3: Pete Loader
INSERT INTO users (id, org_id, email, name, phone, roles)
VALUES (
  '22222222-2222-2222-2222-222222222224',
  '11111111-1111-1111-1111-111111111111',
  'pete@smithhaulage.co.uk',
  'Pete Loader',
  '07700 900004',
  ARRAY['driver']
);

-- Vehicle 1: Tipper
INSERT INTO vehicles (id, org_id, registration, vehicle_type, make, model, status, created_by)
VALUES (
  '33333333-3333-3333-3333-333333333331',
  '11111111-1111-1111-1111-111111111111',
  'SM21 TIP',
  'tipper',
  'DAF',
  'CF 400 FAT',
  'active',
  '22222222-2222-2222-2222-222222222221'
);

-- Vehicle 2: Tipper
INSERT INTO vehicles (id, org_id, registration, vehicle_type, make, model, status, mot_due_date, created_by)
VALUES (
  '33333333-3333-3333-3333-333333333332',
  '11111111-1111-1111-1111-111111111111',
  'SM22 TIP',
  'tipper',
  'Volvo',
  'FMX 420',
  'active',
  '2025-06-15',
  '22222222-2222-2222-2222-222222222221'
);

-- Vehicle 3: Grab Loader
INSERT INTO vehicles (id, org_id, registration, vehicle_type, make, model, status, created_by)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'SM20 GRB',
  'grab_loader',
  'Mercedes-Benz',
  'Arocs 3240',
  'active',
  '22222222-2222-2222-2222-222222222221'
);

-- Vehicle 4: Rigid HGV (VOR - off road)
INSERT INTO vehicles (id, org_id, registration, vehicle_type, make, model, status, status_notes, status_changed_at, created_by)
VALUES (
  '33333333-3333-3333-3333-333333333334',
  '11111111-1111-1111-1111-111111111111',
  'SM19 RIG',
  'rigid_hgv',
  'Scania',
  'P410',
  'vor',
  'Gearbox repair - ETA next week',
  NOW() - INTERVAL '3 days',
  '22222222-2222-2222-2222-222222222221'
);

-- Vehicle 5: Artic
INSERT INTO vehicles (id, org_id, registration, vehicle_type, make, model, status, created_by)
VALUES (
  '33333333-3333-3333-3333-333333333335',
  '11111111-1111-1111-1111-111111111111',
  'SM23 ART',
  'artic',
  'MAN',
  'TGX 18.510',
  'active',
  '22222222-2222-2222-2222-222222222221'
);

-- ============================================================================
-- OWNER-OPERATOR ORGANISATION: Dave's Tipper
-- ============================================================================

INSERT INTO organisations (id, name, contact_email, contact_phone, subscription_status)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  'Dave''s Tipper Services',
  'dave@daves-tipper.co.uk',
  '07700 900100',
  'trialing'
);

-- Dave: Owner-operator with BOTH manager and driver roles
INSERT INTO users (id, org_id, email, name, phone, roles, is_billing_admin)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  'dave@daves-tipper.co.uk',
  'Dave Thompson',
  '07700 900100',
  ARRAY['manager', 'driver'],
  TRUE
);

-- Dave's single vehicle
INSERT INTO vehicles (id, org_id, registration, vehicle_type, make, model, status, created_by)
VALUES (
  '66666666-6666-6666-6666-666666666666',
  '44444444-4444-4444-4444-444444444444',
  'DT24 TIP',
  'tipper',
  'DAF',
  'CF 370 FAT',
  'active',
  '55555555-5555-5555-5555-555555555555'
);

-- ============================================================================
-- UPDATE VEHICLE COUNTS
-- ============================================================================

-- Fleet org: 4 active vehicles (1 is VOR)
UPDATE organisations SET active_vehicle_count = 4 WHERE id = '11111111-1111-1111-1111-111111111111';

-- Owner-operator: 1 active vehicle
UPDATE organisations SET active_vehicle_count = 1 WHERE id = '44444444-4444-4444-4444-444444444444';
