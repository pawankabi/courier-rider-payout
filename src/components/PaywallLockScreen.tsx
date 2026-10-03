import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  AlertCircle, 
  QrCode, 
  Copy, 
  Check, 
  Upload, 
  Clock, 
  RefreshCw, 
  LogOut, 
  CreditCard, 
  ShieldAlert, 
  ExternalLink,
  Eye,
  CheckCircle2,
  FileText,
  Zap
} from 'lucide-react';
import { User } from 'firebase/auth';
import { auth } from '../firebase';
import { UserSubscription, UserSubmittedSlip } from '../types';
import { submitUserPaymentSlip, getDefaultSubscriptionConfig, SUPER_ADMIN_EMAIL } from '../services/firestoreSync';
import { validateImageFile, compressAndEncodeImage } from '../utils/imageUpload';
import { PublicComplianceFooter } from './PublicComplianceFooter';
import { LegalPoliciesModal, PolicyTab } from './LegalPoliciesModal';
import { 
  RAZORPAY_PLANS, 
  RazorpayPlan, 
  openRazorpayCheckout, 
  executeRazorpayAutoApproval 
} from '../services/razorpayCheckout';
import { RazorpaySuccessModal } from './RazorpaySuccessModal';
import { formatINR } from '../utils/formatters';

interface PaywallLockScreenProps {
  currentUser: User;
  userProfile?: {
    status?: string;
    validUntil?: string;
    name?: string;
    displayName?: string;
  } | null;
  userSubscription?: UserSubscription;
  masterQrCodeUrl?: string;
  onSignOut?: () => void;
  onRefreshStatus?: () => Promise<void> | void;
  onSubscriptionUpdated?: (updated: UserSubscription) => void;
}

