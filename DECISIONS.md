# TipperCheck Implementation Decisions

## Assumptions Made

### 1. Authentication & Sessions

**Assumption:** Using Supabase Auth with default session management.

- **Refresh token lifetime:** Supabase default is 7 days, with automatic rotation on use
- **Session persistence:** Using `persistSession: true` (default) which stores the refresh token in localStorage
- **Driver sessions:** Will persist until explicit logout, deactivation, or token expiry

**Needs your input:**
- [ ] Should driver sessions be truly "indefinite" (extend on each use)?
- [ ] What's the maximum session age before requiring re-authentication? (7 days? 30 days? Never?)
- [ ] Should we implement a "remember me" toggle, or always persist?

### 2. Session Invalidation on Deactivation

**Current Implementation:**
- When a manager deactivates a user, the `is_active` flag is set to `false`
- On next app load, the user sees "Your account has been deactivated" and is logged out
- This does NOT immediately terminate active sessions

**Needs your input:**
- [ ] Is "logout on next load" acceptable, or do you need real-time session termination?
- [ ] If a driver is mid-check when deactivated, should:
  - (a) Let them finish and submit, then block future checks, OR
  - (b) Immediately prevent submission (may lose in-progress work)

**Recommendation:** Option (a) - complete current check, block future ones. Justification: mid-check deactivation is rare, and losing a partially-completed check is worse UX than letting one extra check through.

### 3. Check Run Immutability

**Implemented:**
- Database triggers prevent UPDATE or DELETE on `check_runs` table
- Any modification attempt raises an exception: "Check runs are immutable and cannot be modified or deleted"
- This is enforced at the database level, not just UI

**Assumption:** This is the correct behavior for DVSA defensibility.

### 4. Defect Extraction

**Implemented:**
- Defects are automatically extracted from check runs on INSERT via a database trigger
- Defects are separate records that CAN be updated (for workflow: assign, resolve)
- The original check run result remains immutable

### 5. Owner-Operator Default View

**Implemented:**
- Users with both `manager` and `driver` roles default to the driver view
- A "Switch to Dashboard" button appears in the driver app header for dual-role users
- Rationale: owner-operators' primary daily task is checking vehicles, not admin

**Needs your input:**
- [ ] Is this the correct default? Or should owner-operators see a combined view?

### 6. Invite Flow

**Implemented:**
- Managers create users with `invite_token` and `invite_sent_at`
- Token is a UUID, valid for 7 days (configurable in DB)
- **NOT YET IMPLEMENTED:** Actual email sending (requires Supabase Edge Function or external service)

**Needs your input:**
- [ ] Which email service? Options:
  - (a) Supabase Edge Function + Resend/SendGrid
  - (b) External service triggered by database webhook
- [ ] Should the invite link go to a custom page, or use Supabase Auth's built-in flow?

### 7. Password Reset by Manager

**Implemented:**
- Manager can trigger a password reset email for any user in their org
- Uses Supabase's `resetPasswordForEmail()` method
- Manager never sees or sets the password directly

**Assumption:** This is the correct approach for driver password recovery.

---

## Database Schema Decisions

### Enum Types vs TEXT Arrays

**Decision:** Used PostgreSQL enum types for fixed values (vehicle_status, vehicle_type, etc.) but TEXT arrays for user roles.

**Rationale:** Roles are combinable (`['manager', 'driver']`), while vehicle status is always a single value.

### Denormalization in check_runs

**Decision:** Extensive denormalization of driver/vehicle/template data at check submission time.

**Fields captured:**
- `driver_name`, `driver_email`
- `vehicle_registration`, `vehicle_type`
- `template_name`, `template_version`

**Rationale:** Protects audit trail from:
- User name changes
- User deletion (they can be deactivated but data remains)
- Vehicle registration changes (rare but possible)
- Template updates

### Vehicle Status vs Billing

**Implemented:**
- Only `active` vehicles are counted for billing (`active_vehicle_count` on org)
- `vor` (off road) and `retired` vehicles remain in DB but don't count
- Trigger automatically updates count on vehicle status change

---

## Files Created/Modified

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/003_auth_org_model.sql` | Full schema with Org/User/Vehicle/CheckRun model |
| `supabase/migrations/004_seed_test_data.sql` | Seed data for 2 test organisations |
| `src/types/index.ts` | Updated TypeScript types |
| `src/components/onboarding/Onboarding.tsx` | Manager/owner-operator signup flow |
| `src/components/manager/Dashboard.tsx` | Manager dashboard with tabs |
| `src/components/manager/VehicleModal.tsx` | Add/edit vehicle modal |
| `src/components/manager/UserModal.tsx` | Add/edit/invite user modal |
| `src/App.tsx` | Updated with role-based routing |

### Database Tables

| Table | Purpose |
|-------|---------|
| `organisations` | Top-level tenant |
| `users` | People with combinable roles |
| `vehicles` | Fleet vehicles with status |
| `check_runs` | Immutable audit records |
| `defects` | Extracted from checks for workflow |
| `check_templates` | Versioned checklists |
| `user_invites` | Invite tracking |
| `sms_log` | SMS notification log |

---

## Still To Do

### Phase 1 (Required for MVP)

1. **Run migrations on Supabase**
   - Execute `003_auth_org_model.sql` (schema)
   - Execute `002_seed_check_templates.sql` (templates - may need updating for new enums)
   - Execute `004_seed_test_data.sql` (optional, for testing)

2. **Create storage bucket**
   - Name: `check-photos`
   - Enable public access for uploaded files

3. **Test the flow**
   - Sign up as new user
   - Go through onboarding
   - Add vehicle
   - Complete a check

### Phase 2 (Post-MVP)

1. **Email sending for invites**
2. **Stripe billing integration**
3. **SMS alerts for critical defects**
4. **PDF generation for check reports**
5. **2FA for managers**

---

## Questions for You

1. **Refresh token rotation strategy:**
   - Current: Supabase default (7 day tokens, rotated on refresh)
   - Options: (a) Keep default, (b) Extend to 30 days, (c) Custom rotation logic

2. **Real-time deactivation:**
   - Current: User is blocked on next app load
   - Options: (a) Keep current, (b) Implement real-time via Supabase Realtime subscription

3. **Invite email service:**
   - Options: (a) Supabase Edge Functions + Resend, (b) External webhook, (c) Manual for now (show link to manager)

4. **Owner-operator default view:**
   - Current: Driver view
   - Options: (a) Keep as driver, (b) Show combined dashboard
