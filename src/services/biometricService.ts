import { 
  BiometricAuth, 
  BiometryType, 
  CheckBiometryResult,
  AndroidBiometryStrength 
} from '@aparajita/capacitor-biometric-auth';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { isNativeAndroid } from './nativeSms';

export const APP_LOCK_STORAGE_KEY = 'cp_app_lock_enabled';
export const APP_LOCK_LAST_ACTIVE_KEY = 'cp_app_lock_last_active';
export const APP_LOCK_BG_TIME_KEY = 'cp_app_lock_bg_time';

/**
 * 0-Second Instant Lock on Screen Off / App Background:
 * As long as the user is actively working inside the app, it NEVER locks.
 * But as soon as the screen turns off or the app is put in the background,
 * it locks immediately (0-second timeout) and prompts to unlock upon returning.
 */
export const APP_LOCK_TIMEOUT_MS = 0; // 0 seconds = instant lock on screen off / minimize

export interface BiometryStatus {
  isAvailable: boolean;
  deviceIsSecure: boolean;
  biometryType: BiometryType;
  biometryTypeName: string;
  reason?: string;
}

// In-memory cache for high-frequency activity events
let memoryLastActive = Date.now();
let lastStorageWriteTime = 0;

/**
 * Checks if the user has enabled App Lock on this device.
 * STRICT: App Lock is ONLY available inside the native Android APK.
 * Never requests or triggers inside web browsers!
 */
export function isAppLockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isNativeAndroid()) return false;
  try {
    return localStorage.getItem(APP_LOCK_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persists user preference for App Lock in localStorage and Firestore.
 */
export async function setAppLockEnabled(enabled: boolean, userId?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(APP_LOCK_STORAGE_KEY, enabled ? 'true' : 'false');
    if (enabled) {
      recordUserActivity(true);
    } else {
      localStorage.removeItem(APP_LOCK_BG_TIME_KEY);
      sessionStorage.setItem('cp_unlocked_this_session', 'true');
    }
    window.dispatchEvent(
      new CustomEvent('courier-payout:app-lock-changed', {
        detail: { enabled },
      })
    );
  } catch (err) {
    console.warn('Failed to save app lock preference to localStorage:', err);
  }

  // Also persist to Firestore if user is authenticated
  const targetId = userId || auth.currentUser?.uid;
  if (targetId) {
    try {
      const updateData = {
        appLockEnabled: enabled,
        appLockUpdatedAt: new Date().toISOString(),
      };
      await Promise.all([
        setDoc(doc(db, 'users', targetId), updateData, { merge: true }),
        setDoc(doc(db, 'all_users', targetId), updateData, { merge: true }),
      ]);
    } catch (err) {
      console.warn('Failed to update app lock preference in Firestore:', err);
    }
  }
}

/**
 * Records user interaction (touch, click, typing, scrolling).
 * Throttled to avoid unnecessary localStorage writes.
 * Ensures the app NEVER locks while the user is working.
 */
export function recordUserActivity(forceImmediate = false): void {
  const now = Date.now();
  memoryLastActive = now;
  if (typeof window === 'undefined') return;

  // Throttle localStorage updates to at most once every 5 seconds
  if (forceImmediate || now - lastStorageWriteTime >= 5000) {
    try {
      localStorage.setItem(APP_LOCK_LAST_ACTIVE_KEY, String(now));
      lastStorageWriteTime = now;
    } catch {}
  }
}

/**
 * Called when the app enters background or the phone screen turns off.
 * Saves the exact timestamp when the user stopped viewing the app.
 */
export function recordAppBackground(): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    localStorage.setItem(APP_LOCK_BG_TIME_KEY, String(now));
    localStorage.setItem(APP_LOCK_LAST_ACTIVE_KEY, String(now));
  } catch {}
}

/**
 * Called when the app is successfully unlocked with fingerprint/PIN.
 * Resets the background timer and refreshes user activity.
 */
export function recordAppUnlock(): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    memoryLastActive = now;
    localStorage.setItem(APP_LOCK_LAST_ACTIVE_KEY, String(now));
    localStorage.removeItem(APP_LOCK_BG_TIME_KEY);
    sessionStorage.setItem('cp_unlocked_this_session', 'true');
  } catch {}
}

