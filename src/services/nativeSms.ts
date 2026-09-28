import { Capacitor, registerPlugin } from '@capacitor/core';

export interface BackgroundSmsPlugin {
  sendSms(options: { phoneNumber: string; message: string }): Promise<{
    success: boolean;
    message?: string;
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
 * Seamlessly requests runtime SEND_SMS and READ_PHONE_STATE permissions when running inside native Android APK.
 */
export async function ensureSmsPermissions(): Promise<boolean> {
  if (!isNativeAndroid()) return true;
  try {
    const status = await BackgroundSms.checkSmsPermissions();
    if (status && status.hasPermission) {
      return true;
    }
    const req = await BackgroundSms.requestSmsPermissions();
    return Boolean(req && req.granted);
  } catch (err) {
    console.warn('Error checking/requesting SMS permissions:', err);
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
 * Dispatches an SMS directly via the device's native SIM card in the background (Khatabook style).
 * Automatically requests runtime permission and records into system sent messages.
 * Falls back to web intent in non-native environments.
 */
export async function sendNativeBackgroundSms(
  phoneNumber: string,
  message: string
): Promise<SendNativeSmsResult> {
  const cleanPhone = (phoneNumber || '').trim().replace(/\D/g, '').slice(-10);
  if (!cleanPhone || cleanPhone.length < 10) {
    return {
      success: false,
      isNative: isNativeAndroid(),
      error: 'अमान्य फोन नंबर (Invalid 10-digit phone number)',
    };
  }

  const targetNumber = `+91${cleanPhone}`;

  if (isNativeAndroid()) {
    try {
      // 1. Ensure runtime SEND_SMS permission
      const hasPermission = await ensureSmsPermissions();
      if (!hasPermission) {
        return {
          success: false,
          isNative: true,
          error: 'SMS अनुमति अस्वीकृत (SMS permission denied in Android Settings)',
        };
      }

      // 2. Dispatch directly via native SIM SmsManager
      const res = await BackgroundSms.sendSms({
        phoneNumber: targetNumber,
        message,
      });

      if (res && res.success) {
        return {
          success: true,
          isNative: true,
          message: '✅ सिम से SMS सफलतापूर्वक भेजा गया।',
        };
      } else {
        return {
          success: false,
          isNative: true,
          error: res?.message || 'सिम से SMS नहीं भेजा जा सका',
        };
      }
    } catch (pluginErr: any) {
      console.error('Native SIM SMS dispatch error:', pluginErr);
      return {
        success: false,
        isNative: true,
        error: pluginErr?.message || 'सिम से SMS नहीं भेजा जा सका',
      };
    }
  }

  // Web Browser / Desktop standard fallback
  try {
    const encodedBody = encodeURIComponent(message);
    const smsUri = `sms:+91${cleanPhone}?body=${encodedBody}`;
    window.open(smsUri, '_blank');
    return {
      success: true,
      isNative: false,
      message: '✅ SMS ऐप खोला गया',
    };
  } catch (err: any) {
    console.error('Failed to open standard SMS intent:', err);
    return {
      success: false,
      isNative: false,
      error: err?.message || 'SMS भेजने में विफलता',
    };
  }
}

/**
 * Standard WhatsApp share link
 */
export function getWhatsAppShareUrl(phoneNumber: string, message: string): string {
  const cleanPhone = (phoneNumber || '').trim().replace(/\D/g, '').slice(-10);
  return `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
}
