// ============================================================================
// TipperCheck Type Definitions
// v2: Organisation → User → Vehicle → CheckRun model
// ============================================================================

// ----------------------------------------------------------------------------
// Enums
// ----------------------------------------------------------------------------

export type UserRole = 'manager' | 'driver';

export type VehicleStatus = 'active' | 'vor' | 'retired';

export type VehicleType = 'tipper' | 'rigid_hgv' | 'artic' | 'trailer' | 'van' | 'grab_loader' | 'other';

export type CheckResult = 'pass' | 'fail' | 'na';

export type CheckStatus = 'pass' | 'defects' | 'do_not_drive';

export type DefectSeverity = 'critical' | 'major' | 'minor';

export type DefectStatus = 'raised' | 'acknowledged' | 'assigned' | 'resolved';

export type SubscriptionStatus = 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete';

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export type SyncStatus = 'synced' | 'pending' | 'failed';

// ----------------------------------------------------------------------------
// Database Entities
// ----------------------------------------------------------------------------

/**
 * Organisation - the paying customer. Top-level tenant.
 * All other records scope to an org.
 */
export interface Organisation {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  o_licence_number: string | null;
  stripe_customer_id: string | null;
  subscription_id: string | null;
  subscription_status: SubscriptionStatus | null;
  active_vehicle_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * User - a single person. Belongs to exactly one org.
 * Has roles as a SET - can be manager, driver, or BOTH.
 */
export interface User {
  id: string;
  auth_user_id: string | null;
  org_id: string;
  email: string;
  name: string;
  phone: string | null;
  roles: UserRole[];
  is_billing_admin: boolean;
  totp_enabled: boolean;
  is_active: boolean;
  deactivated_at: string | null;
  invite_token: string | null;
  invite_sent_at: string | null;
  invite_accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Vehicle - belongs to org, not to any user.
 * Any driver in the org can select any active vehicle.
 */
export interface Vehicle {
  id: string;
  org_id: string;
  registration: string;
  vehicle_type: VehicleType;
  make: string | null;
  model: string | null;
  vin: string | null;
  registration_keeper: string | null;
  o_licence_number: string | null;
  mot_due_date: string | null;
  last_pmi_date: string | null;
  next_pmi_due_date: string | null;
  status: VehicleStatus;
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * CheckRun - immutable audit record.
 * Join between driver, vehicle, and template at a point in time.
 */
export interface CheckRun {
  id: string;
  client_id: string | null;
  org_id: string;
  user_id: string;
  vehicle_id: string;
  template_id: string;
  // Denormalized fields (captured at submission time - IMMUTABLE)
  driver_name: string;
  driver_email: string;
  vehicle_registration: string;
  vehicle_type: VehicleType;
  template_name: string;
  template_version: number;
  // Check details
  check_date: string;
  started_at: string;
  completed_at: string;
  // Location
  gps_start: GpsCoordinates | null;
  gps_end: GpsCoordinates | null;
  location_address: string | null;
  // Results
  results: CheckItemResult[];
  overall_status: CheckStatus;
  // Attachments
  signature_url: string | null;
  pdf_url: string | null;
  // Sync tracking
  offline_created_at: string | null;
  synced_at: string | null;
  created_at: string;
}

/**
 * Defect - extracted from check runs for workflow tracking.
 */
export interface Defect {
  id: string;
  check_run_id: string;
  org_id: string;
  vehicle_id: string;
  // Denormalized
  vehicle_registration: string;
  reported_by_name: string;
  reported_at: string;
  // Details
  item_id: string;
  item_label: string;
  category: string;
  severity: DefectSeverity;
  status: DefectStatus;
  photo_urls: string[];
  driver_notes: string | null;
  // Assignment
  assigned_to: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  // Resolution
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  // Notifications
  sms_sent: boolean;
  sms_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * UserInvite - tracks invite lifecycle.
 */
export interface UserInvite {
  id: string;
  org_id: string;
  email: string;
  name: string;
  roles: UserRole[];
  token: string;
  status: InviteStatus;
  invited_by: string;
  sent_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_user_id: string | null;
  created_at: string;
}

/**
 * CheckTemplate - versioned checklist templates.
 */
export interface CheckTemplate {
  id: string;
  code: string;
  name: string;
  version: number;
  vehicle_types: VehicleType[];
  categories: CheckCategory[];
  is_active: boolean;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Check Template Structure
// ----------------------------------------------------------------------------

export interface CheckCategory {
  name: string;
  items: CheckItem[];
}

export interface CheckItem {
  id: string;
  label: string;
  severity: DefectSeverity;
  photo_required: boolean;
  help_text?: string;
}

export interface CheckItemResult {
  item_id: string;
  status: CheckResult;
  note: string | null;
  photo_urls: string[];
}

export interface GpsCoordinates {
  lat: number;
  lng: number;
  address?: string;
}

// ----------------------------------------------------------------------------
// Auth & Session
// ----------------------------------------------------------------------------

/**
 * AuthUser - the current authenticated user with their roles.
 */
export interface AuthUser {
  id: string;
  auth_user_id: string;
  org_id: string;
  email: string;
  name: string;
  roles: UserRole[];
  is_billing_admin: boolean;
  is_active: boolean;
}

/**
 * Check if user has a specific role.
 */
export function hasRole(user: AuthUser | null, role: UserRole): boolean {
  return user?.roles?.includes(role) ?? false;
}

/**
 * Check if user is a manager.
 */
export function isManager(user: AuthUser | null): boolean {
  return hasRole(user, 'manager');
}

/**
 * Check if user is a driver.
 */
export function isDriver(user: AuthUser | null): boolean {
  return hasRole(user, 'driver');
}

/**
 * Check if user has both roles (owner-operator).
 */
export function isOwnerOperator(user: AuthUser | null): boolean {
  return isManager(user) && isDriver(user);
}

// ----------------------------------------------------------------------------
// Onboarding
// ----------------------------------------------------------------------------

export type OnboardingType = 'fleet' | 'owner_operator';

export interface OnboardingState {
  type: OnboardingType | null;
  step: number;
  orgName: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  firstVehicle: Partial<Vehicle> | null;
}

// ----------------------------------------------------------------------------
// Offline Storage
// ----------------------------------------------------------------------------

export interface PendingCheckRun {
  id: string;
  client_id: string;
  org_id: string;
  user_id: string;
  vehicle_id: string;
  template_id: string;
  // Denormalized
  driver_name: string;
  driver_email: string;
  vehicle_registration: string;
  vehicle_type: VehicleType;
  template_name: string;
  template_version: number;
  // Check details
  check_date: string;
  started_at: string;
  completed_at: string;
  gps_start: GpsCoordinates | null;
  gps_end: GpsCoordinates | null;
  results: CheckItemResult[];
  overall_status: CheckStatus;
  signature_data_url: string;
  reg_photo_data_url: string | null;
  pending_photos: PendingPhoto[];
  // Sync tracking
  created_at: string;
  sync_attempts: number;
  last_sync_error: string | null;
}

// Backwards compatibility alias
export type PendingCheck = PendingCheckRun;

export interface PendingPhoto {
  id: string;
  item_id: string;
  data_url: string;
  uploaded: boolean;
  url: string | null;
}

export interface CachedTemplate {
  template: CheckTemplate;
  cached_at: string;
}

export interface CachedVehicle {
  vehicle: Vehicle;
  cached_at: string;
}

// ----------------------------------------------------------------------------
// UI State
// ----------------------------------------------------------------------------

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface OfflineState {
  isOffline: boolean;
  wasOffline: boolean;
  pendingCount: number;
}

// ----------------------------------------------------------------------------
// API Responses
// ----------------------------------------------------------------------------

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface SyncResult {
  success: boolean;
  synced_count: number;
  failed_count: number;
  errors: string[];
}

// ----------------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------------

export const getCheckStatusColor = (status: CheckStatus): string => {
  switch (status) {
    case 'pass':
      return 'bg-green-500';
    case 'defects':
      return 'bg-amber-500';
    case 'do_not_drive':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
};

export const getCheckStatusLabel = (status: CheckStatus): string => {
  switch (status) {
    case 'pass':
      return 'Pass';
    case 'defects':
      return 'Defects Found';
    case 'do_not_drive':
      return 'Do Not Drive';
    default:
      return 'Unknown';
  }
};

export const getVehicleStatusColor = (status: VehicleStatus): string => {
  switch (status) {
    case 'active':
      return 'bg-green-500 text-white';
    case 'vor':
      return 'bg-amber-500 text-white';
    case 'retired':
      return 'bg-slate-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
};

export const getVehicleStatusLabel = (status: VehicleStatus): string => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'vor':
      return 'VOR';
    case 'retired':
      return 'Retired';
    default:
      return 'Unknown';
  }
};

export const getSeverityColor = (severity: DefectSeverity): string => {
  switch (severity) {
    case 'critical':
      return 'bg-red-500 text-white';
    case 'major':
      return 'bg-amber-500 text-white';
    case 'minor':
      return 'bg-blue-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
};

export const getSeverityLabel = (severity: DefectSeverity): string => {
  switch (severity) {
    case 'critical':
      return 'Critical - Do Not Drive';
    case 'major':
      return 'Major - Report Required';
    case 'minor':
      return 'Minor - Monitor';
    default:
      return 'Unknown';
  }
};

export const getDefectStatusLabel = (status: DefectStatus): string => {
  switch (status) {
    case 'raised':
      return 'Raised';
    case 'acknowledged':
      return 'Acknowledged';
    case 'assigned':
      return 'Assigned';
    case 'resolved':
      return 'Resolved';
    default:
      return 'Unknown';
  }
};

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'tipper', label: 'Tipper' },
  { value: 'rigid_hgv', label: 'Rigid HGV' },
  { value: 'artic', label: 'Articulated' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'van', label: 'Van' },
  { value: 'grab_loader', label: 'Grab Loader' },
  { value: 'other', label: 'Other' },
];

export const VEHICLE_STATUSES: { value: VehicleStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'vor', label: 'VOR (Off Road)' },
  { value: 'retired', label: 'Retired' },
];
