import React, { useState, useEffect } from 'react';
import { 
  Fingerprint, 
  ShieldCheck, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2,
  Lock
} from 'lucide-react';
import { 
  isAppLockEnabled, 
  setAppLockEnabled, 
  authenticateWithBiometrics,
  checkBiometryStatus,
  BiometryStatus 
} from '../services/biometricService';
import { isNativeAndroid } from '../services/nativeSms';

interface AppLockSettingRowProps {
  userId?: string;
  onStatusChanged?: (enabled: boolean) => void;
  className?: string;
}

export const AppLockSettingRow: React.FC<AppLockSettingRowProps> = ({
  userId,
  onStatusChanged,
  className = '',
}) => {
  // Never show on Web browsers
  if (!isNativeAndroid()) {
    return null;
  }

  const [enabled, setEnabled] = useState<boolean>(() => isAppLockEnabled());
  const [isChanging, setIsChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [biometryInfo, setBiometryInfo] = useState<BiometryStatus | null>(null);

  useEffect(() => {
    checkBiometryStatus().then((status) => {
      setBiometryInfo(status);
    });

    const handleLockChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ enabled: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.enabled === 'boolean') {
        setEnabled(customEvent.detail.enabled);
      }
    };

    window.addEventListener('courier-payout:app-lock-changed', handleLockChanged);
    return () => {
      window.removeEventListener('courier-payout:app-lock-changed', handleLockChanged);
    };
  }, []);

  const handleToggle = async () => {
    if (isChanging) return;
    setIsChanging(true);
    setError(null);
    setSuccessMessage(null);

    const targetState = !enabled;
    const promptReason = targetState
      ? 'फिंगरप्रिंट या स्क्रीन लॉक पिन द्वारा ऐप लॉक सक्रिय करें'
      : 'फिंगरप्रिंट या स्क्रीन लॉक पिन द्वारा ऐप लॉक बंद करें';

    try {
      const authResult = await authenticateWithBiometrics(promptReason);
      if (authResult.success) {
        await setAppLockEnabled(targetState, userId);
        setEnabled(targetState);
        onStatusChanged?.(targetState);
        setSuccessMessage(
          targetState
            ? '0-सेकंड तत्काल सुरक्षा लॉक सक्रिय! स्क्रीन बंद होते ही तुरंत लॉक होगा, ऐप में काम करते समय कोई रुकावट नहीं होगी।'
            : 'ऐप लॉक सफलतापूर्वक बंद कर दिया गया।'
        );
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setError(authResult.error || 'सत्यापन रद्द हुआ। सेटिंग में कोई बदलाव नहीं हुआ।');
      }
    } catch (err: any) {
      setError(err?.message || 'Verification error. Please try again.');
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div className={`p-3 rounded-2xl bg-slate-900/90 border border-slate-750 space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0 mt-0.5">
            <Fingerprint className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-white text-xs flex items-center gap-1.5">
              <span>App Lock (फिंगरप्रिंट / Face ID / PIN)</span>
              {enabled && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold inline-flex items-center gap-0.5">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  0-Sec Lock Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
              स्क्रीन बंद होते ही तुरंत फिंगरप्रिंट लॉक सक्रिय होगा। ऐप में काम करते समय कभी लॉक नहीं होगा।
            </p>
            {biometryInfo && (
              <span className="text-[10px] text-blue-400 font-medium inline-block mt-0.5">
                डिवाइस हार्डवेयर: {biometryInfo.biometryTypeName}
              </span>
            )}
          </div>
        </div>

        {/* Clean Toggle Switch */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          id="app-lock-toggle-switch"
          onClick={handleToggle}
          disabled={isChanging}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
            enabled ? 'bg-blue-600' : 'bg-slate-700'
          }`}
        >
          <span className="sr-only">Toggle App Lock</span>
          {isChanging ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <RefreshCw className="w-3 h-3 text-white animate-spin" />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          )}
        </button>
      </div>

      {enabled && (
        <div className="pt-1 flex items-center justify-between border-t border-slate-800/80">
          <span className="text-[10px] text-slate-400">
            हार्डवेयर टेस्ट:
          </span>
          <button
            type="button"
            onClick={async () => {
              setIsChanging(true);
              setError(null);
              setSuccessMessage(null);
              try {
                const res = await authenticateWithBiometrics('फिंगरप्रिंट सेंसर टेस्ट');
                if (res.success) {
                  setSuccessMessage('✅ फिंगरप्रिंट सेंसर सक्रिय है और 100% सही काम कर रहा है!');
                  setTimeout(() => setSuccessMessage(null), 4000);
                } else {
                  setError(res.error || 'सत्यापन रद्द हुआ।');
                }
              } catch (e: any) {
                setError(e?.message || 'बायोमेट्रिक एरर');
              } finally {
                setIsChanging(false);
              }
            }}
            disabled={isChanging}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-blue-300 border border-blue-500/30 text-[11px] font-semibold transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Fingerprint className="w-3 h-3 text-blue-400" />
            <span>सेंसर टेस्ट करें (Test Now)</span>
          </button>
        </div>
      )}

      {/* Success notification */}
      {successMessage && (
        <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-1.5 animate-in fade-in">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error notification */}
      {error && (
        <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] flex items-center gap-1.5 animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span className="truncate">{error}</span>
        </div>
      )}
    </div>
  );
};
