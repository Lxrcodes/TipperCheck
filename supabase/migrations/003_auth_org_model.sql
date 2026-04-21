-- ============================================================================
-- TipperCheck Database Schema v2
-- Migration: 003_auth_org_model
--
-- Implements the Organisation → User → Vehicle → CheckRun model
-- with combinable roles (manager + driver on same user)
-- ============================================================================

-- ============================================================================
-- DROP OLD TABLES (if migrating from v1)
-- ============================================================================
-- Uncomment these if you need to migrate from the old schema
-- DROP TABLE IF EXISTS sms_log CASCADE;
-- DROP TABLE IF EXISTS defects CASCADE;
-- DROP TABLE IF EXISTS daily_checks CASCADE;
-- DROP TABLE IF EXISTS check_templates CASCADE;
-- DROP TABLE IF EXISTS drivers CASCADE;
-- DROP TABLE IF EXISTS vehicles CASCADE;
-- DROP TABLE IF EXISTS companies CASCADE;

-- ============================================================================
-- ENUMS
-- ============================================================================

-- User roles - stored as array on user, not separate enum column
-- This allows: ['manager'], ['driver'], or ['manager', 'driver']

CREATE TYPE vehicle_status AS ENUM ('active', 'vor', 'retired');
CREATE TYPE vehicle_type AS ENUM ('tipper', 'rigid_hgv', 'artic', 'trailer', 'van', 'grab_loader', 'other');
CREATE TYPE check_overall_status AS ENUM ('pass', 'defects', 'do_not_drive');
CREATE TYPE defect_severity AS ENUM ('critical', 'major', 'minor');
CREATE TYPE defect_status AS ENUM ('raised', 'acknowledged', 'assigned', 'resolved');
CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

-- ============================================================================
-- ORGANISATIONS
-- The paying customer. Top-level tenant. All other records scope to an org.
-- ============================================================================

CREATE TABLE organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,

  -- Contact info
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),

  -- Operator details (UK specific)
  o_licence_number VARCHAR(50),

  -- Billing
  stripe_customer_id VARCHAR(50),
  subscription_id VARCHAR(50),
  subscription_status VARCHAR(20) DEFAULT 'trialing',

  -- Counts (denormalized for billing)
  active_vehicle_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_subscription_status CHECK (
    subscription_status IN ('trialing', 'active', 'canceled', 'past_due', 'incomplete')
  )
);

-- ============================================================================
-- USERS
-- A single person. Belongs to exactly one org. Has roles as a set.
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  -- Identity
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),

  -- Roles: array containing 'manager', 'driver', or both
  roles TEXT[] NOT NULL DEFAULT ARRAY['driver'],

  -- Billing admin flag (first manager is billing admin by default)
  is_billing_admin BOOLEAN DEFAULT FALSE,

  -- 2FA (column exists for future use)
  totp_secret VARCHAR(255),
  totp_enabled BOOLEAN DEFAULT FALSE,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES users(id),

  -- Invite tracking
  invite_token VARCHAR(255),
  invite_sent_at TIMESTAMPTZ,
  invite_accepted_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_roles CHECK (
    roles <@ ARRAY['manager', 'driver']::TEXT[] AND
    array_length(roles, 1) > 0
  ),
  CONSTRAINT unique_email_per_org UNIQUE (org_id, email)
);

-- Index for auth lookups
CREATE INDEX idx_users_auth_user ON users(auth_user_id);
CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_invite_token ON users(invite_token) WHERE invite_token IS NOT NULL;

-- ============================================================================
-- VEHICLES
-- Belongs to org, not to any user. Any driver can select any active vehicle.
-- ============================================================================

CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  -- Core identity
  registration VARCHAR(20) NOT NULL,
  vehicle_type vehicle_type NOT NULL DEFAULT 'tipper',

  -- Details
  make VARCHAR(100),
  model VARCHAR(100),
  vin VARCHAR(50),

  -- Compliance
  registration_keeper VARCHAR(255),
  o_licence_number VARCHAR(50),
  mot_due_date DATE,
  last_pmi_date DATE,
  next_pmi_due_date DATE,

  -- Status
  status vehicle_status NOT NULL DEFAULT 'active',
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID REFERENCES users(id),
  status_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  CONSTRAINT unique_reg_per_org UNIQUE (org_id, registration)
);

CREATE INDEX idx_vehicles_org ON vehicles(org_id);
CREATE INDEX idx_vehicles_status ON vehicles(status);
CREATE INDEX idx_vehicles_reg ON vehicles(registration);
CREATE INDEX idx_vehicles_active ON vehicles(org_id) WHERE status = 'active';

-- ============================================================================
-- CHECK TEMPLATES (versioned, org-agnostic)
-- ============================================================================

