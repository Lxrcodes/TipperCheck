import { useState, useRef, useEffect } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Minus,
  Camera,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  Fuel,
  AlertCircle,
} from 'lucide-react';
import type { VehicleType, CheckStatus, FuelLevel, CheckInputType } from '@/types';
import { FUEL_LEVELS, DEFAULT_CHECK_TEMPLATE } from '@/types';

type DemoResult = 'pass' | 'fail' | 'na' | null;

interface DemoItemResult {
  status: DemoResult;
  fuel_level?: FuelLevel;
}

interface DemoCheckWizardProps {
  vehicleReg: string;
  vehicleType: VehicleType;
  driverName: string;
  onComplete: (status: CheckStatus) => void;
}

type WizardStep = 'intro' | 'reg_photo' | 'category' | 'notes' | 'confirmations' | 'summary' | 'signature' | 'complete';

export function DemoCheckWizard({ vehicleReg, vehicleType, driverName, onComplete }: DemoCheckWizardProps) {
  const SAVE_KEY = `demo_check_${vehicleReg}`;

  const [step, setStep] = useState<WizardStep>('intro');
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [results, setResults] = useState<Map<string, DemoItemResult>>(new Map());
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [regPhoto, setRegPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeDefectItem, setActiveDefectItem] = useState<string | null>(null);
  const [defectNote, setDefectNote] = useState('');

  // Notes
  const [defectRepairNotes, setDefectRepairNotes] = useState('');
  const [headOfficeNotes, setHeadOfficeNotes] = useState('');

  // Confirmations
  const [vehicleFitConfirmed, setVehicleFitConfirmed] = useState(false);
  const [driverFitConfirmed, setDriverFitConfirmed] = useState(false);

  const regPhotoInputRef = useRef<HTMLInputElement>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);

  const template = DEFAULT_CHECK_TEMPLATE;
  const currentCategory = template.categories[currentCategoryIndex];
  const totalCategories = template.categories.length;
  const progress = ((currentCategoryIndex + 1) / totalCategories) * 100;

  // Restore saved progress on mount
  useEffect(() => {
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return;
    try {
      const s = JSON.parse(saved);
      if (!s.step || s.step === 'intro' || s.step === 'complete') return;
      setStep(s.step);
      setCurrentCategoryIndex(s.currentCategoryIndex ?? 0);
      setResults(new Map(s.results ?? []));
      if (s.startedAt) setStartedAt(new Date(s.startedAt));
      setVehicleFitConfirmed(s.vehicleFitConfirmed ?? false);
      setDriverFitConfirmed(s.driverFitConfirmed ?? false);
      setDefectRepairNotes(s.defectRepairNotes ?? '');
      setHeadOfficeNotes(s.headOfficeNotes ?? '');
      if (s.regPhoto) setRegPhoto(s.regPhoto);
      if (s.signature) setSignature(s.signature);
    } catch {
      localStorage.removeItem(SAVE_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save progress whenever state changes
  useEffect(() => {
    if (step === 'intro') return;
    if (step === 'complete') {
      localStorage.removeItem(SAVE_KEY);
      return;
    }
    const state = {
      step,
      currentCategoryIndex,
      results: Array.from(results.entries()),
      startedAt: startedAt?.toISOString() ?? null,
      vehicleFitConfirmed,
      driverFitConfirmed,
      defectRepairNotes,
      headOfficeNotes,
      signature,
    };
    // Try with photo first; fall back without if storage is full
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, regPhoto }));
    } catch {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      } catch { /* storage unavailable */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentCategoryIndex, results, startedAt, vehicleFitConfirmed, driverFitConfirmed, defectRepairNotes, headOfficeNotes, regPhoto, signature]);

  // Restore signature onto canvas when returning to signature step
  useEffect(() => {
    if (step !== 'signature' || !signature || !signatureCanvasRef.current) return;
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = signature;
  }, [step, signature]);

  // Timer effect
  useEffect(() => {
    if (!startedAt) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
      setElapsedSeconds(diff);
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartCheck = () => {
    setStartedAt(new Date());
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

  const handleSkipRegPhoto = () => {
    setStep('category');
  };

  const handleRegPhotoNext = () => {
    setStep('category');
  };

  const handleItemResult = (itemId: string, result: DemoResult, fuelLevel?: FuelLevel) => {
    const existingResult = results.get(itemId);

    // If clicking defect and it's not already a defect, show the modal
    if (result === 'fail' && existingResult?.status !== 'fail') {
      setActiveDefectItem(itemId);
    } else {
      const newResults = new Map(results);
      newResults.set(itemId, { status: result, fuel_level: fuelLevel });
      setResults(newResults);
    }
  };

  const handleFuelLevelSelect = (itemId: string, level: FuelLevel) => {
    const newResults = new Map(results);
    newResults.set(itemId, { status: 'pass', fuel_level: level });
    setResults(newResults);
  };

  const handleDefectConfirm = () => {
    if (!activeDefectItem) return;
    const newResults = new Map(results);
    newResults.set(activeDefectItem, { status: 'fail' });
    setResults(newResults);
    setActiveDefectItem(null);
    setDefectNote('');
  };

  const handleDefectCancel = () => {
    setActiveDefectItem(null);
    setDefectNote('');
  };

  const allItemsInCategoryChecked = () => {
    return currentCategory.items.every((item) => results.has(item.id));
  };

  const handleNextCategory = () => {
    if (currentCategoryIndex < totalCategories - 1) {
      setCurrentCategoryIndex(currentCategoryIndex + 1);
    } else {
      // Check if there are any defects to show notes step
      const hasDefects = Array.from(results.values()).some((r) => r.status === 'fail');
      if (hasDefects) {
        setStep('notes');
      } else {
        setStep('confirmations');
      }
    }
  };

  const handlePrevCategory = () => {
    if (currentCategoryIndex > 0) {
      setCurrentCategoryIndex(currentCategoryIndex - 1);
    }
  };

  const getOverallStatus = (): CheckStatus => {
    const hasCriticalDefects = Array.from(results.entries()).some(([itemId, r]) => {
      if (r.status !== 'fail') return false;
      const item = template.categories.flatMap(c => c.items).find(i => i.id === itemId);
      return item?.is_critical;
    });

    if (hasCriticalDefects) return 'do_not_drive';

    const hasDefects = Array.from(results.values()).some((r) => r.status === 'fail');
    return hasDefects ? 'defects' : 'pass';
  };

  // Simple signature drawing
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = signatureCanvasRef.current;
    if (canvas) {
      setSignature(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature(null);
  };

  const handleSubmit = () => {
    setStep('complete');
    setTimeout(() => {
      onComplete(getOverallStatus());
    }, 2000);
  };

  // Get the active defect item details
  const getActiveDefectItemDetails = () => {
    if (!activeDefectItem) return null;
    return template.categories.flatMap(c => c.items).find(i => i.id === activeDefectItem);
  };

  // ============================================================================
  // Intro Step
  // ============================================================================
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-500 rounded-2xl mb-6">
              <Truck className="w-12 h-12 text-white" />
            </div>

            <div className="bg-slate-800 rounded-xl p-4 mb-6">
              <div className="text-3xl font-mono font-bold text-white tracking-wider">
                {vehicleReg}
              </div>
              <div className="text-slate-400 text-sm mt-1 capitalize">{vehicleType.replace('_', ' ')}</div>
            </div>

            <h1 className="text-xl font-heading text-white mb-2">Try Your First Check</h1>
            <p className="text-slate-400 mb-8">
              Experience how easy daily vehicle checks are with CheckaTruck. This is a demo - no data will be saved until you subscribe.
            </p>

            <div className="bg-slate-800 rounded-lg p-4 mb-6 text-left">
              <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">What you'll do:</h3>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  Take a photo of the registration plate
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  Walk around and check {template.categories.length} areas
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  Confirm vehicle and driver fitness
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  Sign to confirm your check
                </li>
              </ul>
            </div>

            <button
              onClick={handleStartCheck}
              className="w-full py-4 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
            >
              Start Demo Check
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Reg Photo Step
  // ============================================================================
  if (step === 'reg_photo') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400 font-mono">{formatTime(elapsedSeconds)}</span>
            </div>
            <span className="font-mono font-bold text-white">{vehicleReg}</span>
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
                <input
                  ref={regPhotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleRegPhotoCapture}
                  className="hidden"
                />
                <button
                  onClick={() => regPhotoInputRef.current?.click()}
                  className="w-full py-12 border-2 border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-orange-500 hover:text-orange-500 transition-colors flex flex-col items-center gap-2"
                >
                  <Camera className="w-8 h-8" />
                  <span>Tap to take photo</span>
                </button>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleRegPhotoNext}
                disabled={!regPhoto}
                className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                Continue
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={handleSkipRegPhoto}
                className="w-full py-3 text-slate-400 hover:text-white transition-colors"
              >
                Skip for demo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Category Check Step
  // ============================================================================
  if (step === 'category') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-slate-400 font-mono">{formatTime(elapsedSeconds)}</span>
              </div>
              <span className="text-xs text-slate-500">10 mins advised</span>
            </div>
            <span className="font-mono font-bold text-white">{vehicleReg}</span>
          </div>
          {/* Progress bar */}
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
            {currentCategory.items.map((item) => {
              const result = results.get(item.id);
              return (
                <div
                  key={item.id}
                  className="bg-slate-800 rounded-lg p-4"
                >
                  <div className="flex items-start gap-2 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-medium">{item.label}</h3>
                        {item.is_critical && (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      {item.description && (
                        <p className="text-slate-400 text-sm">{item.description}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    {item.input_type === 'fuel_level' ? (
                      <FuelLevelSelector
                        selected={result?.fuel_level}
                        onSelect={(level) => handleFuelLevelSelect(item.id, level)}
                      />
                    ) : (
                      <CheckButtons
                        inputType={item.input_type}
                        selected={result?.status}
                        onResult={(status) => handleItemResult(item.id, status)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-800 p-4">
          <div className="flex gap-3">
            {currentCategoryIndex > 0 && (
              <button
                onClick={handlePrevCategory}
                className="py-3 px-4 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-500 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={handleNextCategory}
              disabled={!allItemsInCategoryChecked()}
              className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {currentCategoryIndex < totalCategories - 1 ? 'Next' : 'Continue'}
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Defect Modal */}
        {activeDefectItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Report Defect</h3>
              <p className="text-slate-600 mb-4">
                {getActiveDefectItemDetails()?.label}
              </p>
              {getActiveDefectItemDetails()?.is_critical && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm text-red-700">This is a critical item. A defect here means the vehicle should not be driven.</span>
                </div>
              )}
              <textarea
                value={defectNote}
                onChange={(e) => setDefectNote(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg mb-4"
                rows={3}
                placeholder="Describe the defect (optional for demo)..."
              />
              <div className="flex gap-3">
                <button
                  onClick={handleDefectCancel}
                  className="flex-1 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDefectConfirm}
                  className="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg"
                >
                  Confirm Defect
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // Notes Step (only shown if defects found)
  // ============================================================================
  if (step === 'notes') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Post-Check Notes</span>
            <span className="font-mono font-bold text-white">{vehicleReg}</span>
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

  // ============================================================================
  // Confirmations Step
  // ============================================================================
  if (step === 'confirmations') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Confirmations</span>
            <span className="font-mono font-bold text-white">{vehicleReg}</span>
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

  // ============================================================================
  // Summary Step
  // ============================================================================
  if (step === 'summary') {
    const status = getOverallStatus();
    const defectCount = Array.from(results.values()).filter((r) => r.status === 'fail').length;

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Check Summary</span>
            <span className="font-mono font-bold text-white">{vehicleReg}</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="text-center mb-6">
            {status === 'pass' ? (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-full mb-4">
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl font-bold text-green-400">All Clear</h2>
                <p className="text-slate-400">Vehicle fit for use</p>
              </>
            ) : status === 'defects' ? (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500 rounded-full mb-4">
                  <AlertTriangle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl font-bold text-amber-400">Minor Issues</h2>
                <p className="text-slate-400">{defectCount} defect{defectCount > 1 ? 's' : ''} found - Vehicle fit for use with notes</p>
              </>
            ) : (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500 rounded-full mb-4">
                  <XCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl font-bold text-red-400">Defects Found</h2>
                <p className="text-slate-400">Vehicle NOT fit for use - seek advice before proceeding</p>
              </>
            )}
          </div>

          {/* Results by category */}
          {template.categories.map((cat) => (
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
                      <div className="flex items-center gap-2">
                        <span className="text-white">{item.label}</span>
                        {item.is_critical && <AlertCircle className="w-3 h-3 text-red-500" />}
                      </div>
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
          <button
            onClick={() => setStep('signature')}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
          >
            Sign to Complete
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Signature Step
  // ============================================================================
  if (step === 'signature') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="bg-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep('summary')}
              className="text-slate-400 hover:text-white"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-mono font-bold text-white">{vehicleReg}</span>
            <div className="w-5" />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md">
            <h2 className="text-xl font-bold text-white text-center mb-2">Sign Your Check</h2>
            <p className="text-slate-400 text-center mb-6">
              Your signature confirms you completed this check.
            </p>

            <div className="bg-white rounded-lg p-2 mb-4">
              <canvas
                ref={signatureCanvasRef}
                width={300}
                height={150}
                className="w-full border border-slate-200 rounded touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>

            <button
              onClick={clearSignature}
              className="w-full py-2 text-slate-400 hover:text-white mb-4"
            >
              Clear signature
            </button>

            <p className="text-xs text-slate-500 text-center mb-4">
              I, <span className="text-white">{driverName}</span>, confirm I have completed this vehicle check to the best of my ability.
            </p>

            <button
              onClick={handleSubmit}
              disabled={!signature}
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Complete Demo Check
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Complete Step
  // ============================================================================
  if (step === 'complete') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500 rounded-full mb-6">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-heading text-white mb-2">Demo Complete!</h1>
          <p className="text-slate-400">
            That's how easy it is to keep your fleet compliant.
          </p>
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin mx-auto mt-6" />
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================================
// Fuel Level Selector Component
// ============================================================================

function FuelLevelSelector({ selected, onSelect }: { selected?: FuelLevel; onSelect: (level: FuelLevel) => void }) {
  return (
    <div className="flex gap-2">
      {FUEL_LEVELS.map((level) => (
        <button
          key={level.value}
          onClick={() => onSelect(level.value)}
          className={`flex-1 py-3 font-bold rounded-lg transition-colors flex flex-col items-center gap-1 ${
            selected === level.value
              ? 'bg-green-600 text-white'
              : 'bg-slate-700 text-white hover:bg-slate-600'
          }`}
        >
          <Fuel className={`w-5 h-5 ${
            selected === level.value ? 'text-white' :
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
  );
}

// ============================================================================
// Check Buttons Component
// ============================================================================

function CheckButtons({
  inputType,
  selected,
  onResult
}: {
  inputType: CheckInputType;
  selected?: DemoResult;
  onResult: (status: DemoResult) => void;
}) {
  if (inputType === 'yes_no') {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => onResult('pass')}
          className={`flex-1 py-3 font-bold rounded-lg transition-colors ${
            selected === 'pass'
              ? 'bg-green-600 text-white'
              : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
          }`}
        >
          Yes
        </button>
        <button
          onClick={() => onResult('fail')}
          className={`flex-1 py-3 font-bold rounded-lg transition-colors ${
            selected === 'fail'
              ? 'bg-red-600 text-white'
              : 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
          }`}
        >
          No
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => onResult('pass')}
        className={`flex-1 py-3 font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${
          selected === 'pass'
            ? 'bg-green-600 text-white'
            : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
        }`}
      >
        <Check className="w-5 h-5" />
        OK
      </button>
      <button
        onClick={() => onResult('fail')}
        className={`flex-1 py-3 font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${
          selected === 'fail'
            ? 'bg-red-600 text-white'
            : 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
        }`}
      >
        <X className="w-5 h-5" />
        Defect
      </button>
      {inputType === 'pass_fail_na' && (
        <button
          onClick={() => onResult('na')}
          className={`py-3 px-4 font-bold rounded-lg transition-colors ${
            selected === 'na'
              ? 'bg-slate-600 text-white'
              : 'bg-slate-600/20 text-slate-400 hover:bg-slate-600/30'
          }`}
        >
          <Minus className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
