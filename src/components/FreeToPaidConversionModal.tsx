import React, { useState, useEffect } from 'react';
import { 
  X, 
  CreditCard, 
  Calendar, 
  QrCode, 
  Upload, 
  Check, 
  RefreshCw, 
  Trash2, 
  ExternalLink,
  Sparkles,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { AppUser } from '../types';
import { compressAndEncodeImage, validateImageFile } from '../utils/imageUpload';

interface FreeToPaidConversionModalProps {
  user: AppUser | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    user: AppUser, 
    config: { monthlyFee: number; validUntil: string; qrCodeUrl: string }
  ) => Promise<void>;
}

export const FreeToPaidConversionModal: React.FC<FreeToPaidConversionModalProps> = ({
  user,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [monthlyFee, setMonthlyFee] = useState<number>(499);
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [durationDays, setDurationDays] = useState<number>(30);
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [useCustomEndDate, setUseCustomEndDate] = useState<boolean>(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isUploadingQr, setIsUploadingQr] = useState<boolean>(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initialize from user when opened
  useEffect(() => {
    if (user && isOpen) {
      const sub = user.subscription;
      const initialFee = (sub && sub.monthlyFee > 0) ? sub.monthlyFee : 499;
      setMonthlyFee(initialFee);
      setStartDate(new Date().toISOString().slice(0, 10));
      setDurationDays(30);
      setUseCustomEndDate(false);
      setCustomEndDate('');
      setQrCodeUrl(sub?.qrCodeUrl || '');
      setQrError(null);
    }
  }, [user, isOpen]);

  // Smooth Escape key handler to return smoothly without freeze
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !isUploadingQr) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting, isUploadingQr]);

  // Calculate final validUntil date (Hooks MUST be before any early return)
  const calculatedValidUntil = React.useMemo(() => {
    if (useCustomEndDate && customEndDate) {
      const d = new Date(customEndDate);
      d.setHours(23, 59, 59, 999);
      return d.toISOString();
    }
    const start = new Date(startDate);
    const end = new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }, [startDate, durationDays, useCustomEndDate, customEndDate]);

  if (!isOpen || !user) return null;

  const handleQrFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setQrError(validation.error || 'Invalid image file');
      return;
    }

    setIsUploadingQr(true);
    setQrError(null);
    try {
      const dataUrl = await compressAndEncodeImage(file, {
        maxDimension: 800,
        quality: 0.85,
        maxSizeBytes: 400 * 1024,
      });
      setQrCodeUrl(dataUrl);
    } catch (err: any) {
      console.error('Failed to compress QR image:', err);
      setQrError(err.message || 'Failed to process QR image.');
    } finally {
      setIsUploadingQr(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      await onConfirm(user, {
        monthlyFee: Math.max(0, monthlyFee),
        validUntil: calculatedValidUntil,
        qrCodeUrl: qrCodeUrl.trim(),
      });
      onClose();
    } catch (err) {
      console.error('Failed to convert user to paid plan:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      id="free-to-paid-conversion-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Convert to Paid Plan</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-500 text-slate-950">
                  Switch Plan
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Set monthly fee, assign validity start date, and upload tenant UPI QR code.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Card Summary */}
        <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between gap-3 text-xs">
          <div className="min-w-0">
            <span className="text-slate-400">Target Tenant: </span>
            <strong className="text-white font-semibold">
              {user.displayName || user.name || 'Tenant User'}
            </strong>
            <span className="text-slate-400 ml-1.5 font-mono text-[11px]">({user.email})</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
            Currently Free
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* STEP 1: Monthly Fee */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-amber-400" />
                <span>1. Monthly Fee (INR ₹)</span>
              </label>
              <span className="text-xs text-amber-300 font-extrabold">₹{monthlyFee} / month</span>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-amber-500 transition"
                placeholder="499"
              />
            </div>

            {/* Quick Fee Presets */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[11px] text-slate-500 mr-1">Quick Select:</span>
              {[199, 299, 499, 999, 1499, 1999].map((fee) => (
                <button
                  key={fee}
                  type="button"
                  onClick={() => setMonthlyFee(fee)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    monthlyFee === fee
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-sm'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  ₹{fee}
                </button>
              ))}
            </div>
          </div>

          {/* STEP 2: Validity Start Date & Duration */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>2. Validity Start Date & Plan Duration</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Validity Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Plan Period / Duration</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { label: '30 Days', days: 30 },
                    { label: '60 Days', days: 60 },
                    { label: '90 Days', days: 90 },
                    { label: '1 Year', days: 365 },
                  ].map((dur) => (
                    <button
                      key={dur.days}
                      type="button"
                      onClick={() => {
                        setDurationDays(dur.days);
                        setUseCustomEndDate(false);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                        !useCustomEndDate && durationDays === dur.days
                          ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-sm'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {dur.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setUseCustomEndDate(true)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      useCustomEndDate
                        ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-sm'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    Custom End
                  </button>
                </div>
              </div>
            </div>

            {useCustomEndDate && (
              <div className="pt-1">
                <label className="text-[11px] text-slate-400 block mb-1">Specific End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            )}

            {/* Calculated Preview Box */}
            <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-800/50 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-blue-200">
                <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  Access valid until: <strong>{new Date(calculatedValidUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                </span>
              </div>
              <span className="text-[11px] text-emerald-400 font-bold">
                {Math.ceil((new Date(calculatedValidUntil).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))} Days Validity
              </span>
            </div>
          </div>

          {/* STEP 3: User-Specific UPI Payment QR Code */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-amber-400" />
                <span>3. User-Specific UPI Payment QR Code</span>
              </label>
              {qrCodeUrl && (
                <button
                  type="button"
                  onClick={() => setQrCodeUrl('')}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove QR</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Upload tenant's specific UPI QR code (GPay, PhonePe, Paytm). The user will scan this when paying.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              {/* Upload Dropzone */}
              <div className="relative border-2 border-dashed border-slate-700 hover:border-amber-500/60 rounded-xl p-3 text-center transition bg-slate-900 cursor-pointer">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  onChange={handleQrFileSelect}
                  disabled={isUploadingQr}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex flex-col items-center justify-center space-y-1.5 pointer-events-none py-1">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                    {isUploadingQr ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    ) : (
                      <Upload className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-200">
                    {isUploadingQr ? 'Processing...' : 'Upload UPI QR Image'}
                  </p>
                  <p className="text-[10px] text-slate-500">PNG, JPG, WEBP</p>
                </div>
              </div>

              {/* QR Preview Box */}
              <div>
                {qrCodeUrl ? (
                  <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-700 flex items-center gap-3">
                    <div className="w-16 h-16 bg-white rounded-lg p-1 border border-slate-300 flex items-center justify-center shrink-0">
                      <img
                        src={qrCodeUrl}
                        alt="QR Code Preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 text-xs">
                      <span className="font-bold text-emerald-400 block">QR Ready</span>
                      <span className="text-[11px] text-slate-400 block truncate">
                        Tenant will see this in their payment modal.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
                    No QR uploaded yet. You can also upload or update it later.
                  </div>
                )}
              </div>
            </div>

            {qrError && (
              <p className="text-xs text-rose-400">{qrError}</p>
            )}

            {/* Direct URL Fallback */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Or Direct QR Image URL (Optional):</label>
              <input
                type="url"
                value={qrCodeUrl}
                onChange={(e) => setQrCodeUrl(e.target.value.trim())}
                placeholder="https://.../upi-qr.png"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Back / Cancel (वापस जाएं)
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-md shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Converting...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirm & Convert to Paid Plan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
