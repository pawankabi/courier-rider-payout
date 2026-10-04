import { BiometricAuth, BiometryType, CheckBiometryResult } from '@aparajita/capacitor-biometric-auth';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export const APP_LOCK_STORAGE_KEY = 'cp_app_lock_enabled';

export interface BiometryStatus {
  isAvailable: boolean;
  deviceIsSecure: boolean;
  biometryType: BiometryType;
  biometryTypeName: string;
  reason?: string;
}

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
 * Friendly name for detected biometry type.
 */
export function getBiometryTypeName(type: BiometryType): string {
  switch (type) {
    case BiometryType.touchId:
      return 'Touch ID';
    case BiometryType.faceId:
      return 'Face ID';
    case BiometryType.fingerprintAuthentication:
      return 'Fingerprint';
    case BiometryType.faceAuthentication:
      return 'Face Unlock';
    case BiometryType.irisAuthentication:
      return 'Iris Scanner';
    default:
      return 'Screen Lock (PIN/Pattern)';
  }
}

/**
 * Checks hardware and enrollment status of biometrics on this device.
 */
export async function checkBiometryStatus(): Promise<BiometryStatus> {
  try {
    const result: CheckBiometryResult = await BiometricAuth.checkBiometry();
    return {
      isAvailable: result.isAvailable || result.deviceIsSecure,
      deviceIsSecure: result.deviceIsSecure,
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
      biometryTypeName: 'Device Security / PIN',
      reason: err?.message,
    };
  }
}

/**
 * Triggers native Biometric / Screen Lock authentication prompt.
 * Automatically allows PIN, Pattern, or Password fallback via `allowDeviceCredential: true`.
 */
export async function authenticateWithBiometrics(
  reason = 'Unlock Courier Rider Payout'
): Promise<{ success: boolean; error?: string }> {
  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancel',
      allowDeviceCredential: true, // Required for Device PIN/Pattern fallback
      iosFallbackTitle: 'Use Passcode',
    });
    return { success: true };
  } catch (err: any) {
    console.error('Biometric authentication error (attempt 1):', err);
    const errMsg = String(err?.message || err || '').toLowerCase();
    
    // In Android BiometricPrompt, some vendor devices reject if cancelTitle is passed alongside allowDeviceCredential
    if (errMsg.includes('negative') || errMsg.includes('credential') || errMsg.includes('button')) {
      try {
        await BiometricAuth.authenticate({
          reason,
          allowDeviceCredential: true,
          iosFallbackTitle: 'Use Passcode',
        });
        return { success: true };
      } catch (retryErr: any) {
        console.error('Biometric authentication retry error:', retryErr);
        return {
          success: false,
          error: retryErr?.message || 'Authentication cancelled or failed',
        };
      }
    }

    return {
      success: false,
      error: err?.message || 'Authentication cancelled or failed',
    };
  }
}
