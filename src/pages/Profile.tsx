import React, { useState, useEffect } from 'react';
import { 
  User as UserIcon, 
  Shield, 
  ShieldCheck, 
  Fingerprint, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Cloud, 
  CreditCard, 
  Lock, 
  Smartphone,
  Check,
  X,
  KeyRound
} from 'lucide-react';
import { auth, db } from '../firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { 
  isAppLockEnabled, 
  setAppLockEnabled, 
  authenticateWithBiometrics, 
  checkBiometryStatus,
  BiometryStatus 
} from '../services/biometricService';

interface ProfileProps {
  user?: FirebaseUser | null;
  onClose?: () => void;
  onOpenSubscription?: () => void;
}

export const Profile: React.FC<ProfileProps> = ({ 
  user = auth.currentUser, 
  onClose,
  onOpenSubscription 
}) => {
  const [appLockOn, setAppLockOn] = useState<boolean>(() => isAppLockEnabled());
  const [isVerifying, setIsVerifying] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [biometryInfo, setBiometryInfo] = useState<BiometryStatus | null>(null);

  useEffect(() => {
    checkBiometryStatus().then((status) => {
      setBiometryInfo(status);
    });

    const handleLockChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.enabled === 'boolean') {
        setAppLockOn(customEvent.detail.enabled);
      }
    };

    window.addEventListener('courier-payout:app-lock-changed', handleLockChanged);
    return () => {
      window.removeEventListener('courier-payout:app-lock-changed', handleLockChanged);
    };
  }, []);

  const handleToggleAppLock = async () => {
    if (isVerifying) return;
    setIsVerifying(true);
    setFeedbackMessage(null);

    const willEnable = !appLockOn;
    const reason = willEnable
      ? 'Verify your biometric or device screen lock to enable App Lock'
      : 'Verify your biometric or device screen lock to disable App Lock';

    try {
      // 1. Trigger test prompt to verify device ownership before changing state
      const result = await authenticateWithBiometrics(reason);
      if (result.success) {
        await setAppLockEnabled(willEnable, user?.uid);
        setAppLockOn(willEnable);
        setFeedbackMessage({
          type: 'success',
          text: willEnable
            ? 'App Lock enabled! Your app is now protected by biometrics/PIN.'
            : 'App Lock disabled successfully.',
        });
        setTimeout(() => setFeedbackMessage(null), 4000);
      } else {
        setFeedbackMessage({
          type: 'error',
          text: result.error || 'Verification was cancelled. App lock setting was not changed.',
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Biometric verification error. Please retry.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const initial = user?.displayName
    ? user.displayName.charAt(0).toUpperCase()
    : user?.email
    ? user.email.charAt(0).toUpperCase()
    : 'U';

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <UserIcon className="w-6 h-6 text-blue-400" />
            <span>Profile & Security Settings</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage your account, device biometrics, and security preferences
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* User Profile Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-800/80 border border-slate-750 flex items-center gap-4">
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'User'}
            className="w-14 h-14 rounded-full object-cover border-2 border-blue-500/40 shadow-md shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-xl flex items-center justify-center shrink-0 shadow-md">
            {initial}
          </div>
        )}
        <div className="overflow-hidden">
          <div className="font-bold text-white text-base truncate">
            {user?.displayName || 'Courier Hub Manager'}
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">
            {user?.email || 'Logged in via Google'}
          </div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold">
            <ShieldCheck className="w-3 h-3" />
            <span>Active Operator</span>
          </div>
        </div>
      </div>

      {/* Security & App Lock Card */}
      <div className="p-5 rounded-2xl bg-slate-850 border border-slate-750 space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                Device Security & Biometric Lock
              </h3>
              <p className="text-xs text-slate-400">
                Prevent unauthorized access to courier parcels and payouts
              </p>
            </div>
          </div>

          {biometryInfo && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium">
              <Smartphone className="w-3.5 h-3.5 text-blue-400" />
              <span>{biometryInfo.biometryTypeName}</span>
            </span>
          )}
        </div>

        {/* The Mandatory App Lock Toggle */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-750 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="font-bold text-white text-sm flex items-center gap-2">
              <span>App Lock (Fingerprint / Face ID / PIN)</span>
              {appLockOn && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Enabled
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Protect your app using your phone's biometric or screen lock
            </p>
            <div className="text-[11px] text-blue-400/80 flex items-center gap-1.5 pt-0.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>PIN / Pattern / Password fallback is supported automatically</span>
            </div>
          </div>

          {/* Toggle Switch Button */}
          <button
            type="button"
            role="switch"
            aria-checked={appLockOn}
            id="profile-app-lock-toggle"
            onClick={handleToggleAppLock}
            disabled={isVerifying}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
              appLockOn ? 'bg-blue-600' : 'bg-slate-700'
            }`}
          >
            <span className="sr-only">Toggle App Lock</span>
            {isVerifying ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  appLockOn ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            )}
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2 animate-in fade-in ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-red-500/10 border-red-500/20 text-red-300'
            }`}
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <span className="leading-tight">{feedbackMessage.text}</span>
          </div>
        )}
      </div>

      {/* Cloud & Subscription Card */}
      <div className="p-5 rounded-2xl bg-slate-850 border border-slate-750 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                Cloud Sync & Subscription
              </h3>
              <p className="text-xs text-slate-400">
                Multi-device ledger persistence and real-time updates
              </p>
            </div>
          </div>
          {onOpenSubscription && (
            <button
              type="button"
              onClick={onOpenSubscription}
              className="py-1.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Plans</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