CREATE TABLE check_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  version INTEGER DEFAULT 1,
  vehicle_types vehicle_type[] DEFAULT ARRAY['tipper']::vehicle_type[],
  categories JSONB NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(code, version)
);

-- ============================================================================
-- CHECK RUNS
-- The immutable audit record. Join between driver, vehicle, and template.
-- ============================================================================

CREATE TABLE check_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client-side deduplication
  client_id VARCHAR(50) UNIQUE,

  -- Foreign keys (for queries, but data is also denormalized)
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  template_id UUID NOT NULL REFERENCES check_templates(id) ON DELETE RESTRICT,

  -- =========================================================================
  -- DENORMALIZED FIELDS (captured at submission time - IMMUTABLE)
  -- These protect the audit trail from future edits to user/vehicle/template
  -- =========================================================================
  driver_name VARCHAR(255) NOT NULL,
  driver_email VARCHAR(255) NOT NULL,
  vehicle_registration VARCHAR(20) NOT NULL,
  vehicle_type vehicle_type NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  template_version INTEGER NOT NULL,

  -- Check details
  check_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,

  -- Location
  gps_start JSONB,
  gps_end JSONB,
  location_address VARCHAR(500),

  -- Results (immutable after submission)
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_status check_overall_status NOT NULL,

  -- Attachments
  signature_url TEXT,
  pdf_url TEXT,

  -- Offline sync tracking
  offline_created_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()

  -- NOTE: No updated_at - check runs are immutable
);

-- Make check_runs truly immutable at database level
CREATE OR REPLACE FUNCTION prevent_check_run_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Check runs are immutable and cannot be modified or deleted. Corrections must be made by running a new check.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_runs_immutable_update
  BEFORE UPDATE ON check_runs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_check_run_modification();

CREATE TRIGGER check_runs_immutable_delete
  BEFORE DELETE ON check_runs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_check_run_modification();

-- Indexes for common queries
CREATE INDEX idx_check_runs_org ON check_runs(org_id);
CREATE INDEX idx_check_runs_user ON check_runs(user_id);
CREATE INDEX idx_check_runs_vehicle ON check_runs(vehicle_id);
CREATE INDEX idx_check_runs_date ON check_runs(check_date DESC);
CREATE INDEX idx_check_runs_vehicle_date ON check_runs(vehicle_id, check_date DESC);
CREATE INDEX idx_check_runs_user_date ON check_runs(user_id, check_date DESC);
CREATE INDEX idx_check_runs_reg ON check_runs(vehicle_registration);

-- ============================================================================
-- DEFECTS
-- Extracted from check runs for workflow tracking
-- ============================================================================

