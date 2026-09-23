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
  FileText,
  Clock,
  History,
  LogOut,
  ExternalLink,
  Receipt,
  QrCode
} from 'lucide-react';
import { auth } from '../firebase';
import { UserSubscription, PaymentHistoryItem, checkSubscriptionLock } from '../types';
import { submitUserPaymentSlip, getDefaultSubscriptionConfig } from '../services/firestoreSync';
import { compressAndEncodeImage, validateImageFile } from '../utils/imageUpload';

export interface UserPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userSubscription?: UserSubscription;
  userId: string;
  userEmail?: string | null;
  masterQrCodeUrl?: string;
  isSuperAdmin?: boolean;
  onSubscriptionUpdated?: (updated: UserSubscription) => void;
  onSuccessToast?: (msg: string) => void;
  activeTabDefault?: 'pay' | 'history';
}

export const UserPaymentModal: React.FC<UserPaymentModalProps> = ({
  isOpen,
  onClose,
  userSubscription,
  userId,
  userEmail,
  masterQrCodeUrl,
  isSuperAdmin = false,
  onSubscriptionUpdated,
  onSuccessToast,
  activeTabDefault = 'pay',
}) => {
  const [activeTab, setActiveTab] = useState<'pay' | 'history'>(activeTabDefault);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isReuploading, setIsReuploading] = useState(false);
  const [selectedHistorySlip, setSelectedHistorySlip] = useState<string | null>(null);
  const [liveDefaultQr, setLiveDefaultQr] = useState<string>('');

  useEffect(() => {
    if (!userSubscription?.qrCodeUrl && !masterQrCodeUrl) {
      getDefaultSubscriptionConfig().then((cfg) => {
        if (cfg?.qrCodeUrl) {
          setLiveDefaultQr(cfg.qrCodeUrl);
        }
      }).catch(() => {});
    }
  }, [userSubscription?.qrCodeUrl, masterQrCodeUrl]);

  if (!isOpen) return null;

  // Super admin never needs payment or paywall
  if (isSuperAdmin) return null;

  const lockStatus = checkSubscriptionLock(userSubscription, isSuperAdmin);
  const isStrictlyLocked = lockStatus.isLocked;

  const monthlyFee = typeof userSubscription?.monthlyFee === 'number' 
    ? userSubscription.monthlyFee 
    : 499;

  const validUntil = userSubscription?.validUntil;
  const paymentStatus = userSubscription?.paymentStatus || 'expired';
  const isAwaitingApproval = paymentStatus === 'awaiting_approval' || paymentStatus === 'verification_pending';

  const activeQrUrl = (userSubscription?.qrCodeUrl && userSubscription.qrCodeUrl.trim().length > 0)
    ? userSubscription.qrCodeUrl
    : (masterQrCodeUrl && masterQrCodeUrl.trim().length > 0 ? masterQrCodeUrl : liveDefaultQr);

  const paymentHistory: PaymentHistoryItem[] = Array.isArray(userSubscription?.paymentHistory)
    ? userSubscription.paymentHistory
    : [];

  const formatHindiDate = (isoStr?: string) => {
    if (!isoStr) return 'तत्काल';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return isoStr;
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
      setIsSubmitting(true);
      setSubmitError(null);

      const updated = await submitUserPaymentSlip(userId, {
        slipUrl: slipPreview,
        utrNumber: utrNumber.trim() || undefined,
        amountPaid: monthlyFee,
        submittedAt: new Date().toISOString(),
      });

      // Update parent subscription state immediately
      onSubscriptionUpdated?.(updated);
      setIsReuploading(false);
      setSlipFile(null);
      setSlipPreview(null);
      setUtrNumber('');

      const notice = 'आपकी पेमेंट स्लिप प्राप्त हो गई है। एडमिन सत्यापन के बाद आईडी अनलॉक होगी।';
      onSuccessToast?.(notice);
    } catch (err: any) {
      console.error('Failed to submit slip to Firestore:', err);
      setSubmitError('भुगतान रसीद जमा करने में विफल। कृपया इंटरनेट कनेक्शन जांचें और पुनः प्रयास करें।');
    } finally {
      setIsSubmitting(false);
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
        className="bg-slate-900 border border-slate-700/90 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/95 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
              isStrictlyLocked 
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' 
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              {isStrictlyLocked ? (
                <Lock className="w-5 h-5 text-rose-400" />
              ) : (
                <CreditCard className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isStrictlyLocked 
                  ? 'सब्सक्रिप्शन लॉक (Hard Paywall)' 
                  : 'Subscription & Billing Details'}
              </h3>
              <p className="text-[11px] text-amber-300 font-semibold">
                मासिक शुल्क: <span className="font-extrabold text-white text-xs">₹{monthlyFee}</span> / माह
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* If strictly locked, give Sign Out option so user is never trapped */}
            {isStrictlyLocked && (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
                title="लॉग आउट करें (Sign Out)"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">लॉग आउट</span>
              </button>
            )}

            {/* Close button: strictly hidden if hard app lockout */}
            {!isStrictlyLocked && (
              <button
                type="button"
                id="user-payment-modal-close-btn"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="बंद करें"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation if user is unlocked or has history */}
        {!isStrictlyLocked && (
          <div className="flex border-b border-slate-800 bg-slate-950/60 px-4">
            <button
              type="button"
              onClick={() => setActiveTab('pay')}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'pay'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>भुगतान एवं स्लिप (Pay & Slip)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 flex items-center gap-1.5 transition ${
                activeTab === 'history'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>रसीद विवरण (Billing History)</span>
              {paymentHistory.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] text-amber-300">
                  {paymentHistory.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* TAB 2: BILLING HISTORY (रसीद विवरण) */}
          {activeTab === 'history' && !isStrictlyLocked ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-amber-400" />
                  <span>पिछला स्वीकृत भुगतान रिकॉर्ड (Payment History Logs)</span>
                </span>
                <span className="text-[11px] text-slate-400">कुल: {paymentHistory.length} भुगतान</span>
              </div>

              {paymentHistory.length === 0 ? (
                <div className="text-center py-10 px-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 space-y-2">
                  <Receipt className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs">कोई पिछला भुगतान रिकॉर्ड नहीं मिला।</p>
                  <p className="text-[11px] text-slate-500">
                    एडमिन द्वारा रसीद स्वीकृत होने पर आपका इतिहास यहाँ दिखाई देगा।
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {paymentHistory.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold">
                            #{paymentHistory.length - idx}
                          </span>
                          <span className="text-sm font-extrabold text-emerald-400">
                            ₹{item.amount}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                            स्वीकृत (Approved)
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {formatHindiDate(item.date)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-900">
                        <div>
                          <span className="text-slate-500">UTR / Ref: </span>
                          <span className="text-slate-300 font-mono font-semibold">
                            {item.utr || 'उपलब्ध नहीं'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Approved by: </span>
                          <span className="text-slate-300 font-medium truncate inline-block max-w-[120px]">
                            {item.approvedBy || 'Admin'}
                          </span>
                        </div>
                      </div>

                      {item.slipUrl && (
                        <div className="pt-1 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setSelectedHistorySlip(item.slipUrl || null)}
                            className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold underline cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>रसीद की प्रति देखें (View Slip)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* TAB 1: PAY & SLIP SUBMISSION */
            <>
              {/* CASE A: AWAITING ADMIN APPROVAL SCREEN */}
              {isAwaitingApproval && !isReuploading ? (
                <div 
                  id="pending-admin-approval-screen"
                  className="space-y-4 p-4 rounded-2xl bg-amber-950/40 border-2 border-amber-500/60 text-center animate-in fade-in"
                >
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400 animate-pulse">
                    <Clock className="w-7 h-7" />
                  </div>

                  <div className="space-y-1.5">
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black uppercase tracking-wider inline-block">
                      सत्यापन लंबित (Awaiting Admin Approval)
                    </span>
                    <h4 className="text-sm sm:text-base font-extrabold text-white leading-snug">
                      आपकी पेमेंट स्लिप प्राप्त हो गई है। एडमिन द्वारा सत्यापन और स्वीकृति (Approval) के बाद ही आपकी आईडी स्वतः अनलॉक होगी। कृपया प्रतीक्षा करें।
                    </h4>
                  </div>

                  <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-left space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-300">
                      <span>देय / भुगतान राशि:</span>
                      <strong className="text-amber-400 font-extrabold text-sm">
                        ₹{userSubscription?.lastSubmittedSlip?.amountPaid || monthlyFee}
                      </strong>
                    </div>
                    {userSubscription?.lastSubmittedSlip?.utrNumber && (
                      <div className="flex justify-between items-center text-slate-300">
                        <span>UTR / Transaction Ref:</span>
                        <code className="text-slate-200 font-mono font-bold bg-slate-900 px-1.5 py-0.5 rounded">
                          {userSubscription.lastSubmittedSlip.utrNumber}
                        </code>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-slate-400 text-[11px]">
                      <span>जमा करने का समय:</span>
                      <span>
                        {formatHindiDate(userSubscription?.lastSubmittedSlip?.submittedAt)}
                      </span>
                    </div>

                    {userSubscription?.lastSubmittedSlip?.slipUrl && (
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">सबमिट की गई रसीद:</span>
                        <button
                          type="button"
                          onClick={() => setSelectedHistorySlip(userSubscription.lastSubmittedSlip?.slipUrl || null)}
                          className="text-[11px] text-blue-400 hover:text-blue-300 underline font-semibold cursor-pointer"
                        >
                          देखें
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-blue-950/40 border border-blue-800/60 text-[11px] text-blue-200 flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
                    <span>
                      रियल-टाइम ऑटो-सिंक सक्रिय है। एडमिन स्वीकृति मिलते ही ऐप तुरंत अनलॉक हो जाएगा।
                    </span>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsReuploading(true)}
                      className="text-xs text-slate-400 hover:text-slate-200 underline font-medium cursor-pointer"
                    >
                      गलत रसीद अपलोड हो गई? दोबारा अपलोड करें
                    </button>
                  </div>
                </div>
              ) : (
                /* CASE B: STRICT PAYMENT LOCKOUT & UPLOAD FORM */
                <>
                  {/* Strict Hard Lockout Notice Banner */}
                  <div 
                    id="lockout-strict-notice"
                    className="p-3.5 rounded-xl bg-rose-950/70 border-2 border-rose-600/80 text-rose-200 text-xs flex items-start gap-2.5 shadow-md"
                  >
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
                    <div className="space-y-1">
                      <strong className="block text-sm text-white font-black">
                        {lockStatus.isFreeTrialExpired
                          ? 'निःशुल्क परीक्षण अवधि समाप्त (Free Trial Expired)'
                          : 'आपका मासिक सब्सक्रिप्शन समाप्त हो गया है / नवीनीकरण लंबित है।'}
                      </strong>
                      <span className="leading-relaxed block text-rose-200">
                        कृपया आगे उपयोग के लिए भुगतान करें। भुगतान रसीद अपलोड करने के पश्चात एडमिन द्वारा सत्यापन और स्वीकृति मिलते ही आपकी आईडी स्वतः सक्रिय हो जाएगी।
                      </span>
                    </div>
                  </div>

                  {/* Monthly Fee Display */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800 shadow-sm">
                    <span className="text-xs text-slate-300 font-semibold">
                      देय मासिक शुल्क (Assigned Monthly Fee):
                    </span>
                    <span className="text-lg font-black text-amber-300">
                      ₹{monthlyFee} <span className="text-xs font-normal text-slate-400">/ माह</span>
                    </span>
                  </div>

                  {/* UPI QR Code Container */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center space-y-2">
                    <span className="text-xs font-bold text-slate-200 block">
                      UPI QR Code (Google Pay / PhonePe / Paytm / BHIM)
                    </span>
                    <p className="text-[11px] text-slate-400">
                      QR कोड स्कैन करें और <strong>₹{monthlyFee}</strong> का भुगतान कर स्क्रीनशॉट नीचे अपलोड करें।
                    </p>

                    {activeQrUrl ? (
                      <div className="inline-block p-3 bg-white rounded-xl shadow-lg my-1 border border-slate-300">
                        <img
                          src={activeQrUrl}
                          alt="Master Admin UPI QR Code"
                          referrerPolicy="no-referrer"
                          className="w-48 h-48 object-contain mx-auto"
                        />
                      </div>
                    ) : (
                      <div className="py-6 px-4 bg-slate-900 rounded-xl border border-dashed border-slate-800 text-slate-400 space-y-2">
                        <QrCode className="w-10 h-10 mx-auto text-slate-600" />
                        <p className="text-xs">UPI QR Code लोड हो रहा है...</p>
                        <p className="text-[10px] text-slate-500">
                          यदि QR कोड प्रदर्शित नहीं होता है, तो कृपया एडमिन से संपर्क करें।
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Slip Upload & UTR Form */}
                  <form onSubmit={handleSubmitSlip} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-200 block">
                        भुगतान रसीद / स्क्रीनशॉट अपलोड करें (Payment Screenshot) *
                      </label>
                      <div className="relative border-2 border-dashed border-slate-700 hover:border-blue-500/80 rounded-xl p-4 text-center transition bg-slate-950 cursor-pointer">
                        <input
                          type="file"
                          id="user-slip-file-input"
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="flex flex-col items-center justify-center space-y-1 pointer-events-none py-1">
                          <Upload className="w-5 h-5 text-blue-400" />
                          <span className="text-xs font-semibold text-slate-300">
                            {slipFile ? slipFile.name : 'स्क्रीनशॉट चुनने के लिए यहाँ क्लिक करें'}
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
                          <div className="text-xs min-w-0 flex-1">
                            <span className="text-emerald-400 font-bold block">रसीद संलग्न हो गई</span>
                            <span className="text-[11px] text-slate-400 truncate block">
                              सत्यापन हेतु सबमिट करने के लिए तैयार
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* UTR / Transaction Ref */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-200 block">
                        UTR / UPI Transaction Reference Number (वैकल्पिक परंतु अनुशंसित)
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
                      {isReuploading && (
                        <button
                          type="button"
                          onClick={() => setIsReuploading(false)}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition"
                        >
                          रद्द करें
                        </button>
                      )}

                      {!isStrictlyLocked && (
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition"
                        >
                          बंद करें
                        </button>
                      )}

                      <button
                        type="submit"
                        disabled={isSubmitting || !slipPreview}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition shadow-emerald-600/30 active:scale-95"
                      >
                        {isSubmitting ? (
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
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Slip Zoom Modal */}
      {selectedHistorySlip && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/95"
          onClick={() => setSelectedHistorySlip(null)}
        >
          <div className="relative max-w-xl w-full max-h-[90vh] bg-slate-900 rounded-2xl p-2 border border-slate-700 shadow-2xl flex flex-col">
            <div className="flex justify-between items-center p-2 border-b border-slate-800">
              <span className="text-xs font-bold text-white">भुगतान रसीद पूर्वावलोकन</span>
              <button
                type="button"
                onClick={() => setSelectedHistorySlip(null)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center flex-1">
              <img
                src={selectedHistorySlip}
                alt="Full Slip Preview"
                className="max-h-[75vh] w-auto object-contain rounded-lg border border-slate-800"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
