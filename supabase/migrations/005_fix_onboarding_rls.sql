-- ============================================================================
-- Fix RLS policies for onboarding
-- Migration: 005_fix_onboarding_rls
--
-- Problem: New users can't create their org because RLS policies require
-- an existing user record (chicken-and-egg problem)
--
-- Solution: Add INSERT policies and fix SELECT policies for onboarding flow
-- ============================================================================

-- ============================================================================
-- DROP existing restrictive policies that block onboarding
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own org" ON organisations;
DROP POLICY IF EXISTS "Managers can update own org" ON organisations;
DROP POLICY IF EXISTS "Users can view org users" ON users;
DROP POLICY IF EXISTS "Managers can insert users" ON users;
DROP POLICY IF EXISTS "Managers can update org users" ON users;
DROP POLICY IF EXISTS "Users can view org vehicles" ON vehicles;
DROP POLICY IF EXISTS "Managers can insert vehicles" ON vehicles;
DROP POLICY IF EXISTS "Managers can update vehicles" ON vehicles;

-- ============================================================================
-- ORGANISATIONS policies
-- ============================================================================

-- Any authenticated user can create an org (for new signups)
CREATE POLICY "Authenticated users can create organisations"
  ON organisations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can view orgs they belong to
CREATE POLICY "Users can view own org"
  ON organisations FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );

-- Managers can update their org
CREATE POLICY "Managers can update own org"
  ON organisations FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid()
      AND 'manager' = ANY(roles)
    )
  );

-- ============================================================================
-- USERS policies
-- ============================================================================

-- Users can create their own user record (onboarding)
CREATE POLICY "Users can create own user record"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- Users can view all users in their org
CREATE POLICY "Users can view org users"
  ON users FOR SELECT
  TO authenticated
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
    OR auth_user_id = auth.uid()  -- Can always see own record
  );

-- Managers can insert other users in their org (invites)
CREATE POLICY "Managers can insert org users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Either creating own record OR manager creating for their org
    auth_user_id = auth.uid()
    OR (
      org_id IN (
        SELECT org_id FROM users
        WHERE auth_user_id = auth.uid()
        AND 'manager' = ANY(roles)
      )
    )
  );

-- Managers can update users in their org
CREATE POLICY "Managers can update org users"
  ON users FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid()
      AND 'manager' = ANY(roles)
    )
  );

-- ============================================================================
-- VEHICLES policies
-- ============================================================================

-- Users can view vehicles in their org
CREATE POLICY "Users can view org vehicles"
  ON vehicles FOR SELECT
  TO authenticated
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );

-- Managers can insert vehicles (including during onboarding)
CREATE POLICY "Managers can insert vehicles"
  ON vehicles FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid()
      AND 'manager' = ANY(roles)
    )
  );

-- Managers can update vehicles
CREATE POLICY "Managers can update vehicles"
  ON vehicles FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid()
      AND 'manager' = ANY(roles)
    )
  );

-- ============================================================================
-- CHECK_RUNS policies (fix for drivers)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view org check runs" ON check_runs;
DROP POLICY IF EXISTS "Drivers can insert check runs" ON check_runs;

-- Users can view check runs in their org
CREATE POLICY "Users can view org check runs"
  ON check_runs FOR SELECT
  TO authenticated
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );

-- Drivers can insert check runs
CREATE POLICY "Drivers can insert check runs"
  ON check_runs FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid()
      AND 'driver' = ANY(roles)
    )
    AND user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- DEFECTS policies (fix)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view org defects" ON defects;
DROP POLICY IF EXISTS "Managers can update defects" ON defects;

CREATE POLICY "Users can view org defects"
  ON defects FOR SELECT
  TO authenticated
  USING (
    org_id IN (SELECT org_id FROM users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Managers can update defects"
  ON defects FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid()
      AND 'manager' = ANY(roles)
    )
  );

-- ============================================================================
-- USER_INVITES policies (fix)
-- ============================================================================

DROP POLICY IF EXISTS "Managers can view org invites" ON user_invites;
DROP POLICY IF EXISTS "Managers can insert invites" ON user_invites;
DROP POLICY IF EXISTS "Managers can update invites" ON user_invites;

CREATE POLICY "Managers can view org invites"
  ON user_invites FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid()
      AND 'manager' = ANY(roles)
    )
  );

CREATE POLICY "Managers can insert invites"
  ON user_invites FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid()
      AND 'manager' = ANY(roles)
    )
  );

CREATE POLICY "Managers can update invites"
  ON user_invites FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid()
      AND 'manager' = ANY(roles)
    )
  );

-- ============================================================================
-- SMS_LOG policies (fix)
-- ============================================================================

DROP POLICY IF EXISTS "Managers can view sms log" ON sms_log;

CREATE POLICY "Managers can view sms log"
  ON sms_log FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_user_id = auth.uid()
      AND 'manager' = ANY(roles)
    )
  );
