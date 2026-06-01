import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Minus,
  Camera,
  MapPin,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Fuel,
  AlertCircle,
  Truck,
  Lock,
  RefreshCw,
} from 'lucide-react';
import {
  savePendingCheck,
  saveDraftCheck,
  getDraftCheck,
  clearDraftCheck,
  generateClientId,
  getCachedTemplates,
  getCachedVehicles,
  cacheTemplates,
  getPendingChecks,
} from '@/services/offlineDb';
import { supabase } from '@/services/supabaseClient';
import type {
  Vehicle,
  CheckTemplate,
  CheckItem,
  CheckItemResult,
  CheckResult,
  CheckStatus,
  CheckRun,
  PendingCheck,
  GpsCoordinates,
  FuelLevel,
  Defect,
} from '@/types';
import { FUEL_LEVELS } from '@/types';

// ============================================================================
// Types
// ============================================================================

type WizardStep =
  | 'select_vehicle'
  | 'today_check'
  | 'intro'
  | 'reg_photo'
  | 'category'
  | 'notes'
  | 'confirmations'
  | 'summary'
  | 'signature'
  | 'receipt';

interface CompletedCheckSummary {
  vehicleReg: string;
  vehicleType: string;
  driverName: string;
  startedAt: Date | null;
  completedAt: Date;
  overallStatus: CheckStatus;
  results: Map<string, CheckItemResult>;
  template: CheckTemplate;
  regPhoto: string | null;
  signature: string | null;
  vehicleFitConfirmed: boolean;
  driverFitConfirmed: boolean;
  defectRepairNotes: string;
  headOfficeNotes: string;
}

// Vehicle lock state derived from open defects + requires_recheck flag
type VehicleLockState = 'locked_open' | 'locked_pending' | 'recheck_required' | 'clear';

function getVehicleLockState(vehicle: Vehicle, openDefects: Defect[]): VehicleLockState {
  const vd = openDefects.filter((d) => d.vehicle_id === vehicle.id);
  if (vd.some((d) => d.status === 'raised'))                                   return 'locked_open';
  if (vd.some((d) => d.status === 'acknowledged' || d.status === 'assigned'))  return 'locked_pending';
  if (vehicle.requires_recheck)                                                  return 'recheck_required';
  return 'clear';
}

interface CheckWizardProps {
  driverId: string;
  driverEmail: string;
  orgId: string;
  onComplete: (status: CheckStatus) => void;
}

// ============================================================================
// CheckWizard Component
// ============================================================================

