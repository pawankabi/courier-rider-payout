import { BiometricAuth, BiometryType, CheckBiometryResult } from '@aparajita/capacitor-biometric-auth';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export const APP_LOCK_STORAGE_KEY = 'cp_app_lock_enabled';
export const APP_LOCK_LAST_ACTIVE_KEY = 'cp_app_lock_last_active';
export const APP_LOCK_BG_TIME_KEY = 'cp_app_lock_bg_time';

/**
 * 15-Minute Timeout strictly enforced:
 * The app will ONLY lock if the phone screen has been off or the app has been in the
 * background / completely inactive for at least 15 minutes (900,000 ms).
 * It will NEVER lock while the user is actively working inside the app.
 */
export const APP_LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes = 900,000 ms

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
 */
export function isAppLockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
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
      isAvailable: true, // Allow attempt with device credential fallback
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
  try {
    // If running in pure browser web without plugin support
    if (typeof window === 'undefined') {
      return { success: true };
    }

    // Standard Android/iOS Biometric + Screen Lock Credential authentication
    await BiometricAuth.authenticate({
      reason,
      allowDeviceCredential: true, // Required for Device PIN/Pattern fallback
      iosFallbackTitle: 'Use Passcode',
    });

    // Successfully verified!
    recordAppUnlock();
    return { success: true };
  } catch (err: any) {
    console.warn('Biometric authentication primary attempt notice:', err);
    const errMsg = String(err?.message || err || '').toLowerCase();

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

    // Secondary attempt with explicit fallback
    try {
      await BiometricAuth.authenticate({
        reason,
        allowDeviceCredential: true,
        iosFallbackTitle: 'Enter PIN',
      });
      recordAppUnlock();
      return { success: true };
    } catch (retryErr: any) {
      console.warn('Biometric authentication retry notice:', retryErr);
      const retryMsg = String(retryErr?.message || retryErr || '').toLowerCase();
      if (retryMsg.includes('cancel') || retryMsg.includes('user') || retryMsg.includes('negative')) {
        return {
          success: false,
          error: 'प्रमाणीकरण रद्द हुआ। कृपया दोबारा प्रयास करें।',
        };
      }
      return {
        success: false,
        error: retryErr?.message || 'बायोमेट्रिक प्रमाणीकरण विफल रहा। नीचे आपातकालीन पासवर्ड का उपयोग करें।',
      };
    }
  }
}
