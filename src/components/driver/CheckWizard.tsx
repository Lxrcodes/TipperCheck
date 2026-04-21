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
} from '@/services/offlineDb';
import { supabase } from '@/services/supabaseClient';
import type {
  Vehicle,
  CheckTemplate,
  CheckItem,
  CheckItemResult,
  CheckResult,
  CheckStatus,
  PendingCheck,
  GpsCoordinates,
} from '@/types';

// ============================================================================
// Types
// ============================================================================

type WizardStep =
  | 'select_vehicle'
  | 'intro'
  | 'category'
  | 'summary'
  | 'signature'
  | 'complete';

interface CheckWizardProps {
  driverId: string;
  driverName: string;
  driverEmail: string;
  orgId: string;
  onComplete: (status: CheckStatus) => void;
}

// ============================================================================
// CheckWizard Component
// ============================================================================

export function CheckWizard({ driverId, driverName, driverEmail, orgId, onComplete }: CheckWizardProps) {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDefectItem, setActiveDefectItem] = useState<CheckItem | null>(null);
  const [defectNote, setDefectNote] = useState('');
  const [defectPhotos, setDefectPhotos] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load cached data
  useEffect(() => {
    async function loadData() {
      try {
        const [allVehicles, cachedTemplates] = await Promise.all([
          getCachedVehicles(),
          getCachedTemplates(),
        ]);
        // Filter vehicles for this org
        setVehicles(allVehicles.filter((v) => v.org_id === orgId));

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

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSelectVehicle = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);

    // Debug logging
    console.log('Templates available:', templates);
    console.log('Vehicle type:', vehicle.vehicle_type);

    // Find appropriate template for vehicle type
    let template = templates.find((t) => {
      console.log('Checking template:', t.name, 'vehicle_types:', t.vehicle_types);
      // Handle both array and string formats from database
      const vehicleTypes = Array.isArray(t.vehicle_types)
        ? t.vehicle_types
        : [];
      return vehicleTypes.includes(vehicle.vehicle_type);
    });

    // Fallback to first template if no match
    if (!template && templates.length > 0) {
      console.log('No matching template, using first available');
      template = templates[0];
    }

    console.log('Selected template:', template);
    setSelectedTemplate(template ?? null);
    setStep('intro');
  };

  const handleStartCheck = () => {
    setStartedAt(new Date());
    getCurrentLocation();
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

  const handleItemResult = (item: CheckItem, status: CheckResult) => {
    const existing = results.get(item.id);
    const result: CheckItemResult = {
      item_id: item.id,
      status,
      note: existing?.note ?? null,
      photo_urls: existing?.photo_urls ?? [],
    };

    setResults(new Map(results.set(item.id, result)));

    // If fail and photo required, open defect capture
    if (status === 'fail') {
      setActiveDefectItem(item);
      setDefectNote('');
      setDefectPhotos([]);
    }
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
      setStep('summary');
    }
    // Save draft
    saveDraftProgress();
  };

  const handlePrevCategory = () => {
    if (currentCategoryIndex > 0) {
      setCurrentCategoryIndex((prev) => prev - 1);
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
      return item?.severity === 'critical';
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
        driver_name: driverName,
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
        signature_data_url: signature,
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

      setStep('complete');
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

  // ============================================================================
  // Render Functions
  // ============================================================================

  if (loading && step === 'select_vehicle') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Vehicle Selection
  if (step === 'select_vehicle') {
    return (
      <div className="min-h-screen bg-slate-100 p-4">
        <h1 className="text-xl font-heading text-slate-900 mb-4">
          Select Vehicle
        </h1>
        {vehicles.length === 0 ? (
          <div className="bg-white rounded-lg p-6 text-center">
            <p className="text-slate-600">No vehicles available.</p>
            <p className="text-sm text-slate-400 mt-2">
              Please contact your manager to add vehicles.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {vehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                onClick={() => handleSelectVehicle(vehicle)}
                className="w-full bg-white rounded-lg p-4 text-left shadow-sm hover:shadow-md transition-shadow touch-target-lg"
              >
                <div className="text-lg font-bold text-slate-900">
                  {vehicle.registration}
                </div>
                <div className="text-sm text-slate-500">
                  {vehicle.make} {vehicle.model} • {vehicle.vehicle_type}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Intro
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-slate-100 p-4 flex flex-col">
        <div className="flex-1">
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h1 className="text-xl font-heading text-slate-900 mb-2">
              Daily Check
            </h1>
            <div className="text-2xl font-bold text-orange-500 mb-4">
              {selectedVehicle?.registration}
            </div>

            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Before you start:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Walk around the vehicle</li>
                  <li>Engine should be off and keys removed</li>
                  <li>Apply parking brake</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <MapPin className="w-4 h-4" />
              <span>Location will be recorded</span>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <button
            onClick={handleStartCheck}
            className="w-full py-4 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors touch-target-lg flex items-center justify-center gap-2"
          >
            Start Check
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => setStep('select_vehicle')}
            className="w-full py-3 bg-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-300 transition-colors"
          >
            Change Vehicle
          </button>
        </div>
      </div>
    );
  }

  // Category Check - handle missing template/category
  if (step === 'category' && !currentCategory) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-sm p-6 max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">No Check Template Found</h2>
          <p className="text-slate-600 mb-4">
            There's no check template available for this vehicle type. Please contact your administrator.
          </p>
          <button
            onClick={() => setStep('select_vehicle')}
            className="px-6 py-2 bg-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-300 transition-colors"
          >
            Back to Vehicle Selection
          </button>
        </div>
      </div>
    );
  }

  // Category Check
  if (step === 'category' && currentCategory) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-500">
              {currentCategoryIndex + 1} of {totalCategories}
            </span>
            <span className="text-sm text-slate-400">
              {selectedVehicle?.registration}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {currentCategory.name}
          </h2>
          <div className="mt-2 h-1 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
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
              />
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-white border-t border-slate-200 p-4">
          <div className="flex gap-3">
            <button
              onClick={handlePrevCategory}
              disabled={currentCategoryIndex === 0}
              className="flex-1 py-3 bg-slate-200 text-slate-700 font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
            <button
              onClick={handleNextCategory}
              className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
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

  // Summary
  if (step === 'summary') {
    const overallStatus = calculateOverallStatus();
    const failedItems = Array.from(results.entries())
      .filter(([, r]) => r.status === 'fail')
      .map(([id]) => {
        const item = selectedTemplate?.categories
          .flatMap((c) => c.items)
          .find((i) => i.id === id);
        return item;
      })
      .filter(Boolean) as CheckItem[];

    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <div className="bg-white p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Check Summary</h2>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {/* Status Card */}
          <div
            className={`rounded-lg p-6 text-center mb-4 ${
              overallStatus === 'pass'
                ? 'bg-green-500'
                : overallStatus === 'defects'
                ? 'bg-amber-500'
                : 'bg-red-500'
            }`}
          >
            {overallStatus === 'pass' && (
              <CheckCircle2 className="w-12 h-12 text-white mx-auto mb-2" />
            )}
            {overallStatus === 'defects' && (
              <AlertTriangle className="w-12 h-12 text-white mx-auto mb-2" />
            )}
            {overallStatus === 'do_not_drive' && (
              <XCircle className="w-12 h-12 text-white mx-auto mb-2" />
            )}
            <div className="text-xl font-bold text-white">
              {overallStatus === 'pass' && 'All Checks Passed'}
              {overallStatus === 'defects' && 'Defects Found'}
              {overallStatus === 'do_not_drive' && 'Do Not Drive'}
            </div>
          </div>

          {/* Defect List */}
          {failedItems.length > 0 && (
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-bold text-slate-900 mb-3">Defects Reported</h3>
              <div className="space-y-2">
                {failedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                  >
                    <span
                      className={`px-2 py-0.5 text-xs font-bold rounded ${
                        item.severity === 'critical'
                          ? 'bg-red-500 text-white'
                          : item.severity === 'major'
                          ? 'bg-amber-500 text-white'
                          : 'bg-blue-500 text-white'
                      }`}
                    >
                      {item.severity.toUpperCase()}
                    </span>
                    <span className="text-sm text-slate-700">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border-t border-slate-200 p-4">
          <div className="flex gap-3">
            <button
              onClick={() => {
                setCurrentCategoryIndex(totalCategories - 1);
                setStep('category');
              }}
              className="flex-1 py-3 bg-slate-200 text-slate-700 font-medium rounded-lg flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              Edit
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
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <div className="bg-white p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Driver Signature</h2>
          <p className="text-sm text-slate-500 mt-1">
            I confirm this check was completed accurately
          </p>
        </div>

        <div className="flex-1 p-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden">
              <canvas
                ref={signatureCanvasRef}
                className="w-full h-48 touch-none"
                style={{ touchAction: 'none' }}
              />
            </div>
            <button
              onClick={clearSignature}
              className="mt-2 text-sm text-slate-500 hover:text-slate-700"
            >
              Clear signature
            </button>
          </div>
        </div>

        <div className="bg-white border-t border-slate-200 p-4">
          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => setStep('summary')}
              className="flex-1 py-3 bg-slate-200 text-slate-700 font-medium rounded-lg flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={!signature || loading}
              className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Submit
                  <Check className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Complete
  if (step === 'complete') {
    const overallStatus = calculateOverallStatus();
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
            overallStatus === 'pass'
              ? 'bg-green-500'
              : overallStatus === 'defects'
              ? 'bg-amber-500'
              : 'bg-red-500'
          }`}
        >
          {overallStatus === 'pass' ? (
            <Check className="w-10 h-10 text-white" />
          ) : (
            <AlertTriangle className="w-10 h-10 text-white" />
          )}
        </div>
        <h1 className="text-2xl font-heading text-slate-900 mb-2">
          Check Complete
        </h1>
        <p className="text-slate-500 mb-6">
          {selectedVehicle?.registration} • {new Date().toLocaleDateString()}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-300 transition-colors"
        >
          Start New Check
        </button>
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
}

function CheckItemRow({ item, result, onResult }: CheckItemRowProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-900">
                {item.label}
              </span>
              {item.photo_required && (
                <Camera className="w-4 h-4 text-slate-400" />
              )}
            </div>
            {item.help_text && (
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="text-xs text-blue-500 flex items-center gap-1 mt-1"
              >
                <HelpCircle className="w-3 h-3" />
                {showHelp ? 'Hide help' : 'Show help'}
              </button>
            )}
          </div>
          <span
            className={`px-2 py-0.5 text-xs font-bold rounded ${
              item.severity === 'critical'
                ? 'bg-red-100 text-red-700'
                : item.severity === 'major'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {item.severity === 'critical' ? 'CRIT' : item.severity === 'major' ? 'MAJ' : 'MIN'}
          </span>
        </div>

        {showHelp && item.help_text && (
          <p className="text-xs text-slate-500 mb-3 p-2 bg-slate-50 rounded">
            {item.help_text}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onResult('pass')}
            className={`flex-1 py-3 rounded-lg font-bold transition-colors touch-target ${
              result?.status === 'pass'
                ? 'bg-green-500 text-white'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            <Check className="w-6 h-6 mx-auto" />
          </button>
          <button
            onClick={() => onResult('fail')}
            className={`flex-1 py-3 rounded-lg font-bold transition-colors touch-target ${
              result?.status === 'fail'
                ? 'bg-red-500 text-white'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            <X className="w-6 h-6 mx-auto" />
          </button>
          <button
            onClick={() => onResult('na')}
            className={`flex-1 py-3 rounded-lg font-bold transition-colors touch-target ${
              result?.status === 'na'
                ? 'bg-slate-500 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Minus className="w-6 h-6 mx-auto" />
          </button>
        </div>
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
