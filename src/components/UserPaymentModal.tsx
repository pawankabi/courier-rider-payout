import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  AlertCircle, 
  CheckCircle2, 
  Upload, 
  X, 
  RefreshCw, 
  Lock, 
  ShieldCheck, 
  Clock, 
  History, 
  LogOut, 
  Receipt, 
  QrCode, 
  Zap, 
  Copy, 
  Check, 
  Sparkles, 
  CheckCheck, 
  Flame, 
  Award,
  Layers,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { auth } from '../firebase';
import { UserSubscription, PaymentHistoryItem, checkSubscriptionLock } from '../types';
import { submitUserPaymentSlip, getDefaultSubscriptionConfig } from '../services/firestoreSync';
import { 
  SUBSCRIPTION_PLANS, 
  SubscriptionPlan, 
  PayuTransactionResult, 
  executePayuAutoApproval 
} from '../services/payuCheckout';
import { 
  RAZORPAY_PLANS, 
  RazorpayPlan, 
  openRazorpayCheckout, 
  executeRazorpayAutoApproval,
  getRazorpayKeyId 
} from '../services/razorpayCheckout';
import { PayuCheckoutModal } from './PayuCheckoutModal';
import { RazorpaySuccessModal } from './RazorpaySuccessModal';
import { compressAndEncodeImage, validateImageFile } from '../utils/imageUpload';
import { formatINR } from '../utils/formatters';

export interface UserPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userSubscription?: UserSubscription;
  userId: string;
  userEmail?: string | null;
  userName?: string;
  userPhone?: string;
  masterQrCodeUrl?: string;
  isSuperAdmin?: boolean;
  onSubscriptionUpdated?: (updated: UserSubscription) => void;
  onSuccessToast?: (msg: string) => void;
  activeTabDefault?: 'plans' | 'qr' | 'history';
  reason?: 'free_limit_reached' | 'cloud_backup' | 'expired' | 'manual' | string;
}

