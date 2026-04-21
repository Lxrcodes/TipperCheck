-- ============================================================================
-- TipperCheck Database Schema
-- Migration: 001_initial_schema
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- COMPANIES
-- ============================================================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  manager_email VARCHAR(255),
  manager_phone VARCHAR(20),
  stripe_customer_id VARCHAR(50),
  subscription_id VARCHAR(50),
  subscription_status VARCHAR(20) DEFAULT 'trialing',
  vehicle_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_subscription_status CHECK (
    subscription_status IN ('trialing', 'active', 'canceled', 'past_due')
  )
);

-- ============================================================================
-- VEHICLES
-- ============================================================================
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  registration VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(50) DEFAULT 'tipper',
  make VARCHAR(100),
  model VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_vehicle_type CHECK (
    vehicle_type IN ('tipper', 'rigid_hgv', 'artic', 'grab_loader', 'other')
  ),
  UNIQUE(company_id, registration)
);

-- ============================================================================
-- DRIVERS
-- ============================================================================
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  phone VARCHAR(20),
  pin_hash VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, email)
);

-- ============================================================================
-- CHECK TEMPLATES (versioned)
-- ============================================================================
CREATE TABLE check_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  version INTEGER DEFAULT 1,
  vehicle_types VARCHAR(50)[] DEFAULT ARRAY['tipper'],
  categories JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(code, version)
);

-- ============================================================================
-- DAILY CHECKS (offline-first with deduplication)
-- ============================================================================
CREATE TABLE daily_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(50) UNIQUE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES check_templates(id),
  template_version INTEGER NOT NULL,

  check_date DATE NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  gps_start JSONB,
  gps_end JSONB,

  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_status VARCHAR(20),

  signature_url TEXT,
  pdf_url TEXT,

  offline_created_at TIMESTAMPTZ,
  sync_status VARCHAR(20) DEFAULT 'synced',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_overall_status CHECK (
    overall_status IN ('pass', 'defects', 'do_not_drive')
  ),
  CONSTRAINT valid_sync_status CHECK (
    sync_status IN ('synced', 'pending', 'failed')
  )
);

-- ============================================================================
-- DEFECTS (workflow tracking)
-- ============================================================================
CREATE TABLE defects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES daily_checks(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  item_id VARCHAR(100) NOT NULL,
  item_label VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL,

  status VARCHAR(20) DEFAULT 'raised',

  photo_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  driver_notes TEXT,

  assigned_to UUID REFERENCES drivers(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,

  sms_sent BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_severity CHECK (
    severity IN ('critical', 'major', 'minor')
  ),
  CONSTRAINT valid_status CHECK (
    status IN ('raised', 'acknowledged', 'assigned', 'resolved')
  )
);

-- ============================================================================
-- SMS LOG
-- ============================================================================
CREATE TABLE sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  defect_id UUID REFERENCES defects(id) ON DELETE SET NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  twilio_sid VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Vehicles
CREATE INDEX idx_vehicles_company ON vehicles(company_id);
CREATE INDEX idx_vehicles_registration ON vehicles(registration);

-- Drivers
CREATE INDEX idx_drivers_company ON drivers(company_id);
CREATE INDEX idx_drivers_auth_user ON drivers(auth_user_id);
CREATE INDEX idx_drivers_email ON drivers(email);

-- Daily Checks
CREATE INDEX idx_daily_checks_vehicle ON daily_checks(vehicle_id);
CREATE INDEX idx_daily_checks_driver ON daily_checks(driver_id);
CREATE INDEX idx_daily_checks_date ON daily_checks(check_date);
CREATE INDEX idx_daily_checks_client_id ON daily_checks(client_id);
CREATE INDEX idx_daily_checks_vehicle_date ON daily_checks(vehicle_id, check_date DESC);

-- Defects
CREATE INDEX idx_defects_vehicle ON defects(vehicle_id);
CREATE INDEX idx_defects_company ON defects(company_id);
CREATE INDEX idx_defects_status ON defects(status);
CREATE INDEX idx_defects_check ON defects(check_id);
CREATE INDEX idx_defects_unresolved ON defects(company_id, status) WHERE status != 'resolved';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update vehicle count on company when vehicles change
CREATE OR REPLACE FUNCTION update_company_vehicle_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE companies SET vehicle_count = vehicle_count + 1, updated_at = NOW()
    WHERE id = NEW.company_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE companies SET vehicle_count = vehicle_count - 1, updated_at = NOW()
    WHERE id = OLD.company_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_vehicle_count
  AFTER INSERT OR DELETE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_company_vehicle_count();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_companies_updated
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_vehicles_updated
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_drivers_updated
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_defects_updated
  BEFORE UPDATE ON defects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

-- Check templates: readable by all authenticated users
CREATE POLICY "Templates are readable by all"
  ON check_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Companies: users can only access their own company
CREATE POLICY "Users can view own company"
  ON companies FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT company_id FROM drivers WHERE auth_user_id = auth.uid()
    )
  );

-- Vehicles: users can view vehicles in their company
CREATE POLICY "Users can view company vehicles"
  ON vehicles FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM drivers WHERE auth_user_id = auth.uid()
    )
  );

-- Drivers: users can view drivers in their company
CREATE POLICY "Users can view company drivers"
  ON drivers FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM drivers WHERE auth_user_id = auth.uid()
    )
  );

-- Daily checks: users can view/insert checks for their company's vehicles
CREATE POLICY "Users can view company checks"
  ON daily_checks FOR SELECT
  TO authenticated
  USING (
    vehicle_id IN (
      SELECT v.id FROM vehicles v
      JOIN drivers d ON d.company_id = v.company_id
      WHERE d.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Drivers can insert checks"
  ON daily_checks FOR INSERT
  TO authenticated
  WITH CHECK (
    driver_id IN (
      SELECT id FROM drivers WHERE auth_user_id = auth.uid()
    )
  );

-- Defects: users can view defects for their company
CREATE POLICY "Users can view company defects"
  ON defects FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM drivers WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update company defects"
  ON defects FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM drivers WHERE auth_user_id = auth.uid()
    )
  );