/**
 * Determines whether the App Lock Screen should be displayed.
 * STRICT RULE:
 * Returns true ONLY if:
 * 1. App Lock is enabled, AND
 * 2. The phone screen was off / app was in background for >= 15 minutes, OR
 *    The user was completely inactive for >= 15 minutes.
 * If the user has been active within the last 15 minutes, returns FALSE.
 */
export function shouldTriggerAppLock(): boolean {
  if (!isNativeAndroid()) return false;
  if (!isAppLockEnabled()) return false;
  if (typeof window === 'undefined') return false;

  const now = Date.now();

  // 1. Check background duration (screen off or app switched away)
  try {
    const bgTimeStr = localStorage.getItem(APP_LOCK_BG_TIME_KEY);
    if (bgTimeStr) {
      const bgTime = Number(bgTimeStr);
      if (!isNaN(bgTime) && bgTime > 0) {
        const bgDuration = now - bgTime;
        if (bgDuration >= APP_LOCK_TIMEOUT_MS) {
          return true; // Screen was off / backgrounded for 15+ minutes
        } else {
          // Came back before 15 minutes! Do not lock.
          return false;
        }
      }
    }
  } catch {}

  // 2. Check inactivity duration
  try {
    const lastActiveStr = localStorage.getItem(APP_LOCK_LAST_ACTIVE_KEY);
    const lastActive = lastActiveStr ? Number(lastActiveStr) : memoryLastActive;
    if (!isNaN(lastActive) && lastActive > 0) {
      const inactiveDuration = now - lastActive;
      if (inactiveDuration >= APP_LOCK_TIMEOUT_MS) {
        return true; // Inactive for 15+ minutes
      }
    }
  } catch {}

  return false;
}

/**
 * Friendly name for detected biometry type.
 */
export function getBiometryTypeName(type: BiometryType): string {
  switch (type) {
    case BiometryType.touchId:
      return 'Touch ID';
    case BiometryType.faceId:
      return 'Face ID';
    case BiometryType.fingerprintAuthentication:
      return 'Fingerprint (फिंगरप्रिंट)';
    case BiometryType.faceAuthentication:
      return 'Face Unlock';
    case BiometryType.irisAuthentication:
      return 'Iris Scanner';
    default:
      return 'Screen Lock (PIN / Pattern / Fingerprint)';
  }
}

/**
 * Checks hardware and enrollment status of biometrics on this device.
 */
export async function checkBiometryStatus(): Promise<BiometryStatus> {
  if (!isNativeAndroid()) {
    return {
      isAvailable: false,
      deviceIsSecure: false,
      biometryType: BiometryType.none,
      biometryTypeName: 'Web Browser (Not Supported)',
      reason: 'Biometrics is only supported in the native Android app.',
    };
  }

  try {
    const result: CheckBiometryResult = await BiometricAuth.checkBiometry();
    return {
      isAvailable: Boolean(result.isAvailable || result.deviceIsSecure),
      deviceIsSecure: Boolean(result.deviceIsSecure),
      biometryType: result.biometryType,
      biometryTypeName: getBiometryTypeName(result.biometryType),
      reason: result.reason,
    };
  } catch (err: any) {
    console.warn('Error checking biometry status:', err);
    return {
      isAvailable: true, // Allow attempt with device credential fallback on Android
      deviceIsSecure: true,
      biometryType: BiometryType.none,
      biometryTypeName: 'Device PIN / Pattern / Biometrics',
      reason: err?.message,
    };
  }
}

/**
 * Triggers native Biometric / Screen Lock authentication prompt.
 * Automatically allows PIN, Pattern, or Password fallback via `allowDeviceCredential: true`.
 * Carefully handles device-specific constraints to avoid crashing or force-closing.
 */
