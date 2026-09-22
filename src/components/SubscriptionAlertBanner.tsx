import React, { useState } from 'react';
import { 
  CreditCard, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  Upload, 
  X, 
  QrCode,
  ExternalLink,
  RefreshCw,
  Lock,
  ShieldAlert
} from 'lucide-react';
import { UserSubscription } from '../types';
import { submitUserPaymentSlip } from '../services/firestoreSync';
import { compressAndEncodeImage, validateImageFile } from '../utils/imageUpload';

interface SubscriptionAlertBannerProps {
  userSubscription?: UserSubscription;
  userId?: string;
  userEmail?: string | null;
  isSuperAdmin?: boolean;
  onSubscriptionUpdated?: (updated: UserSubscription) => void;
}

export const SubscriptionAlertBanner: React.FC<SubscriptionAlertBannerProps> = ({
  userSubscription,
  userId,
  userEmail,
  isSuperAdmin = false,
  onSubscriptionUpdated,
}) => {
  const [showPayModal, setShowPayModal] = useState(false);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [isSubmittingSlip, setIsSubmittingSlip] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 1. FREE PLAN / SUPER ADMIN: Strictly bypass all expiry checks, hide all banners, no modals or locks!
  if (isSuperAdmin || !userSubscription || userSubscription.planType === 'free') {
    return null;
  }

  const { paymentStatus, validUntil, monthlyFee = 499, qrCodeUrl, lastSubmittedSlip } = userSubscription;

  // 2. Calculate remaining days & expiry state
  let daysRemaining = 0;
  let isDateExpired = false;
  if (validUntil) {
    const diffMs = new Date(validUntil).getTime() - Date.now();
    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    isDateExpired = diffMs <= 0;
  } else {
    // If paid plan has no validUntil configured yet, treat as expired
    isDateExpired = true;
    daysRemaining = 0;
  }

  const isVerificationPending = paymentStatus === 'verification_pending';
  const isExpired = (isDateExpired || paymentStatus === 'expired') && !isVerificationPending;
  const isExpiringWithin2Days = !isExpired && !isVerificationPending && daysRemaining > 0 && daysRemaining <= 2;

  // If not expired, not expiring within 2 days, and not pending verification -> NO alert needed
  if (!isExpired && !isExpiringWithin2Days && !isVerificationPending) {
    return null;
  }

  // Format Hindi date
  const formatHindiDate = (isoStr?: string) => {
    if (!isoStr) return 'शीघ्र';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return isoStr;
    }
  };

  const handleSlipFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setSubmitError(validation.error || 'अमान्य फ़ाइल प्रकार');
      return;
    }

    try {
      setSubmitError(null);
      setSlipFile(file);
      const encoded = await compressAndEncodeImage(file, {
        maxDimension: 800,
        quality: 0.85,
        maxSizeBytes: 400 * 1024,
      });
      setSlipPreview(encoded);
    } catch (err: any) {
      console.error('Failed to process payment slip image:', err);
      setSubmitError(err?.message || 'छवि पढ़ने में विफल। कृपया दूसरी फ़ाइल का प्रयास करें।');
    }
  };

  const handleSubmitSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !slipPreview) {
      setSubmitError('कृपया पहले भुगतान का स्क्रीनशॉट या रसीद चुनें।');
      return;
    }

    try {
      setIsSubmittingSlip(true);
      setSubmitError(null);

      const updatedSub = await submitUserPaymentSlip(userId, {
        slipUrl: slipPreview,
        utrNumber: utrNumber.trim() || undefined,
        amountPaid: monthlyFee,
        submittedAt: new Date().toISOString(),
      });

      // Instantly update parent state to lift any blocking lock
      onSubscriptionUpdated?.(updatedSub);

      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        setSlipFile(null);
        setSlipPreview(null);
        setUtrNumber('');
        setShowPayModal(false);
      }, 3000);
    } catch (err: any) {
      console.error('Failed to submit slip:', err);
      setSubmitError('भुगतान रसीद जमा करने में विफल। कृपया इंटरनेट कनेक्शन जांचें।');
    } finally {
      setIsSubmittingSlip(false);
    }
  };

  // Reusable Payment & Slip Upload Modal Body
  const renderPayModalContent = (isMandatoryLock: boolean) => (
    <div 
      className="bg-slate-900 border border-slate-700/90 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
            {isMandatoryLock ? <Lock className="w-5 h-5 text-rose-400" /> : <CreditCard className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {isMandatoryLock ? 'सब्सक्रिप्शन नवीनीकरण आवश्यक' : 'Renew Paid Subscription'}
            </h3>
            <p className="text-[11px] text-amber-300 font-semibold">
              मासिक शुल्क: <span className="font-extrabold text-white text-xs">₹{monthlyFee}</span> / माह
            </p>
          </div>
        </div>
        {!isMandatoryLock && (
          <button
            type="button"
            onClick={() => setShowPayModal(false)}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
        {/* Status Notice if Slip Already Submitted or Just Submitted */}
        {(submitSuccess || isVerificationPending) && (
          <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs flex items-start gap-2 shadow-sm animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              <strong>भुगतान रसीद सत्यापन हेतु लंबित है।</strong> (Payment slip submitted! Pending admin verification, your account remains active.)
            </span>
          </div>
        )}

        {isMandatoryLock && !submitSuccess && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2 shadow-sm">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>
              आपके खाते की निर्धारित अवधि समाप्त हो चुकी है। दैनिक प्रविष्टि जारी रखने के लिए कृपया नीचे दिए गए QR कोड पर मासिक शुल्क <strong>₹{monthlyFee}</strong> का भुगतान कर रसीद अपलोड करें।
            </span>
          </div>
        )}

        {/* User-Specific Monthly Fee Card */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span className="text-xs text-slate-300">देय मासिक शुल्क (Monthly Plan Fee):</span>
          <span className="text-base font-black text-amber-300">₹{monthlyFee} <span className="text-xs font-normal text-slate-400">/ माह</span></span>
        </div>

        {/* UPI QR Code Container */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center space-y-2">
          <span className="text-xs font-semibold text-slate-200 block">
            UPI QR Code (Google Pay / PhonePe / Paytm / BHIM)
          </span>
          <p className="text-[10px] text-slate-400">
            QR कोड स्कैन करें या ₹{monthlyFee} का भुगतान कर स्क्रीनशॉट नीचे अपलोड करें।
          </p>

          {qrCodeUrl ? (
            <div className="inline-block p-3 bg-white rounded-xl shadow-lg my-1 border border-slate-300">
              <img
                src={qrCodeUrl}
                alt="User UPI QR Code"
                referrerPolicy="no-referrer"
                className="w-48 h-48 object-contain mx-auto"
              />
            </div>
          ) : (
            <div className="py-6 px-4 bg-slate-900/60 rounded-xl border border-slate-800/80 text-center text-slate-400 text-xs space-y-1">
              <QrCode className="w-8 h-8 text-amber-400/60 mx-auto" />
              <p className="font-medium text-slate-300">UPI QR Code Configured by Master Admin</p>
              <p className="text-[11px] text-slate-500">
                कृपया व्यवस्थापक को ₹{monthlyFee} का भुगतान कर स्क्रीनशॉट नीचे जमा करें।
              </p>
            </div>
          )}

          <div className="text-xs text-amber-300 font-extrabold pt-1">
            भुगतान राशि: ₹{monthlyFee}
          </div>
        </div>

        {/* Payment Slip / Screenshot Uploader Form */}
        <form onSubmit={handleSubmitSlip} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span>भुगतान रसीद / स्क्रीनशॉट (Payment Screenshot) *</span>
              {slipPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setSlipPreview(null);
                    setSlipFile(null);
                  }}
                  className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                >
                  छवि हटाएं
                </button>
              )}
            </label>

            <div className="relative border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-3 text-center transition bg-slate-950/60 cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleSlipFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center justify-center space-y-1 pointer-events-none py-1">
                <Upload className="w-5 h-5 text-blue-400" />
                <span className="text-xs font-semibold text-slate-300">
                  {slipFile ? slipFile.name : 'स्क्रीनशॉट चुनने के लिए क्लिक करें'}
                </span>
                <span className="text-[10px] text-slate-500">PNG, JPG, WEBP (ऑटो-कंप्रेस्ड)</span>
              </div>
            </div>

            {slipPreview && (
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
                <img
                  src={slipPreview}
                  alt="Payment Slip Preview"
                  className="w-14 h-14 object-cover rounded-lg border border-slate-700 shrink-0"
                />
                <div className="text-xs min-w-0">
                  <span className="text-emerald-400 font-bold block">रसीद संलग्न हो गई</span>
                  <span className="text-[11px] text-slate-400 truncate block">सत्यापन हेतु जमा करने के लिए तैयार</span>
                </div>
              </div>
            )}
          </div>

          {/* UTR / Reference Number */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-200 block">
              UTR / UPI Transaction Reference Number (वैकल्पिक)
            </label>
            <input
              type="text"
              value={utrNumber}
              onChange={(e) => setUtrNumber(e.target.value)}
              placeholder="उदा. 423985729103 या UPI Ref ID"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {submitError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
              {submitError}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-800">
            {!isMandatoryLock && (
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition"
              >
                बंद करें
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmittingSlip || !slipPreview}
              className="w-full sm:w-auto px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition shadow-emerald-600/30"
            >
              {isSubmittingSlip ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>जमा हो रहा है...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>रसीद जमा करें (Submit Slip)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // 3. CASE: Expired & paymentStatus !== 'verification_pending' -> BLOCK ROUTINE ENTRY
  if (isExpired) {
    return (
      <div 
        id="subscription-blocking-screen"
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/95 backdrop-blur-md animate-in fade-in"
      >
        {renderPayModalContent(true)}
      </div>
    );
  }

  // 4. CASE: paymentStatus === 'verification_pending' -> Keep accessible with gentle notice
  if (isVerificationPending) {
    return (
      <>
        <div 
          id="subscription-banner-pending"
          className="bg-blue-950/80 border-b border-blue-800 px-4 py-2.5 text-xs text-blue-100 flex items-center justify-between gap-3 shadow-inner"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400 shrink-0 animate-pulse" />
            <span>
              <strong>भुगतान रसीद सत्यापन हेतु लंबित है।</strong> (Payment slip submitted! Pending admin verification, your account remains active.)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowPayModal(true)}
            className="text-xs text-blue-300 hover:text-white underline font-semibold cursor-pointer shrink-0"
          >
            विवरण / QR देखें
          </button>
        </div>
        {showPayModal && (
          <div 
            id="subscription-pay-modal-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in"
            onClick={() => setShowPayModal(false)}
          >
            {renderPayModalContent(false)}
          </div>
        )}
      </>
    );
  }

  // 5. CASE: Expiring within 2 days -> Clear top alert banner: "आपका सब्सक्रिप्शन [तारीख] को समाप्त हो रहा है। [Renew Now]"
  if (isExpiringWithin2Days) {
    const formattedHindi = formatHindiDate(validUntil);
    return (
      <>
        <div 
          id="subscription-banner-expiring"
          className="bg-amber-950/90 border-b border-amber-800 px-4 py-2.5 text-xs text-amber-100 flex items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>आपका सब्सक्रिप्शन {formattedHindi} को समाप्त हो रहा है।</strong> ({daysRemaining === 1 ? '1 दिन शेष' : `${daysRemaining} दिन शेष`} • मासिक शुल्क: ₹{monthlyFee})
            </span>
          </div>
          <button
            type="button"
            id="subscription-renew-now-btn"
            onClick={() => setShowPayModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow transition shrink-0 cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Renew Now</span>
          </button>
        </div>
        {showPayModal && (
          <div 
            id="subscription-pay-modal-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in"
            onClick={() => setShowPayModal(false)}
          >
            {renderPayModalContent(false)}
          </div>
        )}
      </>
    );
  }

  return null;
};