export function CheckWizard({ driverId, driverEmail, orgId, onComplete }: CheckWizardProps) {
  // State
  const [step, setStep] = useState<WizardStep>('select_vehicle');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [templates, setTemplates] = useState<CheckTemplate[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<CheckTemplate | null>(null);
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [results, setResults] = useState<Map<string, CheckItemResult>>(new Map());
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [gpsStart, setGpsStart] = useState<GpsCoordinates | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [submittedDriverName, setSubmittedDriverName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDefectItem, setActiveDefectItem] = useState<CheckItem | null>(null);
  const [defectNote, setDefectNote] = useState('');
  const [defectPhotos, setDefectPhotos] = useState<string[]>([]);
  const [regPhoto, setRegPhoto] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Notes
  const [defectRepairNotes, setDefectRepairNotes] = useState('');
  const [headOfficeNotes, setHeadOfficeNotes] = useState('');

  // Confirmations
  const [vehicleFitConfirmed, setVehicleFitConfirmed] = useState(false);
  const [driverFitConfirmed, setDriverFitConfirmed] = useState(false);

  const [lastCompletedCheck, setLastCompletedCheck] = useState<CompletedCheckSummary | null>(null);
  const [defectResolvedToday, setDefectResolvedToday] = useState(false);
  const [checkingForToday, setCheckingForToday] = useState(false);

  // Vehicle lock states
  const [openDefects, setOpenDefects] = useState<Defect[]>([]);
  const [lockedVehicleInfo, setLockedVehicleInfo] = useState<{ vehicle: Vehicle; defects: Defect[] } | null>(null);
  const [isRecheck, setIsRecheck] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const regPhotoInputRef = useRef<HTMLInputElement>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const autoRestoredRef = useRef(false);

  // Load cached data
  useEffect(() => {
    async function loadData() {
      try {
        const [allVehicles, cachedTemplates] = await Promise.all([
          getCachedVehicles(),
          getCachedTemplates(),
        ]);
        // Filter vehicles for this org
        const orgVehicles = allVehicles.filter((v) => v.org_id === orgId);
        setVehicles(orgVehicles);

        // Fetch open defects to compute vehicle lock states
        const { data: defectsData } = await supabase
          .from('defects')
          .select('id, vehicle_id, org_id, status, severity, item_label, reported_at')
          .eq('org_id', orgId)
          .neq('status', 'resolved');
        if (defectsData) setOpenDefects(defectsData as Defect[]);

        // If no cached templates, fetch directly from Supabase
        let templatesToUse = cachedTemplates;
        if (cachedTemplates.length === 0) {
          console.log('No cached templates, fetching from server...');
          const { data, error } = await supabase
            .from('check_templates')
            .select('*')
            .eq('is_active', true);

          console.log('Template fetch result:', { data, error });

          if (error) {
            console.error('Failed to fetch templates:', error);
          } else if (data && data.length > 0) {
            templatesToUse = data as CheckTemplate[];
            // Cache for next time
            await cacheTemplates(templatesToUse);
          }
        }

        console.log('Templates to use:', templatesToUse);
        setTemplates(templatesToUse);

        // Check for draft
        const draft = await getDraftCheck();
        if (draft && draft.vehicle_id) {
          // Resume draft - simplified for now
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Failed to load vehicle data. Please check your connection.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [orgId]);

  // Get current category
  const currentCategory = selectedTemplate?.categories[currentCategoryIndex];
  const totalCategories = selectedTemplate?.categories.length ?? 0;
  const progress = totalCategories > 0
    ? ((currentCategoryIndex + 1) / totalCategories) * 100
    : 0;

  // Timer effect - counts up from when check started
  useEffect(() => {
    if (!startedAt) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
      setElapsedSeconds(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  // Restore today's check after view switches (driver ↔ manager)
  useEffect(() => {
    if (autoRestoredRef.current || loading || vehicles.length === 0) return;
    const stored = sessionStorage.getItem('checkatruck_last_check');
    if (!stored) return;
    try {
      const { vehicleId, checkDate } = JSON.parse(stored);
      const today = new Date().toISOString().split('T')[0];
      if (checkDate !== today) { sessionStorage.removeItem('checkatruck_last_check'); return; }
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      if (vehicle) {
        autoRestoredRef.current = true;
        handleSelectVehicle(vehicle);
      }
    } catch { sessionStorage.removeItem('checkatruck_last_check'); }
  }, [vehicles, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Format elapsed time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSelectVehicle = async (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setCheckingForToday(true);

    // Find appropriate template for vehicle type
    let template = templates.find((t) => {
      const vehicleTypes = Array.isArray(t.vehicle_types) ? t.vehicle_types : [];
      return vehicleTypes.includes(vehicle.vehicle_type);
    });
    if (!template && templates.length > 0) template = templates[0];

    // Normalize fuel/adblue items to fuel_level selector (handles old database templates)
    if (template) {
      template = {
        ...template,
        categories: template.categories.map((c) => ({
          ...c,
          items: c.items.map((i) =>
            i.id === 'fuel_level' || i.id === 'adblue_level'
              ? { ...i, input_type: 'fuel_level' as const }
              : i
          ),
        })),
      };
    }
    setSelectedTemplate(template ?? null);

    const today = new Date().toISOString().split('T')[0];

    try {
      // 1. Check Supabase for today's synced check
      const { data: dbCheck } = await supabase
        .from('check_runs')
        .select('*')
        .eq('vehicle_id', vehicle.id)
        .eq('user_id', driverId)
        .eq('check_date', today)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: CheckRun | null };

      if (dbCheck && template) {
        // Check if any defect from this check has been resolved (requires re-check)
        let defectCleared = false;
        if (dbCheck.overall_status !== 'pass') {
          const { data: resolved } = await supabase
            .from('defects')
            .select('id')
            .eq('check_run_id', dbCheck.id)
            .eq('status', 'resolved')
            .limit(1);
          defectCleared = !!(resolved && resolved.length > 0);
        }

        const summary: CompletedCheckSummary = {
          vehicleReg: dbCheck.vehicle_registration,
          vehicleType: dbCheck.vehicle_type,
          driverName: dbCheck.driver_name,
          startedAt: new Date(dbCheck.started_at),
          completedAt: new Date(dbCheck.completed_at),
          overallStatus: dbCheck.overall_status,
          results: new Map(dbCheck.results.map((r) => [r.item_id, r])),
          template,
          regPhoto: dbCheck.reg_photo_url ?? null,
          signature: dbCheck.signature_url,
          vehicleFitConfirmed: dbCheck.vehicle_fit_confirmed,
          driverFitConfirmed: dbCheck.driver_fit_confirmed,
          defectRepairNotes: dbCheck.defect_repair_notes ?? '',
          headOfficeNotes: dbCheck.head_office_notes ?? '',
        };
        sessionStorage.setItem('checkatruck_last_check', JSON.stringify({ vehicleId: vehicle.id, checkDate: today }));
        setLastCompletedCheck(summary);
        setDefectResolvedToday(defectCleared);
        setCheckingForToday(false);
        setStep('today_check');
        return;
      }

      // 2. Fall back to IndexedDB (check not yet synced)
      const pending = await getPendingChecks();
      const pendingToday = pending.find(
        (p) => p.vehicle_id === vehicle.id && p.user_id === driverId && p.check_date === today
      );

      if (pendingToday && template) {
        const summary: CompletedCheckSummary = {
          vehicleReg: pendingToday.vehicle_registration,
          vehicleType: pendingToday.vehicle_type,
          driverName: pendingToday.driver_name,
          startedAt: new Date(pendingToday.started_at),
          completedAt: new Date(pendingToday.completed_at),
          overallStatus: pendingToday.overall_status,
          results: new Map(pendingToday.results.map((r) => [r.item_id, r])),
          template,
          regPhoto: pendingToday.reg_photo_data_url ?? null,
          signature: pendingToday.signature_data_url ?? null,
          vehicleFitConfirmed: pendingToday.vehicle_fit_confirmed,
          driverFitConfirmed: pendingToday.driver_fit_confirmed,
          defectRepairNotes: pendingToday.defect_repair_notes ?? '',
          headOfficeNotes: pendingToday.head_office_notes ?? '',
        };
        sessionStorage.setItem('checkatruck_last_check', JSON.stringify({ vehicleId: vehicle.id, checkDate: today }));
        setLastCompletedCheck(summary);
        setDefectResolvedToday(false); // Pending checks can't have resolved defects yet
        setCheckingForToday(false);
        setStep('today_check');
        return;
      }
    } catch (err) {
      console.error('Failed to check for today\'s check:', err);
    }

    setCheckingForToday(false);
    setStep('intro');
  };

  const handleStartCheck = () => {
    setStartedAt(new Date());
    getCurrentLocation();
    setStep('reg_photo');
  };

  const handleRegPhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setRegPhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRegPhotoContinue = () => {
    setStep('category');
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords: GpsCoordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        // Try to get address
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json`
          );
          const data = await response.json();
          if (data.display_name) {
            coords.address = data.display_name.split(',').slice(0, 3).join(',');
          }
        } catch {
          // Ignore address lookup errors
        }

        setGpsStart(coords);
      },
      () => {
        // Ignore geolocation errors
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleItemResult = (item: CheckItem, status: CheckResult, fuelLevel?: FuelLevel) => {
    const existing = results.get(item.id);
    const result: CheckItemResult = {
      item_id: item.id,
      status,
      fuel_level: fuelLevel,
      note: existing?.note ?? null,
      photo_urls: existing?.photo_urls ?? [],
    };

    setResults(new Map(results.set(item.id, result)));

    // If fail and not already a fail, open defect capture
    if (status === 'fail' && existing?.status !== 'fail') {
      setActiveDefectItem(item);
      setDefectNote('');
      setDefectPhotos([]);
    }
  };

  const handleFuelLevelSelect = (item: CheckItem, level: FuelLevel) => {
    const existing = results.get(item.id);
    const result: CheckItemResult = {
      item_id: item.id,
      status: 'pass',
      fuel_level: level,
      note: existing?.note ?? null,
      photo_urls: existing?.photo_urls ?? [],
    };
    setResults(new Map(results.set(item.id, result)));
  };

  const handleDefectCapture = () => {
    if (!activeDefectItem) return;

    const result: CheckItemResult = {
      item_id: activeDefectItem.id,
      status: 'fail',
      note: defectNote || null,
      photo_urls: defectPhotos,
    };

    setResults(new Map(results.set(activeDefectItem.id, result)));
    setActiveDefectItem(null);
    setDefectNote('');
    setDefectPhotos([]);
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setDefectPhotos((prev) => [...prev, reader.result as string]);
    };
    reader.readAsDataURL(file);
  };

  const handleNextCategory = () => {
    if (currentCategoryIndex < totalCategories - 1) {
      setCurrentCategoryIndex((prev) => prev + 1);
    } else {
      // Check if there are any defects to show notes step
      const hasDefects = Array.from(results.values()).some((r) => r.status === 'fail');
      if (hasDefects) {
        setStep('notes');
      } else {
        setStep('confirmations');
      }
    }
    // Save draft
    saveDraftProgress();
  };

  const handlePrevCategory = () => {
    if (currentCategoryIndex > 0) {
      setCurrentCategoryIndex((prev) => prev - 1);
    } else {
      // At first category, go back to reg photo step
      setStep('reg_photo');
    }
  };

  const saveDraftProgress = async () => {
    if (!selectedVehicle || !selectedTemplate) return;

    await saveDraftCheck({
      vehicle_id: selectedVehicle.id,
      template_id: selectedTemplate.id,
      results: Array.from(results.values()),
    });
  };

  const calculateOverallStatus = (): CheckStatus => {
    const resultValues = Array.from(results.values());
    const hasCriticalFail = resultValues.some((r) => {
      if (r.status !== 'fail') return false;
      const item = selectedTemplate?.categories
        .flatMap((c) => c.items)
        .find((i) => i.id === r.item_id);
      // Support both new is_critical field and legacy severity field
      return item?.is_critical || item?.severity === 'critical';
    });

    if (hasCriticalFail) return 'do_not_drive';

    const hasAnyFail = resultValues.some((r) => r.status === 'fail');
    if (hasAnyFail) return 'defects';

    return 'pass';
  };

  const handleSubmit = async () => {
    if (!selectedVehicle || !selectedTemplate || !signature) return;

    setLoading(true);
    setError(null);

    try {
      const clientId = generateClientId();
      const completedAt = new Date();
      const overallStatus = calculateOverallStatus();

      // Get end GPS
      let gpsEnd: GpsCoordinates | null = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
            });
          });
          gpsEnd = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
        } catch {
          // Ignore
        }
      }

      // Build pending check
      const pendingCheck: PendingCheck = {
        id: clientId,
        client_id: clientId,
        org_id: orgId,
        user_id: driverId,
        vehicle_id: selectedVehicle.id,
        template_id: selectedTemplate.id,
        // Denormalized fields for audit trail
        driver_name: submittedDriverName,
        driver_email: driverEmail,
        vehicle_registration: selectedVehicle.registration,
        vehicle_type: selectedVehicle.vehicle_type,
        template_name: selectedTemplate.name,
        template_version: selectedTemplate.version,
        // Check details
        check_date: new Date().toISOString().split('T')[0],
        started_at: startedAt?.toISOString() ?? completedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        gps_start: gpsStart,
        gps_end: gpsEnd,
        results: Array.from(results.values()),
        overall_status: overallStatus,
        // Notes
        defect_repair_notes: defectRepairNotes || null,
        head_office_notes: headOfficeNotes || null,
        // Confirmations
        vehicle_fit_confirmed: vehicleFitConfirmed,
        driver_fit_confirmed: driverFitConfirmed,
        signature_data_url: signature,
        reg_photo_data_url: regPhoto,
        pending_photos: defectPhotos.map((photo, i) => ({
          id: `photo-${i}`,
          item_id: activeDefectItem?.id ?? '',
          data_url: photo,
          uploaded: false,
          url: null,
        })),
        created_at: completedAt.toISOString(),
        sync_attempts: 0,
        last_sync_error: null,
      };

      // Save to IndexedDB
      await savePendingCheck(pendingCheck);
      await clearDraftCheck();

      // If this was a re-check that passed, clear the vehicle flag
      if (isRecheck && overallStatus === 'pass' && selectedVehicle) {
        supabase
          .from('vehicles')
          .update({ requires_recheck: false })
          .eq('id', selectedVehicle.id)
          .then(() => {
            setVehicles((prev) =>
              prev.map((v) => (v.id === selectedVehicle.id ? { ...v, requires_recheck: false } : v))
            );
          });
      }
      setIsRecheck(false);

      setLastCompletedCheck({
        vehicleReg: selectedVehicle.registration,
        vehicleType: selectedVehicle.vehicle_type,
        driverName: submittedDriverName,
        startedAt,
        completedAt,
        overallStatus,
        results: new Map(results),
        template: selectedTemplate,
        regPhoto,
        signature,
        vehicleFitConfirmed,
        driverFitConfirmed,
        defectRepairNotes,
        headOfficeNotes,
      });
      setStep('receipt');
      onComplete(overallStatus);
    } catch (err) {
      console.error('Submit error:', err);
      setError('Failed to save check. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // Signature Drawing
  // ============================================================================

  const initSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up for high-DPI displays
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    const getCoords = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const startDrawing = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      isDrawing = true;
      const { x, y } = getCoords(e);
      lastX = x;
      lastY = y;
    };

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const { x, y } = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastX = x;
      lastY = y;
    };

    const stopDrawing = () => {
      if (isDrawing) {
        isDrawing = false;
        setSignature(canvas.toDataURL('image/png'));
      }
    };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);

    return () => {
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDrawing);
      canvas.removeEventListener('mouseleave', stopDrawing);
      canvas.removeEventListener('touchstart', startDrawing);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stopDrawing);
    };
  }, []);

  useEffect(() => {
    if (step === 'signature') {
      const cleanup = initSignatureCanvas();
      return cleanup;
    }
  }, [step, initSignatureCanvas]);

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature(null);
  };

  const handleStartNewCheck = () => {
    sessionStorage.removeItem('checkatruck_last_check');
    autoRestoredRef.current = false;
    setStep('select_vehicle');
    setSelectedVehicle(null);
    setSelectedTemplate(null);
    setResults(new Map());
    setStartedAt(null);
    setGpsStart(null);
    setSignature(null);
    setRegPhoto(null);
    setDefectRepairNotes('');
    setHeadOfficeNotes('');
    setVehicleFitConfirmed(false);
    setDriverFitConfirmed(false);
    setCurrentCategoryIndex(0);
    setSubmittedDriverName('');
    setElapsedSeconds(0);
    setError(null);
    setDefectResolvedToday(false);
    setLastCompletedCheck(null);
  };

  // ============================================================================
  // Render Functions
  // ============================================================================

  if (loading && step === 'select_vehicle') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Vehicle Selection
  if (step === 'select_vehicle') {
    const isToday = lastCompletedCheck
      ? lastCompletedCheck.completedAt.toDateString() === new Date().toDateString()
      : false;

    return (
      <div className="min-h-screen bg-slate-900 p-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-orange-500 rounded-xl">
            <Truck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-heading text-white">Select Vehicle</h1>
        </div>

        {isToday && lastCompletedCheck && (
          <button
            onClick={() => setStep('receipt')}
            className="w-full mb-4 bg-green-600/20 border border-green-500/40 rounded-lg p-4 text-left hover:bg-green-600/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0" />
              <div>
                <div className="text-green-400 font-bold text-sm">Today's Check Complete</div>
                <div className="text-slate-400 text-xs">
                  {lastCompletedCheck.vehicleReg} • {lastCompletedCheck.completedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div className="ml-auto text-slate-400 text-xs">Tap to view →</div>
            </div>
          </button>
        )}

        {/* Locked vehicle info overlay */}
        {lockedVehicleInfo && (
          <div
            className="fixed inset-0 bg-black/70 z-50 flex items-end"
            onClick={() => setLockedVehicleInfo(null)}
          >
            <div
              className="w-full bg-slate-800 rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-red-400" />
                  <span className="font-mono font-bold text-white">{lockedVehicleInfo.vehicle.registration}</span>
                  <span className="text-sm font-semibold text-red-400">Vehicle Locked</span>
                </div>
                <button
                  onClick={() => setLockedVehicleInfo(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {lockedVehicleInfo.defects.length === 0 ? (
                <p className="text-slate-400 text-sm mb-4">No defect details available.</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {lockedVehicleInfo.defects.map((d) => (
                    <div key={d.id} className="bg-slate-700 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white text-sm font-medium">{d.item_label}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          d.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                          d.severity === 'major'    ? 'bg-amber-500/20 text-amber-400' :
                                                      'bg-blue-500/20 text-blue-400'
                        }`}>
                          {d.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 capitalize">
                        {d.status.replace('_', ' ')} · {new Date(d.reported_at).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-sm text-slate-400 mb-5">
                Contact your manager to have these defects cleared before driving this vehicle.
              </p>

              <button
                onClick={() => setLockedVehicleInfo(null)}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {vehicles.length === 0 ? (
          <div className="bg-slate-800 rounded-lg p-6 text-center">
            <p className="text-slate-300">No vehicles available.</p>
            <p className="text-sm text-slate-500 mt-2">
              Please contact your manager to add vehicles.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Your Vehicles
            </p>
            <div className="space-y-3">
              {vehicles.map((vehicle) => {
                const lockState = getVehicleLockState(vehicle, openDefects);
                const isLocked = lockState === 'locked_open' || lockState === 'locked_pending';

                return (
                  <button
                    key={vehicle.id}
                    onClick={() => {
                      if (isLocked) {
                        const vDefects = openDefects.filter((d) => d.vehicle_id === vehicle.id);
                        setLockedVehicleInfo({ vehicle, defects: vDefects });
                      } else {
                        setIsRecheck(lockState === 'recheck_required');
                        handleSelectVehicle(vehicle);
                      }
                    }}
                    disabled={checkingForToday}
                    className={`w-full rounded-xl p-4 text-left transition-colors touch-target-lg disabled:opacity-60 ${
                      lockState === 'locked_open'       ? 'bg-red-900/25 border border-red-500/25 hover:bg-red-900/35' :
                      lockState === 'locked_pending'    ? 'bg-amber-900/25 border border-amber-500/25 hover:bg-amber-900/35' :
                      lockState === 'recheck_required'  ? 'bg-blue-900/25 border border-blue-500/25 hover:bg-blue-900/35' :
                                                          'bg-slate-800 border border-transparent hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-lg font-mono font-bold text-white">
                            {vehicle.registration}
                          </span>
                          {lockState === 'locked_open' && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                              <Lock className="w-3 h-3" /> Open
                            </span>
                          )}
                          {lockState === 'locked_pending' && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" /> Pending Approval
                            </span>
                          )}
                          {lockState === 'recheck_required' && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                              <RefreshCw className="w-3 h-3" /> Re-check Required
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-400 truncate">
                          {[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                          {(vehicle.make || vehicle.model) ? ' · ' : ''}
                          {vehicle.vehicle_type.replace(/_/g, ' ')}
                        </div>
                      </div>
                      {checkingForToday ? (
                        <Loader2 className="w-5 h-5 text-orange-500 animate-spin shrink-0" />
                      ) : (
                        <ChevronRight className={`w-5 h-5 shrink-0 ${isLocked ? 'text-slate-600' : 'text-slate-500'}`} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // Already checked today gate
  if (step === 'today_check' && lastCompletedCheck) {
    const check = lastCompletedCheck;
    const defectCount = Array.from(check.results.values()).filter((r) => r.status === 'fail').length;

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setStep('select_vehicle')} className="text-slate-400 hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-mono font-bold text-white">{check.vehicleReg}</span>
            <div className="w-5" />
          </div>
        </div>

        <div className="flex-1 p-4 flex flex-col justify-center">
          <div className="w-full max-w-md mx-auto space-y-4">
            {/* Status banner */}
            {defectResolvedToday ? (
              <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-5 text-center">
                <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                <h2 className="text-amber-400 font-bold text-lg mb-1">Re-check Required</h2>
                <p className="text-slate-400 text-sm">
                  A defect from your earlier check has been cleared by the workshop. You must complete a new walk-around before driving.
                </p>
              </div>
            ) : (
              <div className={`rounded-xl p-5 text-center ${
                check.overallStatus === 'pass'
                  ? 'bg-green-500/10 border border-green-500/40'
                  : check.overallStatus === 'defects'
                  ? 'bg-amber-500/10 border border-amber-500/40'
                  : 'bg-red-500/10 border border-red-500/40'
              }`}>
                {check.overallStatus === 'pass'
                  ? <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  : check.overallStatus === 'defects'
                  ? <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                  : <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />}
                <h2 className={`font-bold text-lg mb-1 ${
                  check.overallStatus === 'pass' ? 'text-green-400' :
                  check.overallStatus === 'defects' ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {check.overallStatus === 'pass' ? 'Passed' :
                   check.overallStatus === 'defects' ? `${defectCount} Defect${defectCount !== 1 ? 's' : ''} Found` :
                   'Do Not Drive'}
                </h2>
                <p className="text-slate-400 text-sm">
                  This vehicle was checked today at {check.completedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}

            {/* Check details */}
            <div className="bg-slate-800 rounded-lg p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Vehicle</span>
                <span className="text-white font-mono font-bold">{check.vehicleReg}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Driver</span>
                <span className="text-white">{check.driverName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Checked at</span>
                <span className="text-white">
                  {check.completedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date</span>
                <span className="text-white">
                  {check.completedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              {!defectResolvedToday && (
                <button
                  onClick={() => setStep('receipt')}
                  className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  View Today's Check
                </button>
              )}
              <button
                onClick={() => setStep('intro')}
                className={`w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  defectResolvedToday
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Truck className="w-5 h-5" />
                {defectResolvedToday ? 'Start Re-check' : 'Check Again'}
              </button>
              <button
                onClick={() => setStep('select_vehicle')}
                className="w-full py-3 bg-slate-800 text-slate-400 font-medium rounded-lg hover:bg-slate-700 transition-colors"
              >
                Change Vehicle
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Intro
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl mb-4">
              <Truck className="w-10 h-10 text-white" />
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-4 mb-6 text-center">
            <div className="text-3xl font-mono font-bold text-white tracking-wider">
              {selectedVehicle?.registration}
            </div>
            <div className="text-slate-400 text-sm mt-1 capitalize">
              {selectedVehicle?.vehicle_type?.replace(/_/g, ' ')}
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">What you'll do:</h3>
            <ul className="space-y-2 text-slate-300 text-sm">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Take a photo of the registration plate
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Walk around and check {selectedTemplate?.categories.length ?? '—'} areas
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Note fuel level and any defects
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Sign to confirm your check
              </li>
            </ul>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-500 mb-6 justify-center">
            <MapPin className="w-4 h-4" />
            <span>Location will be recorded</span>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleStartCheck}
              className="w-full py-4 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors touch-target-lg flex items-center justify-center gap-2"
            >
              Start Check
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => setStep('select_vehicle')}
              className="w-full py-3 bg-slate-700 text-slate-300 font-medium rounded-lg hover:bg-slate-600 transition-colors"
            >
              Change Vehicle
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Reg Photo Step
  if (step === 'reg_photo') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="font-mono text-slate-400">{formatTime(elapsedSeconds)}</span>
              </div>
              <span className="text-xs text-slate-500">10 mins advised</span>
            </div>
            <span className="font-mono font-bold text-white">{selectedVehicle?.registration}</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-6">
              <Camera className="w-12 h-12 text-orange-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Photo of Registration Plate</h2>
              <p className="text-slate-400 text-sm">
                This confirms you're at the vehicle. Take a clear photo of the front plate.
              </p>
            </div>

            {regPhoto ? (
              <div className="mb-6">
                <img src={regPhoto} alt="Reg plate" className="w-full rounded-lg" />
                <button
                  onClick={() => setRegPhoto(null)}
                  className="mt-2 text-sm text-slate-400 hover:text-white"
                >
                  Retake photo
                </button>
              </div>
            ) : (
              <div className="mb-6">
                <button
                  onClick={() => regPhotoInputRef.current?.click()}
                  className="w-full py-12 border-2 border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-orange-500 hover:text-orange-500 transition-colors flex flex-col items-center gap-2"
                >
                  <Camera className="w-8 h-8" />
                  <span>Tap to take photo</span>
                </button>
              </div>
            )}
            <input
              ref={regPhotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleRegPhotoCapture}
              className="hidden"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setStep('intro')}
                className="py-3 px-4 bg-slate-700 text-white font-medium rounded-lg"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={handleRegPhotoContinue}
                disabled={!regPhoto}
                className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                Continue
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Category Check - handle missing template/category
  if (step === 'category' && !currentCategory) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">No Check Template Found</h2>
          <p className="text-slate-400 mb-4">
            There's no check template available for this vehicle type. Please contact your administrator.
          </p>
          <button
            onClick={() => setStep('select_vehicle')}
            className="px-6 py-2 bg-slate-700 text-slate-300 font-medium rounded-lg hover:bg-slate-600 transition-colors"
          >
            Back to Vehicle Selection
          </button>
        </div>
      </div>
    );
  }

  // Category Check
  if (step === 'category' && currentCategory) {
    // Check if all items in current category are completed
    const categoryItems = currentCategory.items;
    const completedItems = categoryItems.filter((item) => results.has(item.id));
    const allItemsCompleted = completedItems.length === categoryItems.length;
    const remainingCount = categoryItems.length - completedItems.length;

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="font-mono text-slate-400">{formatTime(elapsedSeconds)}</span>
              </div>
              <span className="text-xs text-slate-500">10 mins advised</span>
            </div>
            <span className="font-mono font-bold text-white">{selectedVehicle?.registration}</span>
          </div>
          <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-400">
              {currentCategoryIndex + 1} of {totalCategories}
            </span>
            <span className="text-xs text-white font-medium">{currentCategory.name}</span>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-3">
            {currentCategory.items.map((item) => (
              <CheckItemRow
                key={item.id}
                item={item}
                result={results.get(item.id)}
                onResult={(status) => handleItemResult(item, status)}
                onFuelLevelSelect={(level) => handleFuelLevelSelect(item, level)}
              />
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-slate-800 p-4">
          {!allItemsCompleted && (
            <p className="text-sm text-amber-400 text-center mb-3">
              {remainingCount} item{remainingCount !== 1 ? 's' : ''} remaining
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={handlePrevCategory}
              className="py-3 px-4 bg-slate-700 text-white font-medium rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNextCategory}
              disabled={!allItemsCompleted}
              className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {currentCategoryIndex === totalCategories - 1 ? 'Review' : 'Next'}
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Defect Capture Modal */}
        {activeDefectItem && (
          <DefectCaptureModal
            item={activeDefectItem}
            note={defectNote}
            photos={defectPhotos}
            onNoteChange={setDefectNote}
            onPhotoCapture={handlePhotoCapture}
            onRemovePhoto={(i) => setDefectPhotos((prev) => prev.filter((_, idx) => idx !== i))}
            onClose={() => setActiveDefectItem(null)}
            onSave={handleDefectCapture}
            fileInputRef={fileInputRef}
          />
        )}
      </div>
    );
  }

  // Notes Step (only shown if defects found)
  if (step === 'notes') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Post-Check Notes</span>
            <span className="font-mono font-bold text-white">{selectedVehicle?.registration}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-400 uppercase mb-2">
                Defect Repair Notes
              </label>
              <p className="text-slate-500 text-sm mb-2">
                Describe any repairs made before starting your journey
              </p>
              <textarea
                value={defectRepairNotes}
                onChange={(e) => setDefectRepairNotes(e.target.value)}
                className="w-full p-4 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                rows={4}
                placeholder="E.g., Replaced blown indicator bulb..."
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-400 uppercase mb-2">
                Further Notes for Head Office
              </label>
              <p className="text-slate-500 text-sm mb-2">
                Issues needing attention on return to depot
              </p>
              <textarea
                value={headOfficeNotes}
                onChange={(e) => setHeadOfficeNotes(e.target.value)}
                className="w-full p-4 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                rows={4}
                placeholder="E.g., Windscreen chip needs repair..."
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-800 p-4">
          <button
            onClick={() => setStep('confirmations')}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
          >
            Continue
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // Confirmations Step
  if (step === 'confirmations') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Confirmations</span>
            <span className="font-mono font-bold text-white">{selectedVehicle?.registration}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-4">
            <div
              onClick={() => setVehicleFitConfirmed(!vehicleFitConfirmed)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                vehicleFitConfirmed
                  ? 'bg-green-500/10 border-green-500'
                  : 'bg-slate-800 border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  vehicleFitConfirmed
                    ? 'bg-green-500 border-green-500'
                    : 'border-slate-500'
                }`}>
                  {vehicleFitConfirmed && <Check className="w-4 h-4 text-white" />}
                </div>
                <div>
                  <h3 className="text-white font-bold mb-1">Vehicle Fit Confirmation</h3>
                  <p className="text-slate-400 text-sm">
                    I confirm that the above checks have been carried out and I consider the vehicle fit for use
                  </p>
                </div>
              </div>
            </div>

            <div
              onClick={() => setDriverFitConfirmed(!driverFitConfirmed)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                driverFitConfirmed
                  ? 'bg-green-500/10 border-green-500'
                  : 'bg-slate-800 border-slate-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  driverFitConfirmed
                    ? 'bg-green-500 border-green-500'
                    : 'border-slate-500'
                }`}>
                  {driverFitConfirmed && <Check className="w-4 h-4 text-white" />}
                </div>
                <div>
                  <h3 className="text-white font-bold mb-1">Driver Fit Confirmation</h3>
                  <p className="text-slate-400 text-sm">
                    I confirm I am fit to drive, aware of company policies and LAW on Alcohol and Drugs, and fully aware of my driving hours/WTD/Tachograph rules
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 p-4">
          <button
            onClick={() => setStep('summary')}
            disabled={!vehicleFitConfirmed || !driverFitConfirmed}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            Review Check
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // Summary
  if (step === 'summary') {
    const overallStatus = calculateOverallStatus();
    const defectCount = Array.from(results.values()).filter((r) => r.status === 'fail').length;

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Check Summary</span>
            <span className="font-mono font-bold text-white">{selectedVehicle?.registration}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="text-center mb-6">
            {overallStatus === 'pass' ? (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-full mb-4">
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl font-bold text-green-400">All Clear</h2>
                <p className="text-slate-400">Vehicle fit for use</p>
              </>
            ) : overallStatus === 'defects' ? (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500 rounded-full mb-4">
                  <AlertTriangle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl font-bold text-amber-400">Minor Issues</h2>
                <p className="text-slate-400">{defectCount} defect{defectCount !== 1 ? 's' : ''} found</p>
              </>
            ) : (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500 rounded-full mb-4">
                  <XCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl font-bold text-red-400">Do Not Drive</h2>
                <p className="text-slate-400">Critical defects — seek advice before proceeding</p>
              </>
            )}
          </div>

          {selectedTemplate?.categories.map((cat) => (
            <div key={cat.name} className="mb-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">{cat.name}</h3>
              <div className="bg-slate-800 rounded-lg overflow-hidden">
                {cat.items.map((item, i) => {
                  const result = results.get(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-3 ${
                        i < cat.items.length - 1 ? 'border-b border-slate-700' : ''
                      }`}
                    >
                      <span className="text-white text-sm">{item.label}</span>
                      <span className={`text-sm font-bold ${
                        result?.status === 'pass' ? 'text-green-400' :
                        result?.status === 'fail' ? 'text-red-400' :
                        'text-slate-400'
                      }`}>
                        {result?.status === 'pass'
                          ? (result.fuel_level ? FUEL_LEVELS.find(f => f.value === result.fuel_level)?.label : 'OK')
                          : result?.status === 'fail' ? 'DEFECT' : 'N/A'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-800 p-4">
          <div className="flex gap-3">
            <button
              onClick={() => {
                setCurrentCategoryIndex(totalCategories - 1);
                setStep('category');
              }}
              className="py-3 px-4 bg-slate-700 text-white font-medium rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setStep('signature')}
              className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
            >
              Sign & Submit
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Signature
  if (step === 'signature') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setStep('summary')} className="text-slate-400 hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-mono font-bold text-white">{selectedVehicle?.registration}</span>
            <div className="w-5" />
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4">
          <h2 className="text-xl font-bold text-white text-center">Sign Your Check</h2>
          <p className="text-slate-400 text-center text-sm">Confirm your name and sign to complete</p>

          <div>
            <label className="block text-sm font-bold text-slate-400 uppercase mb-2">
              Driver Name
            </label>
            <input
              type="text"
              value={submittedDriverName}
              onChange={(e) => setSubmittedDriverName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              placeholder="Enter your name"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-400 uppercase mb-2">
              Signature
            </label>
            <div className="bg-white rounded-lg p-2">
              <canvas
                ref={signatureCanvasRef}
                className="w-full h-48 touch-none border border-slate-200 rounded"
                style={{ touchAction: 'none' }}
              />
            </div>
            <button
              onClick={clearSignature}
              className="mt-2 text-sm text-slate-400 hover:text-white"
            >
              Clear signature
            </button>
          </div>

          <p className="text-xs text-slate-500 text-center">
            I, <span className="text-white">{submittedDriverName || '...'}</span>, confirm I have completed this vehicle check to the best of my ability.
          </p>
        </div>

        <div className="bg-slate-800 p-4">
          {error && (
            <div className="mb-3 p-3 bg-red-900/30 border border-red-800 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={!signature || !submittedDriverName.trim() || loading}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Complete Check
                <Check className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Receipt (DVSA-compliant check record)
  if (step === 'receipt' && lastCompletedCheck) {
    const check = lastCompletedCheck;
    const allItems = check.template.categories.flatMap((c) => c.items);
    const defectItems = allItems.filter((item) => check.results.get(item.id)?.status === 'fail');

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setStep('today_check')} className="text-slate-400 hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-mono font-bold text-white">{check.vehicleReg}</span>
          </div>
        </div>

        {/* DVSA notice */}
        <div className="bg-orange-500/10 border-b border-orange-500/20 px-4 py-2">
          <p className="text-orange-400 text-xs text-center font-medium">
            Keep this screen available to show DVSA if stopped
          </p>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Status banner */}
          <div className={`rounded-xl p-5 text-center ${
            check.overallStatus === 'pass' ? 'bg-green-500' :
            check.overallStatus === 'defects' ? 'bg-amber-500' : 'bg-red-500'
          }`}>
            {check.overallStatus === 'pass' && <CheckCircle2 className="w-10 h-10 text-white mx-auto mb-2" />}
            {check.overallStatus === 'defects' && <AlertTriangle className="w-10 h-10 text-white mx-auto mb-2" />}
            {check.overallStatus === 'do_not_drive' && <XCircle className="w-10 h-10 text-white mx-auto mb-2" />}
            <div className="text-white font-bold text-lg">
              {check.overallStatus === 'pass' && 'All Clear — Vehicle Passed'}
              {check.overallStatus === 'defects' && 'Defects Found — Vehicle Passed With Notes'}
              {check.overallStatus === 'do_not_drive' && 'Critical Defects — Do Not Drive'}
            </div>
          </div>

          {/* Check details */}
          <div className="bg-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase">Check Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-slate-500 text-xs">Vehicle</div>
                <div className="text-white font-mono font-bold">{check.vehicleReg}</div>
                <div className="text-slate-400 text-xs capitalize">{check.vehicleType.replace(/_/g, ' ')}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Driver</div>
                <div className="text-white font-medium">{check.driverName}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Date</div>
                <div className="text-white">{check.completedAt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">Time</div>
                <div className="text-white">
                  {check.startedAt?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} – {check.completedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          </div>

          {/* Reg photo */}
          {check.regPhoto && (
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">Registration Plate Photo</h3>
              <img src={check.regPhoto} alt="Registration plate" className="w-full rounded-lg" />
            </div>
          )}

          {/* Confirmations */}
          <div className="bg-slate-800 rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-bold text-slate-400 uppercase mb-1">Declarations</h3>
            <div className="flex items-center gap-2 text-sm">
              {check.vehicleFitConfirmed
                ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
              <span className="text-slate-300">Vehicle fit for use confirmed</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {check.driverFitConfirmed
                ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
              <span className="text-slate-300">Driver fit to drive confirmed</span>
            </div>
          </div>

          {/* Defects */}
          {defectItems.length > 0 && (
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">Defects Reported</h3>
              <div className="space-y-3">
                {defectItems.map((item) => {
                  const result = check.results.get(item.id);
                  return (
                    <div key={item.id} className="border-l-2 border-red-500 pl-3">
                      <div className="flex items-center gap-2">
                        <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="text-white text-sm font-medium">{item.label}</span>
                        {item.is_critical && <AlertCircle className="w-3 h-3 text-red-500" />}
                      </div>
                      {result?.note && (
                        <p className="text-slate-400 text-xs mt-1 ml-6">{result.note}</p>
                      )}
                      {result?.photo_urls && result.photo_urls.length > 0 && (
                        <div className="flex gap-2 mt-2 ml-6">
                          {result.photo_urls.map((url, i) => (
                            <img key={i} src={url} alt={`Defect photo ${i + 1}`} className="w-16 h-16 object-cover rounded" />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          {(check.defectRepairNotes || check.headOfficeNotes) && (
            <div className="bg-slate-800 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase">Notes</h3>
              {check.defectRepairNotes && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Repair Notes</div>
                  <p className="text-slate-300 text-sm">{check.defectRepairNotes}</p>
                </div>
              )}
              {check.headOfficeNotes && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Head Office Notes</div>
                  <p className="text-slate-300 text-sm">{check.headOfficeNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Signature */}
          {check.signature && (
            <div className="bg-slate-800 rounded-lg p-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">Driver Signature</h3>
              <div className="bg-white rounded-lg p-2">
                <img src={check.signature} alt="Driver signature" className="w-full h-24 object-contain" />
              </div>
            </div>
          )}

          {/* Full check items */}
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">Full Check Record</h3>
            {check.template.categories.map((cat) => (
              <div key={cat.name} className="mb-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-1 px-1">{cat.name}</h4>
                <div className="bg-slate-800 rounded-lg overflow-hidden">
                  {cat.items.map((item, i) => {
                    const result = check.results.get(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-3 ${
                          i < cat.items.length - 1 ? 'border-b border-slate-700' : ''
                        }`}
                      >
                        <span className="text-slate-300 text-sm">{item.label}</span>
                        <span className={`text-sm font-bold ${
                          result?.status === 'pass' ? 'text-green-400' :
                          result?.status === 'fail' ? 'text-red-400' :
                          'text-slate-500'
                        }`}>
                          {result?.status === 'pass'
                            ? (result.fuel_level ? FUEL_LEVELS.find(f => f.value === result.fuel_level)?.label : 'OK')
                            : result?.status === 'fail' ? 'DEFECT'
                            : 'N/A'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800 p-4">
          <button
            onClick={handleStartNewCheck}
            className="w-full py-3 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600 transition-colors"
          >
            Start New Check
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================================
// CheckItemRow Component
// ============================================================================

interface CheckItemRowProps {
  item: CheckItem;
  result?: CheckItemResult;
  onResult: (status: CheckResult) => void;
  onFuelLevelSelect: (level: FuelLevel) => void;
}

function CheckItemRow({ item, result, onResult, onFuelLevelSelect }: CheckItemRowProps) {
  const [showHelp, setShowHelp] = useState(false);

  // Get input type with fallback for legacy templates
  const inputType = item.input_type || 'pass_fail_na';

  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-2 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                {item.label}
              </span>
              {item.is_critical && (
                <AlertCircle className="w-4 h-4 text-red-500" />
              )}
              {item.photo_required && (
                <Camera className="w-4 h-4 text-slate-400" />
              )}
            </div>
            {item.help_text && (
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="text-xs text-blue-400 flex items-center gap-1 mt-1"
              >
                <HelpCircle className="w-3 h-3" />
                {showHelp ? 'Hide help' : 'Show help'}
              </button>
            )}
          </div>
        </div>

        {showHelp && item.help_text && (
          <p className="text-xs text-slate-400 mb-3 p-2 bg-slate-700 rounded">
            {item.help_text}
          </p>
        )}

        {inputType === 'fuel_level' ? (
          <div className="flex gap-2">
            {FUEL_LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() => onFuelLevelSelect(level.value)}
                className={`flex-1 py-3 rounded-lg font-bold transition-colors flex flex-col items-center gap-1 ${
                  result?.fuel_level === level.value
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-700 text-white hover:bg-slate-600'
                }`}
              >
                <Fuel className={`w-5 h-5 ${
                  result?.fuel_level === level.value ? 'text-white' :
                  level.value === 'empty' ? 'text-red-400' :
                  level.value === 'quarter' ? 'text-orange-400' :
                  level.value === 'half' ? 'text-yellow-400' :
                  level.value === 'three_quarter' ? 'text-green-400' :
                  'text-green-500'
                }`} />
                <span className="text-xs">{level.label}</span>
              </button>
            ))}
          </div>
        ) : inputType === 'yes_no' ? (
          <div className="flex gap-2">
            <button
              onClick={() => onResult('pass')}
              className={`flex-1 py-3 rounded-lg font-bold transition-colors touch-target ${
                result?.status === 'pass'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => onResult('fail')}
              className={`flex-1 py-3 rounded-lg font-bold transition-colors touch-target ${
                result?.status === 'fail'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              }`}
            >
              No
            </button>
          </div>
        ) : (
          <div>
            <div className="flex gap-2 mb-1 text-xs font-medium text-slate-400">
              <span className="flex-1 text-center">OK</span>
              <span className="flex-1 text-center">Defect</span>
              {inputType === 'pass_fail_na' && (
                <span className="flex-1 text-center">N/A</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onResult('pass')}
                className={`flex-1 py-3 rounded-lg font-bold transition-colors touch-target ${
                  result?.status === 'pass'
                    ? 'bg-green-600 text-white'
                    : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                }`}
              >
                <Check className="w-6 h-6 mx-auto" />
              </button>
              <button
                onClick={() => onResult('fail')}
                className={`flex-1 py-3 rounded-lg font-bold transition-colors touch-target ${
                  result?.status === 'fail'
                    ? 'bg-red-600 text-white'
                    : 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                }`}
              >
                <X className="w-6 h-6 mx-auto" />
              </button>
              {inputType === 'pass_fail_na' && (
                <button
                  onClick={() => onResult('na')}
                  className={`flex-1 py-3 rounded-lg font-bold transition-colors touch-target ${
                    result?.status === 'na'
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-600/20 text-slate-400 hover:bg-slate-600/30'
                  }`}
                >
                  <Minus className="w-6 h-6 mx-auto" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// DefectCaptureModal Component
// ============================================================================

interface DefectCaptureModalProps {
  item: CheckItem;
  note: string;
  photos: string[];
  onNoteChange: (note: string) => void;
  onPhotoCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (index: number) => void;
  onClose: () => void;
  onSave: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

function DefectCaptureModal({
  item,
  note,
  photos,
  onNoteChange,
  onPhotoCapture,
  onRemovePhoto,
  onClose,
  onSave,
  fileInputRef,
}: DefectCaptureModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-auto">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">Report Defect</h3>
          <p className="text-sm text-slate-500">{item.label}</p>
        </div>

        <div className="p-4 space-y-4">
          {item.photo_required && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-2">
                Photo {item.photo_required ? '(Required)' : '(Optional)'}
              </label>
              <div className="flex gap-2 flex-wrap">
                {photos.map((photo, i) => (
                  <div key={i} className="relative w-20 h-20">
                    <img
                      src={photo}
                      alt={`Defect ${i + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <button
                      onClick={() => onRemovePhoto(i)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-400"
                >
                  <Camera className="w-6 h-6" />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPhotoCapture}
                className="hidden"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Describe the defect..."
              rows={3}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-200 text-slate-700 font-medium rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={item.photo_required && photos.length === 0}
            className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-lg disabled:opacity-50"
          >
            Save Defect
          </button>
        </div>
      </div>
    </div>
  );
}
