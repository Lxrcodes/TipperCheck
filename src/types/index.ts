// ============================================================================
// CheckaTruck Type Definitions
// v2: Organisation → User → Vehicle → CheckRun model
// ============================================================================

// ----------------------------------------------------------------------------
// Enums
// ----------------------------------------------------------------------------

export type UserRole = 'manager' | 'driver';

export type VehicleStatus = 'active' | 'vor' | 'retired';

export type VehicleType = 'tipper' | 'rigid_hgv' | 'artic' | 'trailer' | 'van' | 'grab_loader' | 'other';

export type CheckResult = 'pass' | 'fail' | 'na';

export type FuelLevel = 'empty' | 'quarter' | 'half' | 'three_quarter' | 'full';

export type CheckInputType = 'pass_fail' | 'pass_fail_na' | 'fuel_level' | 'yes_no';

export type CheckStatus = 'pass' | 'defects' | 'do_not_drive';

export type DefectSeverity = 'critical' | 'major' | 'minor';

export type DefectStatus = 'raised' | 'acknowledged' | 'assigned' | 'resolved';

export type SubscriptionStatus = 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete';

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export type MotResult = 'pass' | 'fail';

export type PmiResult = 'pass' | 'fail';

export type SyncStatus = 'synced' | 'pending' | 'failed';

export type JobStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

export type LoadStatus = 'pending' | 'collecting' | 'collected' | 'delivering' | 'completed';

export type MaterialDirection = 'import' | 'export' | 'both';

export type JobDirection = 'import' | 'export';

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
  address: string | null;
  company_number: string | null;
  vat_number: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_sort_code: string | null;
  stripe_customer_id: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarded: boolean;
  subscription_id: string | null;
  subscription_status: SubscriptionStatus | null;
  subscription_tier: number;
  stripe_price_id: string | null;
  billing_interval: 'month' | 'year';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  active_vehicle_count: number;
  next_job_seq: number;
  is_demo: boolean;
  onboarding_step: string | null;
  trial_started_at: string | null;
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
  pmi_interval_weeks: number;
  requires_recheck: boolean;
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
  // Notes
  defect_repair_notes: string | null;
  head_office_notes: string | null;
  // Confirmations
  vehicle_fit_confirmed: boolean;
  driver_fit_confirmed: boolean;
  // Attachments
  signature_url: string | null;
  reg_photo_url?: string | null;
  pdf_url: string | null;
  // Sync tracking
  offline_created_at: string | null;
  synced_at: string | null;
  created_at: string;
}

/**
 * PmiRecord - immutable log of a PMI inspection on a vehicle.
 */
export interface PmiRecord {
  id: string;
  org_id: string;
  vehicle_id: string;
  vehicle_registration: string;
  pmi_date: string;
  next_due_date: string;
  interval_weeks: number;
  result: PmiResult;
  advisory_notes: string | null;
  recorded_by: string | null;
  recorded_by_name: string;
  created_at: string;
}

/**
 * MotRecord - immutable log of an MOT test on a vehicle.
 */
export interface MotRecord {
  id: string;
  org_id: string;
  vehicle_id: string;
  vehicle_registration: string;
  mot_date: string;
  expiry_date: string;
  result: MotResult;
  advisory_notes: string | null;
  recorded_by: string | null;
  recorded_by_name: string;
  created_at: string;
}

/**
 * MaterialType - platform-level reference data for material categories.
 */
