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
  Sparkles,
  UserCheck,
  ArrowLeft,
  Eye,
  EyeOff
} from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { authenticateWithBiometrics, setAppLockEnabled } from '../services/biometricService';

interface AppLockScreenProps {
  onUnlock: () => void;
  onSignOut?: () => void;
  currentUserEmail?: string;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ 
  onUnlock, 
  onSignOut,
  currentUserEmail 
}) => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Emergency Account Unlock state
  const [showEmergencyUnlock, setShowEmergencyUnlock] = useState(false);
  const [emergencyPassword, setEmergencyPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);
  const [disableLockOnUnlock, setDisableLockOnUnlock] = useState(true);

  const activeEmail = currentUserEmail || auth.currentUser?.email || '';

  const handleAuthenticate = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setErrorMessage(null);

    try {
      const result = await authenticateWithBiometrics('Unlock Courier Rider Payout');
      if (result.success) {
        try {
          sessionStorage.setItem('cp_unlocked_this_session', 'true');
        } catch {}
        onUnlock();
      } else {
        setErrorMessage(
          result.error || 'Authentication was cancelled or failed. Please try again or use Emergency Unlock below.'
        );
      }
    } catch (err: any) {
      console.error('Biometric authentication error:', err);
      setErrorMessage(err?.message || 'Biometric verification error. Tap below or use Emergency Unlock.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Trigger prompt once on mount with brief delay for smooth transition
  useEffect(() => {
    const timer = setTimeout(() => {
      handleAuthenticate();
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  // Emergency Unlock with Active Firebase Session
  const handleSessionRecoveryUnlock = async () => {
    try {
      if (disableLockOnUnlock) {
        await setAppLockEnabled(false, auth.currentUser?.uid);
      }
      try {
        sessionStorage.setItem('cp_unlocked_this_session', 'true');
      } catch {}
      onUnlock();
    } catch (err: any) {
      console.error('Emergency session unlock error:', err);
      onUnlock();
    }
  };

  // Emergency Unlock with Password Verification
  const handlePasswordUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!emergencyPassword) {
      setEmergencyError('Please enter your account password.');
      return;
    }

    if (!activeEmail) {
      setEmergencyError('No account email found. Please use session unlock or sign in.');
      return;
    }

    setIsVerifyingPassword(true);
    setEmergencyError(null);

    try {
      await signInWithEmailAndPassword(auth, activeEmail, emergencyPassword);
      if (disableLockOnUnlock) {
        await setAppLockEnabled(false, auth.currentUser?.uid);
      }
      try {
        sessionStorage.setItem('cp_unlocked_this_session', 'true');
      } catch {}
      onUnlock();
    } catch (err: any) {
      console.error('Emergency password verification error:', err);
      setEmergencyError(err?.message || 'Invalid password. If forgotten, tap Verified Session Unlock.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  return (
    <div 
      id="app-lock-screen"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl text-slate-100 select-none animate-in fade-in duration-300"
    >
      {/* Background radial gradient glow */}
      <div className="absolute inset-0 bg-radial from-blue-600/10 via-slate-950/80 to-slate-950 pointer-events-none" />

      <div className="relative z-10 max-w-sm w-full bg-slate-900/90 border border-slate-750 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center">
        
        {!showEmergencyUnlock ? (
          <>
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

            {/* EMERGENCY FAILSAFE / OVERRIDE BUTTON */}
            <div className="mt-5 pt-4 border-t border-slate-800 w-full flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => setShowEmergencyUnlock(true)}
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium underline underline-offset-4 cursor-pointer transition py-1 px-2 rounded hover:bg-blue-950/40"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Forgot / Stuck? Unlock with Account Credentials</span>
              </button>

              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-300 transition py-1 px-3 rounded-lg hover:bg-slate-800"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out / Switch Account</span>
                </button>
              )}
            </div>
          </>
        ) : (
          /* EMERGENCY UNLOCK VIEW */
          <div className="w-full text-left">
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setShowEmergencyUnlock(false)}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition py-1 px-2 rounded-lg hover:bg-slate-800"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                Emergency Recovery
              </span>
            </div>

            <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-white truncate">
                  {activeEmail || 'Verified Hub Account'}
                </div>
                <div className="text-[11px] text-slate-400">
                  Authorized Session Override
                </div>
              </div>
            </div>

            {emergencyError && (
              <div className="mb-4 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-tight">{emergencyError}</span>
              </div>
            )}

            {/* Option A: Fast One-Tap Verified Session Unlock */}
            {auth.currentUser && (
              <div className="mb-4 p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/30">
                <div className="text-xs font-bold text-blue-200 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Instant Session Recovery</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed mb-3">
                  Your device has a verified login session. Tap below to immediately unlock the dashboard.
                </p>
                <button
                  type="button"
                  onClick={handleSessionRecoveryUnlock}
                  className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-98"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify Session & Unlock App</span>
                </button>
              </div>
            )}

            {/* Option B: Account Password Form */}
            {activeEmail && (
              <form onSubmit={handlePasswordUnlock} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Enter Account Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={emergencyPassword}
                      onChange={(e) => setEmergencyPassword(e.target.value)}
                      placeholder="Account Password"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isVerifyingPassword}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                >
                  {isVerifyingPassword ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>Unlock with Password</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Disable App Lock Checkbox Option */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={disableLockOnUnlock}
                  onChange={(e) => setDisableLockOnUnlock(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Turn off App Lock on this device to prevent future lockouts</span>
              </label>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