export const PaywallLockScreen: React.FC<PaywallLockScreenProps> = ({
  currentUser,
  userProfile,
  userSubscription,
  masterQrCodeUrl,
  onSignOut,
  onRefreshStatus,
  onSubscriptionUpdated,
}) => {
  const [liveQrUrl, setLiveQrUrl] = useState<string>('');
  const [showQrCode, setShowQrCode] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [utrNumber, setUtrNumber] = useState('');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isReuploading, setIsReuploading] = useState(false);
  const [enlargedSlipUrl, setEnlargedSlipUrl] = useState<string | null>(null);
  const [isLegalPoliciesModalOpen, setIsLegalPoliciesModalOpen] = useState(false);
  const [legalPoliciesInitialTab, setLegalPoliciesInitialTab] = useState<PolicyTab>('about');
  const [selectedRzpPlanId, setSelectedRzpPlanId] = useState<'starter' | 'growth' | 'enterprise'>('growth');
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false);
  const [razorpayError, setRazorpayError] = useState<string | null>(null);
  const [razorpaySuccessData, setRazorpaySuccessData] = useState<{
    plan: RazorpayPlan;
    paymentId: string;
    validUntil?: string;
  } | null>(null);

  const handleOpenLegalPolicies = (tab: PolicyTab = 'about') => {
    setLegalPoliciesInitialTab(tab);
    setIsLegalPoliciesModalOpen(true);
  };

  const upiId = 'pawankabiseraikella@okaxis';
  const monthlyFee = typeof userSubscription?.monthlyFee === 'number' && userSubscription.monthlyFee > 0
    ? userSubscription.monthlyFee
    : 499;

  // Load default QR if neither user QR nor master QR is supplied
  useEffect(() => {
    if (!userSubscription?.qrCodeUrl && !masterQrCodeUrl) {
      getDefaultSubscriptionConfig().then((cfg) => {
        if (cfg?.qrCodeUrl) {
          setLiveQrUrl(cfg.qrCodeUrl);
        }
      }).catch(() => {});
    }
  }, [userSubscription?.qrCodeUrl, masterQrCodeUrl]);

  const activeQrCodeUrl = (userSubscription?.qrCodeUrl && userSubscription.qrCodeUrl.trim().length > 0)
    ? userSubscription.qrCodeUrl
    : (masterQrCodeUrl && masterQrCodeUrl.trim().length > 0 ? masterQrCodeUrl : liveQrUrl);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setSubmitError(validation.error || 'अमान्य फ़ाइल (केवल PNG, JPG, JPEG, WEBP)');
      return;
    }

    try {
      setSubmitError(null);
      setSlipFile(file);
      const encoded = await compressAndEncodeImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.85,
        maxSizeBytes: 800 * 1024,
      });
      setSlipPreview(encoded);
    } catch (err: any) {
      console.error('Failed to encode image slip:', err);
      setSubmitError('फोटो प्रोसेस करने में विफल। कृपया पुनः प्रयास करें।');
    }
  };

  const handleSubmitSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slipPreview) {
      setSubmitError('कृपया भुगतान का स्क्रीनशॉट / रसीद की फोटो अपलोड करें।');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const cleanUtr = utrNumber.trim().toUpperCase();
      const slipData: UserSubmittedSlip = {
        slipUrl: slipPreview,
        utrNumber: cleanUtr || undefined,
        submittedAt: new Date().toISOString(),
        amountPaid: monthlyFee,
      };

      const updated = await submitUserPaymentSlip(currentUser.uid, slipData);
      if (onSubscriptionUpdated) {
        onSubscriptionUpdated(updated);
      }
      setSubmitSuccess(true);
      setIsReuploading(false);
    } catch (err: any) {
      console.error('Error submitting slip:', err);
      setSubmitError(err?.message || 'रसीद अपलोड करने में विफल। कृपया इंटरनेट चेक करें।');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckStatus = async () => {
    setIsCheckingStatus(true);
    try {
      if (onRefreshStatus) {
        await onRefreshStatus();
      } else {
        await new Promise((res) => setTimeout(res, 800));
      }
    } catch (err) {
      console.warn('Status check warning:', err);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleRazorpayCheckout = async (planId?: 'starter' | 'growth' | 'enterprise') => {
    const targetId = planId || selectedRzpPlanId;
    const plan = RAZORPAY_PLANS.find((p) => p.id === targetId) || RAZORPAY_PLANS[1];

    setIsRazorpayLoading(true);
    setRazorpayError(null);

    try {
      await openRazorpayCheckout({
        plan,
        user: {
          id: currentUser.uid,
          email: currentUser.email || undefined,
          name: userProfile?.displayName || userProfile?.name || currentUser.displayName || 'PAWAN KABI',
          phone: (userProfile as any)?.phone || (userProfile as any)?.contact || '9110913070',
        },
        onSuccess: async (response, paidPlan) => {
          try {
            const updated = await executeRazorpayAutoApproval(currentUser.uid, currentUser.email || null, paidPlan, response);
            if (onSubscriptionUpdated) {
              onSubscriptionUpdated(updated);
            }
            setRazorpaySuccessData({
              plan: paidPlan,
              paymentId: response.razorpay_payment_id,
              validUntil: updated.validUntil,
            });
            if (onRefreshStatus) {
              await onRefreshStatus();
            }
          } catch (autoErr: any) {
            console.error('Error in executeRazorpayAutoApproval:', autoErr);
            alert('Razorpay भुगतान स्वीकृत हो गया है, कृपया ऐप पुनः रिफ्रेश करें।');
          }
        },
        onError: (err) => {
          setRazorpayError(err.message || 'Razorpay भुगतान प्रक्रिया में त्रुटि या रद्द किया गया।');
        },
      });
    } catch (err: any) {
      setRazorpayError(err?.message || 'Razorpay शुरू करने में त्रुटि।');
    } finally {
      setIsRazorpayLoading(false);
    }
  };

  const handleSignOut = () => {
    if (onSignOut) {
      onSignOut();
    } else {
      auth.signOut();
    }
  };

  const paymentStatus = userSubscription?.paymentStatus;
  const isAwaitingVerification = (paymentStatus === 'awaiting_approval' || paymentStatus === 'verification_pending' || submitSuccess) && !isReuploading;
  const lastSlip = userSubscription?.lastSubmittedSlip;

  const formatDisplayDate = (dStr?: string) => {
    if (!dStr) return 'अमान्य / समाप्त';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      return d.toLocaleDateString('hi-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dStr;
    }
  };

  const currentStatus = userProfile?.status || 'pending';
  const validUntilStr = userProfile?.validUntil || userSubscription?.validUntil;

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-between p-3 sm:p-6 font-sans">
      {/* Top Bar with Branding & Logout */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-600 p-0.5 shadow flex items-center justify-center">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white tracking-tight leading-none">
              कूरियर पे-आउट प्रो (Courier Payout Pro)
            </h1>
            <span className="text-[11px] text-rose-400 font-semibold">
              🔒 खाता लॉक / Paywall Access Lock
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
          title="Sign out of current account"
        >
          <LogOut className="w-3.5 h-3.5 text-rose-400" />
          <span>लॉगआउट (Sign Out)</span>
        </button>
      </header>

      {/* Main Lockout Content Card */}
      <main className="max-w-4xl w-full mx-auto my-auto py-6 space-y-6">
        {/* Core Lockout Status Banner */}
        <div 
          id="paywall-lock-banner"
          className="bg-gradient-to-br from-rose-950/80 via-slate-900 to-slate-950 border-2 border-rose-600/80 rounded-2xl p-5 sm:p-7 shadow-2xl shadow-rose-950/40 relative overflow-hidden"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 shadow-lg">
              <ShieldAlert className="w-8 h-8 animate-pulse" />
            </div>

            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  खाता लॉक है (Account Locked)
                </span>
                <span className="text-xs text-slate-400">
                  स्थिति: <strong className="text-white uppercase font-mono">{currentStatus}</strong>
                </span>
                {validUntilStr && (
                  <span className="text-xs text-slate-400">
                    वैधता: <strong className="text-amber-300">{formatDisplayDate(validUntilStr)}</strong>
                  </span>
                )}
              </div>

              {/* Exact user request status text */}
              <h2 className="text-base sm:text-lg font-black text-white leading-snug">
                आपका खाता लॉक है। भुगतान की पुष्टि होने व एडमिन द्वारा वैधता बढ़ाने के बाद ही ऐप चालू होगा।
              </h2>

              <p className="text-xs text-slate-300">
                लॉग इन ईमेल: <span className="font-mono text-blue-300">{currentUser.email}</span> (नाम: {userProfile?.displayName || userProfile?.name || currentUser.displayName || 'Rider Hub'})
              </p>
            </div>

            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={isCheckingStatus}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer"
              title="Refresh status from live server"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isCheckingStatus ? 'animate-spin' : ''}`} />
              <span>{isCheckingStatus ? 'जांच जारी...' : 'स्थिति जांचें'}</span>
            </button>
          </div>
        </div>

        {/* Dynamic State: If user has already submitted a slip and is waiting approval */}
        {isAwaitingVerification ? (
          <div 
            id="paywall-awaiting-verification-card"
            className="bg-amber-950/40 border-2 border-amber-500/60 rounded-2xl p-5 sm:p-7 text-center space-y-4 animate-in fade-in"
          >
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400 animate-pulse">
              <Clock className="w-8 h-8" />
            </div>

            <div className="space-y-1.5 max-w-lg mx-auto">
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black uppercase tracking-wider inline-block">
                सत्यापन लंबित (Verification Awaiting Approval)
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-white leading-snug">
                आपकी पेमेंट स्लिप प्राप्त हो गई है। एडमिन द्वारा सत्यापन और स्वीकृति (Approval) के बाद ही आपकी आईडी स्वतः अनलॉक होगी। कृपया प्रतीक्षा करें।
              </h3>
              <p className="text-xs text-amber-200/90 leading-relaxed">
                एडमिन ({SUPER_ADMIN_EMAIL}) को सूचना भेज दी गई है। स्वीकृति मिलते ही यह स्क्रीन 0 सेकंड में स्वतः खुल जाएगी।
              </p>
            </div>

            {/* Slip Details Pill Box */}
            <div className="max-w-md mx-auto p-4 bg-slate-950/90 rounded-xl border border-slate-800 text-left space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span>जमा की गई राशि:</span>
                <strong className="text-emerald-400 font-extrabold text-sm">₹{lastSlip?.amountPaid || monthlyFee}</strong>
              </div>

              {lastSlip?.utrNumber && (
                <div className="flex justify-between items-center text-slate-300">
                  <span>UTR / Ref Number:</span>
                  <code className="text-amber-300 font-mono font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {lastSlip.utrNumber}
                  </code>
                </div>
              )}

              {lastSlip?.submittedAt && (
                <div className="flex justify-between items-center text-slate-400 text-[11px]">
                  <span>सबमिट करने का समय:</span>
                  <span>{new Date(lastSlip.submittedAt).toLocaleString('hi-IN')}</span>
                </div>
              )}

              {lastSlip?.slipUrl && (
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400">अपलोड की गई रसीद:</span>
                  <button
                    type="button"
                    onClick={() => setEnlargedSlipUrl(lastSlip.slipUrl)}
                    className="text-blue-400 hover:text-blue-300 text-xs underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>रसीद देखें</span>
                  </button>
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCheckStatus}
                disabled={isCheckingStatus}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                <span>अनलॉक स्थिति पुनः जांचें</span>
              </button>

              <button
                type="button"
                onClick={() => setIsReuploading(true)}
                className="text-xs text-slate-400 hover:text-slate-200 underline font-medium cursor-pointer py-1"
              >
                गलत रसीद अपलोड हो गई? दोबारा अपलोड करें
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. RAZORPAY LIVE INSTANT ACTIVATION BANNER */}
            <div className="bg-gradient-to-br from-blue-950/80 via-slate-900 to-indigo-950/80 border-2 border-blue-500/70 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-blue-500/30 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400">
                    <Zap className="w-5 h-5 fill-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                      <span>Razorpay ऑनलाइन भुगतान (Instant 0-Second Unlock)</span>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        LIVE
                      </span>
                    </h3>
                    <p className="text-xs text-blue-200/80">
                      प्लान चुनें और Razorpay से तुरंत भुगतान करें • 0 सेकंड में खाता स्वतः अनलॉक हो जाएगा
                    </p>
                  </div>
                </div>
              </div>

              {razorpayError && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/60 text-xs text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{razorpayError}</span>
                </div>
              )}

              {/* 3 Pricing Plans */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {RAZORPAY_PLANS.map((plan) => {
                  const isSelected = selectedRzpPlanId === plan.id;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedRzpPlanId(plan.id)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-blue-950/50 border-blue-500 ring-2 ring-blue-500/40 shadow-lg'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-white">{plan.displayName}</span>
                          {plan.badge && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              {plan.badge}
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-blue-300">{formatINR(plan.price)}</span>
                          <span className="text-[11px] text-slate-400">/ {plan.durationLabel}</span>
                        </div>
                        <p className="text-[10px] text-slate-300 leading-tight">{plan.tagline}</p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRzpPlanId(plan.id);
                          handleRazorpayCheckout(plan.id);
                        }}
                        disabled={isRazorpayLoading}
                        className={`w-full mt-3 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow'
                            : 'bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                        <span>Pay {formatINR(plan.price)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* OR SEPARATOR */}
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                या मैन्युअल UPI ट्रांसफर व रसीद अपलोड करें (Alternative)
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {/* Payment Grid: QR Code & Payment Instructions on Left, Upload Form on Right */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* LEFT COLUMN: 1-TAP UPI PAYMENT & INSTRUCTIONS */}
            <div className="md:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">
                      1. त्वरित UPI भुगतान (1-Tap UPI Payment)
                    </h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ₹{monthlyFee} / माह
                  </span>
                </div>

                {/* Prominent Full-Width UPI Button */}
                <a
                  href={`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('Courier Payout Pro')}&am=${monthlyFee}&cu=INR&tn=${encodeURIComponent('App Activation')}`}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 hover:from-emerald-400 hover:to-blue-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition active:scale-[0.98] cursor-pointer text-center"
                >
                  <Zap className="w-5 h-5 fill-slate-950 shrink-0" />
                  <span>Pay via UPI App (GPay / PhonePe / Paytm)</span>
                </a>

                {/* UPI ID Pill with 1-Tap Copy */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="text-[11px] text-slate-400 font-medium block">
                    या UPI ID पर सीधे ₹{monthlyFee} ट्रांसफर करें:
                  </span>
                  <div className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2 rounded-lg border border-slate-700">
                    <span className="font-mono text-xs font-bold text-amber-300 truncate select-all">
                      {upiId}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyUpi}
                      className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer shrink-0"
                    >
                      {copiedUpi ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-300" />
                          <span>कॉपी हुआ!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy UPI</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Clean Toggle for QR Code Scanning */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowQrCode((prev) => !prev)}
                    className="text-xs text-slate-400 hover:text-amber-300 flex items-center justify-center gap-1.5 mx-auto transition cursor-pointer font-medium py-1 px-3 rounded-lg hover:bg-slate-950 border border-slate-800/80"
                  >
                    <QrCode className="w-3.5 h-3.5 text-amber-400" />
                    <span>{showQrCode ? 'QR कोड छुपाएं (Hide QR Code)' : '📱 दूसरी डिवाइस से स्कैन करने हेतु QR कोड देखें (Show QR Code)'}</span>
                  </button>
                </div>

                {/* Collapsible QR Code View */}
                {showQrCode && (
                  <div className="text-center p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2 animate-in fade-in duration-200">
                    <span className="text-xs font-bold text-slate-200 block">
                      UPI QR Code (Scan &amp; Pay ₹{monthlyFee})
                    </span>
                    {activeQrCodeUrl ? (
                      <div className="inline-block p-3 bg-white rounded-xl shadow-lg border border-slate-300">
                        <img
                          src={activeQrCodeUrl}
                          alt="Master Admin UPI QR Code"
                          referrerPolicy="no-referrer"
                          className="w-44 h-44 sm:w-48 sm:h-48 object-contain mx-auto"
                        />
                      </div>
                    ) : (
                      <div className="w-44 h-44 sm:w-48 sm:h-48 mx-auto flex flex-col items-center justify-center bg-slate-900 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs p-3">
                        <QrCode className="w-8 h-8 text-slate-600 mb-1" />
                        <span>QR कोड लोड हो रहा है...</span>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-400">
                      Google Pay / PhonePe / Paytm / BHIM ऐप से स्कैन करें।
                    </p>
                  </div>
                )}

                {/* Payment Instructions Bullet List */}
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1.5 text-slate-300 text-xs">
                  <strong className="text-white block text-[11px]">भुगतान निर्देश (Instructions):</strong>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                    <li>मासिक सदस्यता शुल्क: <strong>₹{monthlyFee}</strong> ट्रांसफर करें।</li>
                    <li>भुगतान सफल होने के बाद <strong>12-अंकों का UTR / Transaction Ref नंबर</strong> नोट करें।</li>
                    <li>पेमेंट रसीद का <strong>स्क्रीनशॉट</strong> लेकर दाईं तरफ अपलोड करें।</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: RIDER HUB UTR & PAYMENT SLIP UPLOAD FORM */}
            <div className="md:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <form onSubmit={handleSubmitSlip} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">
                      2. UTR दर्ज करें व रसीद अपलोड करें
                    </h3>
                  </div>
                </div>

                {submitError && (
                  <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/60 text-xs text-rose-200 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Input 1: Transaction UTR / Reference Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200 block">
                    Transaction UTR / Reference Number (12 डिजिट):
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="उदा. 423985729103 या UPI Ref"
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-400"
                  />
                  <p className="text-[10px] text-slate-400">
                    Google Pay / PhonePe स्क्रीनशॉट में प्रदर्शित 12-अंकों का UTR या Ref ID यहां लिखें।
                  </p>
                </div>

                {/* Input 2: Upload Payment Slip Button & Preview */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200 block">
                    भुगतान रसीद की फोटो (Payment Slip / Screenshot):
                  </label>

                  {slipPreview ? (
                    <div className="p-3 bg-slate-950 rounded-xl border border-emerald-500/40 space-y-2">
                      <div className="relative group">
                        <img
                          src={slipPreview}
                          alt="Slip Preview"
                          className="w-full max-h-48 object-contain rounded-lg bg-black/40 border border-slate-800"
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>रसीद तैयार है</span>
                        </span>
                        <label className="text-blue-400 hover:text-blue-300 underline cursor-pointer text-[11px] font-bold">
                          बदलें
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-700 hover:border-emerald-500/80 rounded-xl bg-slate-950/80 hover:bg-slate-950 cursor-pointer transition text-center group">
                      <div className="w-12 h-12 rounded-xl bg-slate-900 group-hover:bg-emerald-500/20 border border-slate-800 group-hover:border-emerald-500/40 flex items-center justify-center text-slate-400 group-hover:text-emerald-300 transition mb-2">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-bold text-white group-hover:text-emerald-300">
                        Upload Payment Slip (रसीद अपलोड करें)
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1">
                        गैलरी या कैमरे से स्क्रीनशॉट चुनें (PNG, JPG, WEBP)
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || !slipPreview}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>अपलोड व सत्यापन भेजा जा रहा है...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>भुगतान रसीद सबमिट करें (Submit Slip)</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
        )}
      </main>

      {/* Razorpay Success Celebration Modal */}
      <RazorpaySuccessModal
        isOpen={!!razorpaySuccessData}
        onClose={() => {
          setRazorpaySuccessData(null);
          if (onRefreshStatus) onRefreshStatus();
        }}
        plan={razorpaySuccessData?.plan || null}
        paymentId={razorpaySuccessData?.paymentId || ''}
        validUntil={razorpaySuccessData?.validUntil}
      />

      {/* Enlarged Slip Modal */}
      {enlargedSlipUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setEnlargedSlipUrl(null)}
        >
          <div 
            className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-white">सबमिट की गई रसीद का पूर्वावलोकन</span>
              <button
                type="button"
                onClick={() => setEnlargedSlipUrl(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
              >
                बंद करें (✕)
              </button>
            </div>
            <div className="py-3 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={enlargedSlipUrl}
                alt="Enlarged Payment Slip"
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* Fixed Public Compliance Footer across all views */}
      <PublicComplianceFooter
        onOpenPolicy={handleOpenLegalPolicies}
        platformName="Courier Rider Payout"
        merchantName="Pawan Kabi"
        supportPhone="+91 9110913070"
        supportEmail="pawankabiseraikella@gmail.com"
        supportAddress="Saraikela, Jharkhand, India"
        operatingHours="Mon - Sat, 10:00 AM - 07:00 PM IST"
      />

      {/* Universal Legal & Compliance Policies Modal */}
      <LegalPoliciesModal
        isOpen={isLegalPoliciesModalOpen}
        onClose={() => setIsLegalPoliciesModalOpen(false)}
        initialTab={legalPoliciesInitialTab}
        platformName="Courier Rider Payout"
        merchantName="Pawan Kabi"
        supportEmail="pawankabiseraikella@gmail.com"
        supportPhone="+91 9110913070"
        supportAddress="Saraikela, Jharkhand, India"
        operatingHours="Mon - Sat, 10:00 AM - 07:00 PM IST"
      />
    </div>
  );
};
