import React, { useState, useEffect } from 'react';
import { 
  Fingerprint, 
  ShieldCheck, 
  Lock, 
  RefreshCw, 
  AlertCircle, 
  LogOut, 
  KeyRound,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { authenticateWithBiometrics } from '../services/biometricService';

interface AppLockScreenProps {
  onUnlock: () => void;
  onSignOut?: () => void;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlock, onSignOut }) => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAuthenticate = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setErrorMessage(null);

    try {
      const result = await authenticateWithBiometrics('Authenticate to unlock Courier Rider Payout');
      if (result.success) {
        onUnlock();
      } else {
        setErrorMessage(result.error || 'Authentication was cancelled or failed. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Authentication error. Tap below to retry.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Trigger prompt once on mount with brief delay for smooth transition
  useEffect(() => {
    const timer = setTimeout(() => {
      handleAuthenticate();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      id="app-lock-screen"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl text-slate-100 select-none animate-in fade-in duration-300"
    >
      {/* Background radial gradient glow */}
      <div className="absolute inset-0 bg-radial from-blue-600/10 via-slate-950/80 to-slate-950 pointer-events-none" />

      <div className="relative z-10 max-w-sm w-full bg-slate-900/90 border border-slate-750 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center">
        {/* Top Security Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-6">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Device Security Active</span>
        </div>

        {/* Biometric / Lock Icon Pulsing Halo */}
        <div className="relative my-2">
          <div className="absolute -inset-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur-xl opacity-40 animate-pulse" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-slate-800 to-slate-700 border-2 border-blue-500/30 flex items-center justify-center shadow-inner">
            <Fingerprint className="w-10 h-10 text-blue-400 animate-pulse" />
            <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-emerald-500 text-slate-950 shadow-md">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Title & Subtitle */}
        <h2 className="text-xl sm:text-2xl font-black text-white mt-5">
          Courier Rider Payout
        </h2>
        <p className="text-xs text-blue-300/80 font-medium tracking-wide mt-1">
          कूरियर राइडर पेआउट लॉक है
        </p>

        <p className="text-xs text-slate-400 mt-3 leading-relaxed">
          Please authenticate with your Fingerprint, Face ID, or Device PIN to continue.
        </p>

        {/* Error message if cancelled or failed */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2 text-left w-full animate-shake">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-tight">{errorMessage}</span>
          </div>
        )}

        {/* Primary Action Button */}
        <button
          type="button"
          id="app-lock-unlock-btn"
          onClick={handleAuthenticate}
          disabled={isAuthenticating}
          className="w-full mt-6 py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white font-bold text-sm shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-60"
        >
          {isAuthenticating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
              <span>Verifying Device Security...</span>
            </>
          ) : (
            <>
              <Fingerprint className="w-4 h-4 text-blue-200" />
              <span>Unlock with Biometrics / PIN</span>
            </>
          )}
        </button>

        {/* Secondary fallback info */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-3">
          <KeyRound className="w-3 h-3 text-slate-400" />
          <span>PIN / Pattern fallback is automatically supported</span>
        </div>

        {/* Optional Sign Out Button */}
        {onSignOut && (
          <div className="mt-6 pt-4 border-t border-slate-800 w-full flex justify-center">
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-300 transition py-1 px-3 rounded-lg hover:bg-slate-800"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out / Switch Account</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