CREATE TABLE defects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  check_run_id UUID NOT NULL REFERENCES check_runs(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,

  -- Denormalized from check run (for queries without joins)
  vehicle_registration VARCHAR(20) NOT NULL,
  reported_by_name VARCHAR(255) NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL,

  -- Defect details
  item_id VARCHAR(100) NOT NULL,
  item_label VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  severity defect_severity NOT NULL,

  -- Workflow
  status defect_status NOT NULL DEFAULT 'raised',

  -- Evidence
  photo_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  driver_notes TEXT,

  -- Assignment
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Resolution
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Notifications
  sms_sent BOOLEAN DEFAULT FALSE,
  sms_sent_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_defects_org ON defects(org_id);
CREATE INDEX idx_defects_vehicle ON defects(vehicle_id);
CREATE INDEX idx_defects_check_run ON defects(check_run_id);
CREATE INDEX idx_defects_status ON defects(status);
CREATE INDEX idx_defects_open ON defects(org_id, status) WHERE status != 'resolved';

-- ============================================================================
-- USER INVITES (separate table for tracking invite lifecycle)
-- ============================================================================

CREATE TABLE user_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,

  -- Invite details
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  roles TEXT[] NOT NULL DEFAULT ARRAY['driver'],

  -- Token for accepting invite
  token VARCHAR(255) NOT NULL UNIQUE,

  -- Status
  status invite_status NOT NULL DEFAULT 'pending',

  -- Tracking
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_invites_token ON user_invites(token);
CREATE INDEX idx_user_invites_email ON user_invites(email);
CREATE INDEX idx_user_invites_org ON user_invites(org_id);

-- ============================================================================
-- SMS LOG
-- ============================================================================

CREATE TABLE sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  defect_id UUID REFERENCES defects(id) ON DELETE SET NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  recipient_name VARCHAR(255),
  message TEXT NOT NULL,
  twilio_sid VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  error_message TEXT
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Update active vehicle count on org when vehicle status changes
CREATE OR REPLACE FUNCTION update_org_vehicle_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE organisations SET active_vehicle_count = active_vehicle_count + 1, updated_at = NOW()
    WHERE id = NEW.org_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
    UPDATE organisations SET active_vehicle_count = active_vehicle_count - 1, updated_at = NOW()
    WHERE id = OLD.org_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Status changed
    IF OLD.status = 'active' AND NEW.status != 'active' THEN
      UPDATE organisations SET active_vehicle_count = active_vehicle_count - 1, updated_at = NOW()
      WHERE id = NEW.org_id;
    ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
      UPDATE organisations SET active_vehicle_count = active_vehicle_count + 1, updated_at = NOW()
      WHERE id = NEW.org_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_vehicle_count
  AFTER INSERT OR UPDATE OR DELETE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_org_vehicle_count();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_organisations_updated
  BEFORE UPDATE ON organisations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_users_updated
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_vehicles_updated
  BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_defects_updated
  BEFORE UPDATE ON defects FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create defects from a check run
CREATE OR REPLACE FUNCTION extract_defects_from_check_run()
RETURNS TRIGGER AS $$
DECLARE
  result_item JSONB;
  template_categories JSONB;
  item_data JSONB;
  category_name TEXT;
BEGIN
  -- Get template categories
  SELECT categories INTO template_categories
  FROM check_templates WHERE id = NEW.template_id;

  -- Loop through results and create defects for failures
  FOR result_item IN SELECT * FROM jsonb_array_elements(NEW.results)
  LOOP
    IF result_item->>'status' = 'fail' THEN
      -- Find the item in template categories
      FOR category_name, item_data IN
        SELECT cat->>'name', item
        FROM jsonb_array_elements(template_categories) AS cat,
             jsonb_array_elements(cat->'items') AS item
        WHERE item->>'id' = result_item->>'item_id'
      LOOP
        INSERT INTO defects (
          check_run_id, org_id, vehicle_id,
          vehicle_registration, reported_by_name, reported_at,
          item_id, item_label, category, severity,
          photo_urls, driver_notes
        ) VALUES (
          NEW.id, NEW.org_id, NEW.vehicle_id,
          NEW.vehicle_registration, NEW.driver_name, NEW.completed_at,
          result_item->>'item_id',
          COALESCE(item_data->>'label', result_item->>'item_id'),
          category_name,
          COALESCE((item_data->>'severity')::defect_severity, 'major'),
          COALESCE(
            (SELECT array_agg(url) FROM jsonb_array_elements_text(result_item->'photo_urls') AS url),
            ARRAY[]::TEXT[]
          ),
          result_item->>'note'
        );
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_extract_defects
  AFTER INSERT ON check_runs
  FOR EACH ROW EXECUTE FUNCTION extract_defects_from_check_run();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's org_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM users WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if current user has role
CREATE OR REPLACE FUNCTION user_has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = auth.uid()
    AND required_role = ANY(roles)
    AND is_active = TRUE
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check templates: readable by all authenticated users
CREATE POLICY "Templates readable by all"
  ON check_templates FOR SELECT TO authenticated
  USING (is_active = true);

-- Organisations: users can only see their own org
CREATE POLICY "Users can view own org"
  ON organisations FOR SELECT TO authenticated
  USING (id = get_user_org_id());

CREATE POLICY "Managers can update own org"
  ON organisations FOR UPDATE TO authenticated
  USING (id = get_user_org_id() AND user_has_role('manager'));

-- Users: users can see users in their org
CREATE POLICY "Users can view org users"
  ON users FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY "Managers can insert users"
  ON users FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id() AND user_has_role('manager'));

CREATE POLICY "Managers can update org users"
  ON users FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id() AND user_has_role('manager'));

-- Vehicles: users can see vehicles in their org
CREATE POLICY "Users can view org vehicles"
  ON vehicles FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY "Managers can insert vehicles"
  ON vehicles FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id() AND user_has_role('manager'));

CREATE POLICY "Managers can update vehicles"
  ON vehicles FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id() AND user_has_role('manager'));

-- Check runs: users can see check runs in their org
CREATE POLICY "Users can view org check runs"
  ON check_runs FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY "Drivers can insert check runs"
  ON check_runs FOR INSERT TO authenticated
  WITH CHECK (
    org_id = get_user_org_id() AND
    user_has_role('driver') AND
    user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Defects: users can see defects in their org
CREATE POLICY "Users can view org defects"
  ON defects FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY "Managers can update defects"
  ON defects FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id() AND user_has_role('manager'));

-- User invites: managers can manage invites
CREATE POLICY "Managers can view org invites"
  ON user_invites FOR SELECT TO authenticated
  USING (org_id = get_user_org_id() AND user_has_role('manager'));

CREATE POLICY "Managers can insert invites"
  ON user_invites FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id() AND user_has_role('manager'));

CREATE POLICY "Managers can update invites"
  ON user_invites FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id() AND user_has_role('manager'));

-- SMS log: managers can view
CREATE POLICY "Managers can view sms log"
  ON sms_log FOR SELECT TO authenticated
  USING (org_id = get_user_org_id() AND user_has_role('manager'));
