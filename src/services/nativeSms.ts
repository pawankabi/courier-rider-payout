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
 * Safe permission check: Standard intents do not require dangerous background permissions.
 * Keeps banking apps and Google Play Protect 100% safe and unflagged.
 */
export async function ensureSmsPermissions(): Promise<boolean> {
  return true;
}

export interface SendNativeSmsResult {
  success: boolean;
  isNative: boolean;
  message?: string;
  error?: string;
}

/**
 * Safely dispatches an SMS using standard intent (sms: or native ACTION_SENDTO).
 * Zero dangerous background permissions (SEND_SMS / READ_SMS / READ_PHONE_STATE)
 * ensuring full compatibility with banking apps (GPay, PhonePe, Paytm) and Google Play Protect.
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

  // If in native Android container, try the native plugin which invokes standard Intent.ACTION_SENDTO
  if (isNativeAndroid()) {
    try {
      const res = await BackgroundSms.sendSms({
        phoneNumber: `+91${cleanPhone}`,
        message,
      });

      if (res && res.success) {
        return {
          success: true,
          isNative: true,
          message: '✅ SMS संदेश तैयार है (SMS intent opened)',
        };
      }
    } catch (pluginErr) {
      console.warn('Native intent notice, falling back to standard uri:', pluginErr);
    }
  }

  // Universal safe web standard fallback (sms:+91... URI)
  try {
    const encodedBody = encodeURIComponent(message);
    const smsUri = `sms:+91${cleanPhone}?body=${encodedBody}`;
    window.open(smsUri, '_blank');
    return {
      success: true,
      isNative: isNativeAndroid(),
      message: '✅ SMS ऐप खोला गया',
    };
  } catch (err: any) {
    console.error('Failed to open standard SMS intent:', err);
    return {
      success: false,
      isNative: isNativeAndroid(),
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
