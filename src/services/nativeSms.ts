import { Capacitor, registerPlugin } from '@capacitor/core';

export interface BackgroundSmsPlugin {
  sendSms(options: { phoneNumber: string; message: string }): Promise<{
    success: boolean;
    recipient?: string;
    partsCount?: number;
  }>;
  checkSmsPermissions(): Promise<{ hasPermission: boolean }>;
  requestSmsPermissions(): Promise<{ granted: boolean }>;
}

export const BackgroundSms = registerPlugin<BackgroundSmsPlugin>('BackgroundSms');

/**
 * Checks whether the app is currently running inside a native Android APK container.
 */
export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * General check for any native mobile container.
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Checks and requests android.permission.SEND_SMS and android.permission.READ_PHONE_STATE permissions at runtime.
 */
export async function ensureSmsPermissions(): Promise<boolean> {
  if (!isNativeAndroid()) {
    return false;
  }

  try {
    const status = await BackgroundSms.checkSmsPermissions();
    if (status && status.hasPermission) {
      return true;
    }

    const requestRes = await BackgroundSms.requestSmsPermissions();
    return Boolean(requestRes && requestRes.granted);
  } catch (err) {
    console.warn('Native SMS permission check/request warning:', err);
    return false;
  }
}

export interface SendNativeSmsResult {
  success: boolean;
  isNative: boolean;
  message?: string;
  error?: string;
}

/**
 * Sends a background SMS directly via the Android device default SIM card
 * without opening the system SMS composer intent.
 */
export async function sendNativeBackgroundSms(
  phoneNumber: string,
  message: string
): Promise<SendNativeSmsResult> {
  if (!isNativeAndroid()) {
    return {
      success: false,
      isNative: false,
      message: 'Not running in native Android container',
    };
  }

  const cleanPhone = (phoneNumber || '').trim().replace(/\D/g, '').slice(-10);
  if (!cleanPhone || cleanPhone.length < 10) {
    return {
      success: false,
      isNative: true,
      error: 'अमान्य फोन नंबर (Invalid 10-digit phone number)',
    };
  }

  try {
    const hasPerm = await ensureSmsPermissions();
    if (!hasPerm) {
      return {
        success: false,
        isNative: true,
        error: 'SMS अनुमति अस्वीकृत (SMS permission denied)',
      };
    }

    const res = await BackgroundSms.sendSms({
      phoneNumber: `+91${cleanPhone}`,
      message,
    });

    if (res && res.success) {
      return {
        success: true,
        isNative: true,
        message: '✅ सिम से SMS सफलतापूर्वक भेजा गया।',
      };
    }

    return {
      success: false,
      isNative: true,
      error: 'सिम से SMS भेजने में विफलता।',
    };
  } catch (err: any) {
    console.error('sendNativeBackgroundSms error:', err);
    return {
      success: false,
      isNative: true,
      error: err?.message || 'सिम से SMS भेजने में विफलता।',
    };
  }
}
