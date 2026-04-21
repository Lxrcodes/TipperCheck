-- ============================================================================
-- Fix RLS infinite recursion
-- Migration: 006_fix_rls_recursion
--
-- Problem: Policies on `users` table reference `users` table = infinite loop
-- Solution: Use SECURITY DEFINER functions that bypass RLS
-- ============================================================================

-- ============================================================================
-- DROP all existing policies to start fresh
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can create organisations" ON organisations;
DROP POLICY IF EXISTS "Users can view own org" ON organisations;
DROP POLICY IF EXISTS "Managers can update own org" ON organisations;

DROP POLICY IF EXISTS "Users can create own user record" ON users;
DROP POLICY IF EXISTS "Users can view org users" ON users;
DROP POLICY IF EXISTS "Managers can insert org users" ON users;
DROP POLICY IF EXISTS "Managers can update org users" ON users;

DROP POLICY IF EXISTS "Users can view org vehicles" ON vehicles;
DROP POLICY IF EXISTS "Managers can insert vehicles" ON vehicles;
DROP POLICY IF EXISTS "Managers can update vehicles" ON vehicles;

DROP POLICY IF EXISTS "Users can view org check runs" ON check_runs;
DROP POLICY IF EXISTS "Drivers can insert check runs" ON check_runs;

DROP POLICY IF EXISTS "Users can view org defects" ON defects;
DROP POLICY IF EXISTS "Managers can update defects" ON defects;

DROP POLICY IF EXISTS "Managers can view org invites" ON user_invites;
DROP POLICY IF EXISTS "Managers can insert invites" ON user_invites;
DROP POLICY IF EXISTS "Managers can update invites" ON user_invites;

DROP POLICY IF EXISTS "Managers can view sms log" ON sms_log;

DROP POLICY IF EXISTS "Templates readable by all" ON check_templates;

-- ============================================================================
-- SECURITY DEFINER functions (bypass RLS to avoid recursion)
-- ============================================================================

-- Get current user's org_id (returns NULL if no user record yet)
CREATE OR REPLACE FUNCTION auth_user_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- Get current user's id (the users table id, not auth.uid())
CREATE OR REPLACE FUNCTION auth_user_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- Check if current user has a specific role
CREATE OR REPLACE FUNCTION auth_user_has_role(required_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = auth.uid()
    AND required_role = ANY(roles)
    AND is_active = TRUE
  )
$$;

-- ============================================================================
-- CHECK_TEMPLATES policies
-- ============================================================================

CREATE POLICY "Templates readable by all authenticated"
  ON check_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ============================================================================
-- ORGANISATIONS policies
-- ============================================================================

-- Any authenticated user can create an org (for new signups)
CREATE POLICY "Anyone can create org"
  ON organisations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can view their own org
CREATE POLICY "View own org"
  ON organisations FOR SELECT
  TO authenticated
  USING (id = auth_user_org_id());

-- Managers can update their org
CREATE POLICY "Managers update org"
  ON organisations FOR UPDATE
  TO authenticated
  USING (id = auth_user_org_id() AND auth_user_has_role('manager'));

-- ============================================================================
-- USERS policies
-- ============================================================================

-- Anyone can create their OWN user record (onboarding)
CREATE POLICY "Create own user record"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- Users can view themselves (always, even during onboarding)
CREATE POLICY "View own user record"
  ON users FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Users can view others in their org (after onboarding)
CREATE POLICY "View org users"
  ON users FOR SELECT
  TO authenticated
  USING (org_id = auth_user_org_id());

-- Managers can insert users for invites (not their own record)
CREATE POLICY "Managers insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    auth_user_id = auth.uid()  -- Own record
    OR (org_id = auth_user_org_id() AND auth_user_has_role('manager'))  -- Manager inviting
  );

-- Managers can update users in their org
CREATE POLICY "Managers update users"
  ON users FOR UPDATE
  TO authenticated
  USING (org_id = auth_user_org_id() AND auth_user_has_role('manager'));

-- ============================================================================
-- VEHICLES policies
-- ============================================================================

CREATE POLICY "View org vehicles"
  ON vehicles FOR SELECT
  TO authenticated
  USING (org_id = auth_user_org_id());

CREATE POLICY "Managers insert vehicles"
  ON vehicles FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth_user_org_id() AND auth_user_has_role('manager'));

CREATE POLICY "Managers update vehicles"
  ON vehicles FOR UPDATE
  TO authenticated
  USING (org_id = auth_user_org_id() AND auth_user_has_role('manager'));

-- ============================================================================
-- CHECK_RUNS policies
-- ============================================================================

CREATE POLICY "View org check runs"
  ON check_runs FOR SELECT
  TO authenticated
  USING (org_id = auth_user_org_id());

CREATE POLICY "Drivers insert check runs"
  ON check_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = auth_user_org_id()
    AND auth_user_has_role('driver')
    AND user_id = auth_user_id()
  );

-- ============================================================================
-- DEFECTS policies
-- ============================================================================

CREATE POLICY "View org defects"
  ON defects FOR SELECT
  TO authenticated
  USING (org_id = auth_user_org_id());

CREATE POLICY "Managers update defects"
  ON defects FOR UPDATE
  TO authenticated
  USING (org_id = auth_user_org_id() AND auth_user_has_role('manager'));

-- ============================================================================
-- USER_INVITES policies
-- ============================================================================

CREATE POLICY "Managers view invites"
  ON user_invites FOR SELECT
  TO authenticated
  USING (org_id = auth_user_org_id() AND auth_user_has_role('manager'));

CREATE POLICY "Managers insert invites"
  ON user_invites FOR INSERT
  TO authenticated
  WITH CHECK (org_id = auth_user_org_id() AND auth_user_has_role('manager'));

CREATE POLICY "Managers update invites"
  ON user_invites FOR UPDATE
  TO authenticated
  USING (org_id = auth_user_org_id() AND auth_user_has_role('manager'));

-- ============================================================================
-- SMS_LOG policies
-- ============================================================================

CREATE POLICY "Managers view sms log"
  ON sms_log FOR SELECT
  TO authenticated
  USING (org_id = auth_user_org_id() AND auth_user_has_role('manager'));