export const UserPaymentModal: React.FC<UserPaymentModalProps> = ({
  isOpen,
  onClose,
  userSubscription,
  userId,
  userEmail,
  userName = 'Hub Manager',
  userPhone,
  masterQrCodeUrl,
  isSuperAdmin = false,
  onSubscriptionUpdated,
  onSuccessToast,
  activeTabDefault = 'plans',
  reason,
}) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'qr' | 'history'>(activeTabDefault);
  const [selectedPlanId, setSelectedPlanId] = useState<'1_month' | '3_months' | '1_year'>('3_months');
  const [isPayuCheckoutOpen, setIsPayuCheckoutOpen] = useState(false);
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false);
  const [razorpaySuccessData, setRazorpaySuccessData] = useState<{
    plan: RazorpayPlan;
    paymentId: string;
    validUntil?: string;
  } | null>(null);
  const [razorpayError, setRazorpayError] = useState<string | null>(null);

  // Manual QR Slip State
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [isSubmittingSlip, setIsSubmittingSlip] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [liveDefaultQr, setLiveDefaultQr] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const upiId = 'pawankabiseraikella@okaxis';

  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === selectedPlanId) || SUBSCRIPTION_PLANS[1];

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  useEffect(() => {
    if (!userSubscription?.qrCodeUrl && !masterQrCodeUrl) {
      getDefaultSubscriptionConfig()
        .then((cfg) => {
          if (cfg?.qrCodeUrl) {
            setLiveDefaultQr(cfg.qrCodeUrl);
          }
        })
        .catch(() => {});
    }
  }, [userSubscription?.qrCodeUrl, masterQrCodeUrl]);

  // Smooth Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isPayuCheckoutOpen) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isPayuCheckoutOpen]);

  if (!isOpen) return null;
  if (isSuperAdmin) return null;

  const lockStatus = checkSubscriptionLock(userSubscription, isSuperAdmin);
  const isStrictlyLocked = lockStatus.isLocked;

  const activeQrUrl = (userSubscription?.qrCodeUrl && userSubscription.qrCodeUrl.trim().length > 0)
    ? userSubscription.qrCodeUrl
    : (masterQrCodeUrl && masterQrCodeUrl.trim().length > 0 ? masterQrCodeUrl : liveDefaultQr);

  const paymentHistory: PaymentHistoryItem[] = Array.isArray(userSubscription?.paymentHistory)
    ? userSubscription.paymentHistory
    : [];

  const handlePayuSuccess = async (result: PayuTransactionResult) => {
    try {
      const updated = await executePayuAutoApproval(userId, userEmail || null, result);
      onSubscriptionUpdated?.(updated);

      // Trigger Celebration Confetti
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
        });
        setTimeout(() => {
          confetti({
            particleCount: 70,
            angle: 60,
            spread: 60,
            origin: { x: 0 },
          });
          confetti({
            particleCount: 70,
            angle: 120,
            spread: 60,
            origin: { x: 1 },
          });
        }, 250);
      } catch (e) {
        console.warn('Confetti effect error', e);
      }

      onSuccessToast?.('🎉 प्रो सब्सक्रिप्शन सक्रिय हो गया है!');
      onClose();
    } catch (err: any) {
      console.error('Failed to process PayU auto-approval in Firestore:', err);
      alert('PayU payment successful, but error updating user profile in cloud. Please refresh.');
    }
  };

  const handleRazorpayCheckout = async (targetPlanId?: string) => {
    const effectiveId = targetPlanId || selectedPlanId;
    let rzpPlan = RAZORPAY_PLANS[1]; // default Growth ₹1399
    if (effectiveId === '1_month' || effectiveId === 'starter') {
      rzpPlan = RAZORPAY_PLANS[0]; // ₹499 Starter
    } else if (effectiveId === '3_months' || effectiveId === 'growth') {
      rzpPlan = RAZORPAY_PLANS[1]; // ₹1399 Growth
    } else if (effectiveId === '1_year' || effectiveId === 'enterprise') {
      rzpPlan = RAZORPAY_PLANS[2]; // ₹4999 Enterprise
    }

    setIsRazorpayLoading(true);
    setRazorpayError(null);

    try {
      await openRazorpayCheckout({
        plan: rzpPlan,
        user: {
          id: userId,
          email: userEmail || undefined,
          name: userName && userName.trim().length > 0 ? userName : 'PAWAN KABI',
          phone: userPhone && userPhone.trim().length >= 10 ? userPhone : '9110913070',
        },
        onSuccess: async (response, paidPlan, updatedSub) => {
          try {
            const updated = updatedSub || (await executeRazorpayAutoApproval(userId, userEmail || null, paidPlan, response));
            onSubscriptionUpdated?.(updated);
            setRazorpaySuccessData({
              plan: paidPlan,
              paymentId: response.razorpay_payment_id,
              validUntil: updated.validUntil,
            });
            onSuccessToast?.(`🎉 ${paidPlan.displayName} भुगतान सफल! प्रो सदस्यता सक्रिय हुई।`);
          } catch (autoErr: any) {
            console.error('Error auto-approving Razorpay in cloud:', autoErr);
            alert('Razorpay भुगतान सफल रहा, लेकिन प्रोफाइल अपडेट में त्रुटि आई। कृपया रिफ्रेश करें।');
          }
        },
        onError: (err) => {
          setRazorpayError(err.message || 'Razorpay भुगतान में त्रुटि या रद्द किया गया।');
        },
      });
    } catch (err: any) {
      setRazorpayError(err?.message || 'Razorpay शुरू करने में त्रुटि।');
    } finally {
      setIsRazorpayLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setSubmitError(validation.error || 'अमान्य फ़ाइल प्रकार (PNG, JPG, WEBP केवल)');
      return;
    }

    try {
      setSubmitError(null);
      setSlipFile(file);
      const encoded = await compressAndEncodeImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.82,
        maxSizeBytes: 700 * 1024,
      });
      setSlipPreview(encoded);
    } catch (err: any) {
      console.error('Failed to compress slip:', err);
      setSubmitError('फ़ाइल कंप्रेस करने में त्रुटि। कृपया पुनः प्रयास करें।');
    }
  };

  const handleSubmitSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slipPreview) {
      setSubmitError('कृपया भुगतान का स्क्रीनशॉट या रसीद चुनें।');
      return;
    }

    try {
      setIsSubmittingSlip(true);
      setSubmitError(null);

      const updated = await submitUserPaymentSlip(userId, {
        slipUrl: slipPreview,
        utrNumber: utrNumber.trim() || undefined,
        amountPaid: selectedPlan.price,
        submittedAt: new Date().toISOString(),
      });

      onSubscriptionUpdated?.(updated);
      setSlipFile(null);
      setSlipPreview(null);
      setUtrNumber('');

      const notice = 'आपकी पेमेंट स्लिप प्राप्त हो गई है। एडमिन सत्यापन के बाद आईडी अनलॉक होगी।';
      onSuccessToast?.(notice);
      onClose();
    } catch (err: any) {
      console.error('Failed to submit slip to Firestore:', err);
      setSubmitError('भुगतान रसीद जमा करने में विफल। कृपया इंटरनेट कनेक्शन जांचें और पुनः प्रयास करें।');
    } finally {
      setIsSubmittingSlip(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      window.location.reload();
    } catch (err) {
      console.error('Failed to sign out:', err);
    }
  };

  return (
    <>
      <div 
        id="user-payment-modal-backdrop"
        className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in"
        onClick={() => {
          if (!isStrictlyLocked) {
            onClose();
          }
        }}
      >
        <div 
          id="user-payment-modal"
          className="bg-slate-900 border border-slate-750 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 bg-gradient-to-r from-amber-950/60 via-slate-900 to-indigo-950/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-amber-500/25 shrink-0">
                <Sparkles className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white tracking-tight">
                    Upgrade to Courier Payout Pro Hub
                  </h3>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Pro SaaS
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  असीमित राइडर, क्लाउड फायरबेस सिंक, और ऑटो पे-आउट सेटलमेंट्स
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isStrictlyLocked && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                  title="लॉग आउट करें (Sign Out)"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">लॉग आउट</span>
                </button>
              )}
              {!isStrictlyLocked && (
                <button
                  type="button"
                  id="close-subscription-modal-btn"
                  onClick={onClose}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Trigger Alert Notification Banner (e.g. Free 3-Rider limit reached or Cloud Sync attempt) */}
          {reason === 'free_limit_reached' && (
            <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-amber-500/20 border-b border-amber-500/30 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>मुफ़्त सीमा पूर्ण:</strong> मुफ़्त प्लान में अधिकतम 3 राइडर अनुमत हैं। 4 या अधिक राइडर जोड़ने व असीमित बेड़े के लिए <strong>प्रो हब प्लान</strong> चुनें।
              </span>
            </div>
          )}

          {reason === 'cloud_backup' && (
            <div className="bg-gradient-to-r from-blue-500/20 via-indigo-500/15 to-blue-500/20 border-b border-blue-500/30 px-4 py-2.5 flex items-center gap-2 text-xs text-blue-200">
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <span>
                <strong>क्लाउड बैकअप प्रो फ़ीचर:</strong> रीयल-टाइम फायरबेस क्लाउड बैकअप और मल्टी-डिवाइस ऑटो-सिंक केवल <strong>प्रो हब</strong> सदस्यों के लिए उपलब्ध है।
              </span>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 p-2 bg-slate-950/80 border-b border-slate-800">
            <button
              type="button"
              id="sub-tab-plans"
              onClick={() => setActiveTab('plans')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'plans'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>1. PayU Instant Activation (Recommended)</span>
            </button>

            <button
              type="button"
              id="sub-tab-qr"
              onClick={() => setActiveTab('qr')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'qr'
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Manual UPI QR</span>
              <span className="sm:hidden">QR</span>
            </button>

            {paymentHistory.length > 0 && (
              <button
                type="button"
                id="sub-tab-history"
                onClick={() => setActiveTab('history')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>History ({paymentHistory.length})</span>
              </button>
            )}
          </div>

          {/* Scrollable Body */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
            {/* TAB 1: Subscription Plans & PayU Auto-Approval */}
            {activeTab === 'plans' && (
              <div className="space-y-6 animate-in fade-in">
                {/* 3 Pricing Tiers Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {SUBSCRIPTION_PLANS.map((plan) => {
                    const isSelected = selectedPlanId === plan.id;
                    return (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`rounded-2xl p-4 transition-all relative flex flex-col justify-between cursor-pointer border ${
                          isSelected
                            ? 'bg-gradient-to-b from-amber-950/40 via-slate-850 to-slate-900 border-amber-500 shadow-xl shadow-amber-950/30 ring-2 ring-amber-500/50'
                            : 'bg-slate-850/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {plan.badge && (
                          <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow">
                            {plan.badge}
                          </div>
                        )}

                        <div>
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-extrabold text-white">
                              {plan.name}
                            </h4>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isSelected ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-600'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>

                          <div className="mt-3 flex items-baseline gap-1.5">
                            <span className="text-2xl font-black text-amber-300">
                              {formatINR(plan.price)}
                            </span>
                            {plan.originalPrice > plan.price && (
                              <span className="text-xs line-through text-slate-500">
                                {formatINR(plan.originalPrice)}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {plan.durationLabel}
                          </span>

                          <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
                            {plan.tagline}
                          </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPlanId(plan.id);
                              handleRazorpayCheckout(plan.id);
                            }}
                            disabled={isRazorpayLoading}
                            className={`w-full py-2.5 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md ${
                              isSelected
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30'
                                : 'bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white'
                            }`}
                          >
                            <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                            <span>Pay with Razorpay</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {razorpayError && (
                  <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500/60 text-xs text-rose-200 flex items-start gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{razorpayError}</span>
                  </div>
                )}

                {/* Feature Comparison Checklist */}
                <div className="p-4 rounded-2xl bg-slate-850/90 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                      <span>Pro Hub Included Capabilities</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-bold">100% Guaranteed</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-200">
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span><strong>Unlimited Rider Management:</strong> Add and manage your entire delivery fleet without limits</span>
                    </div>

                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span><strong>Automated Advance Deductions & SMS Settlements:</strong> Auto-reconcile loan advances & background SIM SMS</span>
                    </div>

                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span><strong>Realtime Firebase Cloud Backup & Multi-device Sync:</strong> 100% cloud sync across phones & PCs</span>
                    </div>

                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span><strong>Festival Greetings SMS Dispatch:</strong> Automated festive greetings via WhatsApp & SIM SMS</span>
                    </div>
                  </div>
                </div>

                {/* Primary CTA: Launch Razorpay or PayU Checkout */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/70 via-slate-850 to-indigo-950/70 border border-blue-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                        चयनित प्लान (Selected Plan):
                      </span>
                      <span className="text-sm font-black text-white">
                        {selectedPlan.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Total Payable: <strong className="text-emerald-300 font-mono text-sm">{formatINR(selectedPlan.price)}</strong> • Razorpay Instant Auto-Activation
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      id="razorpay-open-checkout-btn"
                      onClick={() => handleRazorpayCheckout()}
                      disabled={isRazorpayLoading}
                      className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-blue-600/30 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isRazorpayLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          <span>Razorpay लोड हो रहा है...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                          <span>Pay {formatINR(selectedPlan.price)} with Razorpay</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      id="payu-open-checkout-btn"
                      onClick={() => setIsPayuCheckoutOpen(true)}
                      className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      <span>PayU</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Manual UPI QR & Slip Upload */}
            {activeTab === 'qr' && (
              <div className="space-y-5 animate-in fade-in">
                <div className="p-4 rounded-2xl bg-slate-850 border border-slate-800 flex flex-col sm:flex-row items-center gap-5">
                  {/* QR Image */}
                  <div className="w-40 h-40 bg-white p-2 rounded-2xl shadow-lg shrink-0 flex items-center justify-center">
                    {activeQrUrl ? (
                      <img 
                        src={activeQrUrl} 
                        alt="UPI Payment QR Code" 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-3 text-slate-900 text-xs">
                        <QrCode className="w-8 h-8 mx-auto mb-1 text-slate-600" />
                        <span className="font-bold">UPI QR</span>
                      </div>
                    )}
                  </div>

                  {/* UPI Details */}
                  <div className="space-y-2 text-xs">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                      Direct UPI Transfer
                    </span>
                    <h4 className="text-base font-extrabold text-white">
                      Scan QR & Pay {formatINR(selectedPlan.price)}
                    </h4>
                    <p className="text-slate-300">
                      Scan using Google Pay, PhonePe, Paytm or BHIM UPI app.
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <code className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs">
                        {upiId}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyUpi}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="Copy UPI ID"
                      >
                        {copiedUpi ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Upload Slip Form */}
                <form onSubmit={handleSubmitSlip} className="p-4 rounded-2xl bg-slate-850 border border-slate-800 space-y-3.5">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Submit Payment Screenshot / UTR Number
                  </h4>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      UTR / Transaction Reference (12 Digits)
                    </label>
                    <input
                      type="text"
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value)}
                      placeholder="e.g. 427819283719"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Payment Screenshot <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                    />
                  </div>

                  {slipPreview && (
                    <div className="w-24 h-24 rounded-xl overflow-hidden border border-slate-700">
                      <img src={slipPreview} alt="Slip preview" className="w-full h-full object-cover" />
                    </div>
                  )}

                  {submitError && (
                    <p className="text-xs text-red-400">{submitError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmittingSlip}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingSlip ? 'Uploading...' : 'Submit Payment Slip for Admin Review'}
                  </button>
                </form>
              </div>
            )}

            {/* TAB 3: Payment History */}
            {activeTab === 'history' && (
              <div className="space-y-3 animate-in fade-in">
                {paymentHistory.map((item) => (
                  <div key={item.id} className="p-3.5 rounded-2xl bg-slate-850 border border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white">{item.notes || 'Subscription Payment'}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Txn: {item.utr || item.id} • {new Date(item.date).toLocaleDateString('hi-IN')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-400 text-sm">{formatINR(item.amount)}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        {item.status || 'Active'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PayU Gateway Modal */}
      <PayuCheckoutModal
        isOpen={isPayuCheckoutOpen}
        onClose={() => setIsPayuCheckoutOpen(false)}
        plan={selectedPlan}
        userEmail={userEmail}
        userId={userId}
        userName={userName}
        onSuccess={handlePayuSuccess}
      />

      {/* Razorpay Success Celebration Modal */}
      <RazorpaySuccessModal
        isOpen={!!razorpaySuccessData}
        onClose={() => {
          setRazorpaySuccessData(null);
          onClose();
        }}
        plan={razorpaySuccessData?.plan || null}
        paymentId={razorpaySuccessData?.paymentId || ''}
        validUntil={razorpaySuccessData?.validUntil}
      />
    </>
  );
};