export interface MaterialType {
  id: string;
  name: string;
  code: string;           // 3-letter e.g. SHS
  direction: MaterialDirection;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/**
 * Job - a haulage job. Tier 2+ feature.
 * reference (JOB-0001) and job_code (AAA) are generated by DB trigger on INSERT.
 */
export interface Job {
  id: string;
  org_id: string;
  created_by: string;
  reference: string;            // JOB-0001
  job_code: string;             // AAA — used in invoice refs
  title: string;
  description: string | null;
  status: JobStatus;
  material_type_id: string | null;
  direction: JobDirection | null;
  collection_address: string | null;
  collection_lat: number | null;
  collection_lng: number | null;
  disposal_address: string | null;
  disposal_lat: number | null;
  disposal_lng: number | null;
  total_loads: number;
  rate_per_load: number | null;
  start_date: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * JobOrder - one material/direction/rate order within a job.
 * A job can have many orders with different materials.
 */
export interface JobOrder {
  id: string;
  job_id: string;
  org_id: string;
  created_by: string | null;
  material_type_id: string | null;
  direction: JobDirection | null;
  total_loads: number;
  rate_per_load: number | null;
  status: JobStatus;
  order_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * JobAssignment - one vehicle+driver assigned to a job order.
 */
export interface JobAssignment {
  id: string;
  job_id: string;
  job_order_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  loads_assigned: number;
  loads_completed: number;
  created_at: string;
}

/**
 * Load - one individual load within a job assignment.
 */
export interface Load {
  id: string;
  job_id: string;
  assignment_id: string;
  org_id: string;
  load_number: number;
  status: LoadStatus;
  collection_signed_by: string | null;
  collection_signature: string | null;
  collection_lat: number | null;
  collection_lng: number | null;
  collected_at: string | null;
  disposal_signed_by: string | null;
  disposal_signature: string | null;
  disposal_lat: number | null;
  disposal_lng: number | null;
  disposed_at: string | null;
  wtn_reference: string | null;
  wtn_generated_at: string | null;
  created_at: string;
}

/**
 * Invoice - a billing document. Tier 3+ feature.
 * number (INV-0001) is generated by DB trigger on INSERT.
 */
export interface Invoice {
  id: string;
  org_id: string;
  created_by: string;
  job_id: string | null;
  material_type_id: string | null;
  number: string;           // INV-0001 or AAA-INS-0001
  client_name: string;
  client_address: string | null;
  client_email: string | null;
  issue_date: string;
  due_date: string | null;
  vat_enabled: boolean;
  total_net: number;
  total_vat: number;
  total_gross: number;
  notes: string | null;
  status: InvoiceStatus;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  stripe_checkout_session_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * InvoiceItem - a line item on an invoice.
 */
export interface InvoiceItem {
  id: string;
  invoice_id: string;
  sort_order: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  created_at: string;
}

/**
 * JobStatusHistory - immutable record of each status change on a job.
 */
export interface JobStatusHistory {
  id: string;
  job_id: string;
  status: JobStatus;
  note: string | null;
  changed_by: string;
  changed_at: string;
}

/**
 * Defect - extracted from check runs or MOT tests for workflow tracking.
 */
export interface Defect {
  id: string;
  check_run_id: string | null;
  mot_record_id: string | null;
  pmi_record_id: string | null;
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
  description?: string;
  input_type: CheckInputType;
  is_critical: boolean;
  photo_required: boolean;
  help_text?: string;
  // Legacy field for backwards compatibility
  severity?: DefectSeverity;
}

export interface CheckItemResult {
  item_id: string;
  status: CheckResult;
  fuel_level?: FuelLevel;
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

/**
 * Check if an org can access a given feature tier.
 * Demo orgs bypass all tier checks.
 */
export function canAccessTier(org: Organisation | null, requiredTier: number): boolean {
  if (!org) return false;
  if (org.is_demo) return true;
  return (org.subscription_tier ?? 1) >= requiredTier;
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
  defect_repair_notes: string | null;
  head_office_notes: string | null;
  vehicle_fit_confirmed: boolean;
  driver_fit_confirmed: boolean;
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

export const FUEL_LEVELS: { value: FuelLevel; label: string }[] = [
  { value: 'empty', label: 'Empty' },
  { value: 'quarter', label: '¼' },
  { value: 'half', label: '½' },
  { value: 'three_quarter', label: '¾' },
  { value: 'full', label: 'Full' },
];

// ----------------------------------------------------------------------------
// Default Check Template
// ----------------------------------------------------------------------------

export const DEFAULT_CHECK_TEMPLATE: Omit<CheckTemplate, 'id' | 'created_at'> = {
  code: 'hgv_daily_v1',
  name: 'HGV Daily Walk-Around Check',
  version: 1,
  vehicle_types: ['tipper', 'rigid_hgv', 'artic', 'grab_loader', 'van', 'other'],
  is_active: true,
  categories: [
    {
      name: 'Fluid Levels',
      items: [
        { id: 'fuel_level', label: 'Fuel Level', input_type: 'fuel_level', is_critical: false, photo_required: false },
        { id: 'adblue_level', label: 'Ad-Blue Level', input_type: 'fuel_level', is_critical: false, photo_required: false },
        { id: 'oil_coolant', label: 'Oil/Coolant Level', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'screenwash', label: 'Screenwash Level', input_type: 'pass_fail', is_critical: false, photo_required: false },
      ],
    },
    {
      name: 'Tachograph',
      items: [
        { id: 'tacho_time_calibration', label: 'Tachograph Time and Calibration', input_type: 'pass_fail_na', is_critical: false, photo_required: false },
        { id: 'tacho_print_roll', label: 'Tachograph Spare Print Roll', input_type: 'pass_fail_na', is_critical: false, photo_required: false },
        { id: 'tacho_plaque', label: 'Tachograph Plaque', input_type: 'pass_fail_na', is_critical: false, photo_required: false },
        { id: 'driver_digi_card', label: 'Driver Digi Card', input_type: 'pass_fail_na', is_critical: false, photo_required: false },
      ],
    },
    {
      name: 'Cab & Controls',
      items: [
        { id: 'easysheet', label: 'Easysheet Operational', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'windscreen', label: 'Windscreen/Glazing', input_type: 'pass_fail', is_critical: true, photo_required: true },
        { id: 'mirrors', label: 'Mirrors', input_type: 'pass_fail', is_critical: true, photo_required: true },
        { id: 'mirrors_class_iv_v_vi', label: 'Class IV, V and VI Mirrors', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'cab_controls', label: 'Cab Controls (Inc. Height Indicator)', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'washers', label: 'Washers', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'wipers', label: 'Wipers', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'warning_signage', label: 'Prominent Warning Signage', input_type: 'yes_no', is_critical: false, photo_required: false },
        { id: 'camera_monitor', label: 'Camera and Monitor System', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'no_smoking_sign', label: 'No Smoking Sign', input_type: 'pass_fail_na', is_critical: false, photo_required: false },
        { id: 'seats_belts', label: 'Seats and Belts', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'horn', label: 'Horn', input_type: 'pass_fail', is_critical: false, photo_required: false },
      ],
    },
    {
      name: 'Lights & Signals',
      items: [
        { id: 'indicators', label: 'Indicators', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'lights', label: 'Lights', input_type: 'pass_fail', is_critical: true, photo_required: true },
        { id: 'brake_lights', label: 'Brake Lights', input_type: 'pass_fail', is_critical: true, photo_required: true },
        { id: 'reversing_alarm', label: 'Reversing Alarm', input_type: 'pass_fail', is_critical: false, photo_required: false },
      ],
    },
    {
      name: 'Mechanical',
      items: [
        { id: 'steering', label: 'Steering', input_type: 'pass_fail', is_critical: true, photo_required: true },
        { id: 'engine_smoke', label: 'Engine Smoke Excessive', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'fuel_oil_leaks', label: 'Fuel/Oil Leaks', input_type: 'pass_fail', is_critical: true, photo_required: true },
        { id: 'tyres_wheels', label: 'Tyres (Condition, Pressure, Wear, Age) and Wheel Fixing', input_type: 'pass_fail', is_critical: true, photo_required: true },
        { id: 'brakes', label: 'Brakes and Brake Lights', input_type: 'pass_fail', is_critical: true, photo_required: true },
        { id: 'battery_secure', label: 'Battery Secure', input_type: 'pass_fail', is_critical: false, photo_required: false },
      ],
    },
    {
      name: 'Exterior',
      items: [
        { id: 'mudwings_spray', label: 'Mudwings and Spray Suppressions', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'side_underrun', label: 'Side Under Run Protection', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'proximity_sensors', label: 'Close Proximity Sensors', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'clean_damage', label: 'Internal/External Clean and Damage Check', input_type: 'pass_fail', is_critical: false, photo_required: false },
        { id: 'number_plates', label: 'Number Plates', input_type: 'pass_fail', is_critical: false, photo_required: false },
      ],
    },
    {
      name: 'Load Security',
      items: [
        { id: 'load_security', label: 'Load Security and Secure Load (Doors Locked and all security in place)', input_type: 'pass_fail_na', is_critical: false, photo_required: false },
        { id: 'door_locks', label: 'Door Locks', input_type: 'pass_fail', is_critical: false, photo_required: false },
      ],
    },
  ],
};