export async function authenticateWithBiometrics(
  reason = 'Courier Rider Payout अनलॉक करें'
): Promise<{ success: boolean; error?: string }> {
  // STRICT: Never request biometric authentication on Web browsers!
  if (!isNativeAndroid() || typeof window === 'undefined') {
    return { success: true };
  }

  try {
    // Primary Android Biometric + Screen Lock Credential authentication
    // CRITICAL SETTINGS FOR 1-TOUCH INSTANT FINGERPRINT UNLOCK:
    // 1. androidConfirmationRequired: false -> Android default is true (which waits for an on-screen
    //    confirm button tap, causing users to tap the sensor repeatedly, registering multiple failed touches).
    //    Setting false dismisses the dialog immediately upon touching the sensor!
    // 2. androidBiometryStrength: AndroidBiometryStrength.strong -> On Android 11+ (API 30+),
    //    DEVICE_CREDENTIAL can only be paired with BIOMETRIC_STRONG (Class 3 hardware). Pairing with weak
    //    causes the OS to reject the fingerprint or force-route to password/PIN.
    // 3. androidTitle and androidSubtitle -> Required for official Android BiometricPrompt specs.
    await BiometricAuth.authenticate({
      reason,
      androidTitle: 'Courier Rider Payout',
      androidSubtitle: 'फिंगरप्रिंट लगाएं या स्क्रीन लॉक पिन दर्ज करें',
      androidConfirmationRequired: false,
      androidBiometryStrength: AndroidBiometryStrength.strong,
      allowDeviceCredential: true,
      cancelTitle: 'रद्द करें (Cancel)',
      iosFallbackTitle: 'Use Passcode',
    });

    // Successfully verified!
    recordAppUnlock();
    return { success: true };
  } catch (err: any) {
    console.warn('Biometric authentication primary attempt notice:', err);
    const errMsg = String(err?.message || err?.code || err || '').toLowerCase();

    // Check if error is user-initiated cancellation or back button
    if (
      errMsg.includes('cancel') ||
      errMsg.includes('user') ||
      errMsg.includes('negative') ||
      errMsg.includes('canceled')
    ) {
      return {
        success: false,
        error: 'प्रमाणीकरण रद्द हुआ। फिंगरप्रिंट लगाएं या पासवर्ड द्वारा अनलॉक करें। (Authentication cancelled)',
      };
    }

    // Failsafe fallback: On legacy Android devices (Android 9/10 API 28-29) where BIOMETRIC_STRONG | DEVICE_CREDENTIAL
    // was restricted, retry with weak biometry strength
    if (
      errMsg.includes('lockout') || 
      errMsg.includes('unsupported') || 
      errMsg.includes('incompatible') || 
      errMsg.includes('invalid')
    ) {
      try {
        await BiometricAuth.authenticate({
          reason,
          androidTitle: 'Courier Rider Payout',
          androidSubtitle: 'डिवाइस स्क्रीन लॉक पिन या पासवर्ड दर्ज करें',
          androidConfirmationRequired: false,
          androidBiometryStrength: AndroidBiometryStrength.weak,
          allowDeviceCredential: true,
          cancelTitle: 'रद्द करें',
          iosFallbackTitle: 'Enter PIN',
        });
        recordAppUnlock();
        return { success: true };
      } catch (fallbackErr: any) {
        console.warn('Biometric fallback authentication error:', fallbackErr);
        const fallbackMsg = String(fallbackErr?.message || fallbackErr?.code || fallbackErr || '').toLowerCase();
        if (
          fallbackMsg.includes('cancel') ||
          fallbackMsg.includes('user') ||
          fallbackMsg.includes('negative') ||
          fallbackMsg.includes('canceled')
        ) {
          return {
            success: false,
            error: 'प्रमाणीकरण रद्द हुआ। कृपया फिंगरप्रिंट लगाएं या पासवर्ड दर्ज करें।',
          };
        }
        return {
          success: false,
          error: fallbackErr?.message || 'बायोमेट्रिक प्रमाणीकरण विफल रहा। नीचे आपातकालीन पासवर्ड का उपयोग करें।',
        };
      }
    }

    return {
      success: false,
      error: err?.message || 'बायोमेट्रिक प्रमाणीकरण विफल रहा। नीचे आपातकालीन पासवर्ड का उपयोग करें।',
    };
  }
}
