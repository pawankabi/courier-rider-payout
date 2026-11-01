import { Capacitor, registerPlugin } from '@capacitor/core';
import QRCode from 'qrcode';

export interface UpiPaymentOptions {
  upiId: string;
  amount: number;
  payeeName?: string;
  note?: string;
  targetApp?: 'gpay' | 'phonepe' | 'paytm' | 'all';
  transactionRef?: string;
}

export interface UpiLaunchResult {
  success: boolean;
  method: 'native' | 'intent' | 'scheme' | 'fallback';
  message: string;
  qrDataUrl?: string;
}

// Native Plugin Interface for Capacitor Android
interface UpiPayPluginInterface {
  launchUpi(options: { uri: string; targetPackage?: string }): Promise<{ success: boolean; launched?: boolean; fallback?: boolean; error?: string }>;
}

const UpiPayPlugin = registerPlugin<UpiPayPluginInterface>('UpiPay');

const APP_PACKAGES: Record<string, string> = {
  gpay: 'com.google.android.apps.nbu.paisa.user',
  phonepe: 'com.phonepe.app',
  paytm: 'net.one97.paytm',
};

/**
 * Builds standard NPCI-compliant UPI URI with pre-filled amount and verified details.
 */
export function buildStandardUpiUri(options: UpiPaymentOptions): string {
  const cleanUpi = options.upiId.trim();
  const cleanAmt = Math.round(options.amount * 100) / 100;
  const amtStr = cleanAmt % 1 === 0 ? String(cleanAmt) : cleanAmt.toFixed(2);
  const cleanName = (options.payeeName || 'Hub Collection').trim().replace(/[^a-zA-Z0-9 ]/g, ' ');
  const cleanNote = (options.note || 'COD Collection').trim().replace(/[^a-zA-Z0-9 ]/g, ' ');
  const cleanRef = (options.transactionRef || `COD_${Date.now()}`).substring(0, 30);

  const params = new URLSearchParams();
  params.set('pa', cleanUpi);
  params.set('pn', cleanName);
  params.set('am', amtStr);
  params.set('cu', 'INR');
  params.set('tn', cleanNote);
  params.set('tr', cleanRef);
  params.set('mode', '02'); // Standard P2M secure intent

  return `upi://pay?${params.toString()}`;
}

/**
 * Builds Android Intent URL for direct web browser execution on Chrome Android
 */
export function buildAndroidIntentUrl(options: UpiPaymentOptions, targetApp: 'gpay' | 'phonepe' | 'paytm' | 'all' = 'all'): string {
  const cleanUpi = options.upiId.trim();
  const cleanAmt = Math.round(options.amount * 100) / 100;
  const amtStr = cleanAmt % 1 === 0 ? String(cleanAmt) : cleanAmt.toFixed(2);
  const cleanName = (options.payeeName || 'Hub Collection').trim().replace(/[^a-zA-Z0-9 ]/g, ' ');
  const cleanNote = (options.note || 'COD Collection').trim().replace(/[^a-zA-Z0-9 ]/g, ' ');
  const cleanRef = (options.transactionRef || `COD_${Date.now()}`).substring(0, 30);

  const query = `pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(cleanName)}&am=${encodeURIComponent(amtStr)}&cu=INR&tn=${encodeURIComponent(cleanNote)}&tr=${encodeURIComponent(cleanRef)}&mode=02`;

  const pkg = APP_PACKAGES[targetApp];
  if (pkg) {
    return `intent://pay?${query}#Intent;scheme=upi;package=${pkg};end`;
  }
  return `intent://pay?${query}#Intent;scheme=upi;end`;
}

/**
 * Generates high-res QR code for scanning
 */
export async function generateUpiQrCodeDataUrl(options: UpiPaymentOptions): Promise<string> {
  const upiUri = buildStandardUpiUri(options);
  try {
    return await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'M',
      margin: 1.5,
      width: 320,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Error generating UPI QR code:', err);
    return '';
  }
}

/**
 * Master 1-Click Launch Function
 * Works in Android Native APK, Mobile Browsers (Chrome), and provides automatic fallback.
 */
export async function launchUpiPayment(options: UpiPaymentOptions): Promise<UpiLaunchResult> {
  if (!options.upiId || options.amount <= 0) {
    return {
      success: false,
      method: 'fallback',
      message: 'अमान्य UPI ID या शून्य रकम।',
    };
  }

  // 1. Auto-copy UPI ID to clipboard as immediate fail-safe
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(options.upiId.trim());
    }
  } catch {}

  const standardUri = buildStandardUpiUri(options);
  const targetApp = options.targetApp || 'all';
  const targetPackage = APP_PACKAGES[targetApp];

  // 2. If running inside Capacitor Native Android APK:
  if (Capacitor.isNativePlatform()) {
    try {
      const nativeRes = await UpiPayPlugin.launchUpi({
        uri: standardUri,
        targetPackage,
      });

      if (nativeRes && nativeRes.success) {
        return {
          success: true,
          method: 'native',
          message: `${targetApp === 'gpay' ? 'Google Pay' : targetApp === 'phonepe' ? 'PhonePe' : targetApp === 'paytm' ? 'Paytm' : 'UPI ऐप'} खुल रहा है...`,
        };
      }
    } catch (err) {
      console.warn('Native UPI plugin fallback to browser schemes:', err);
    }
  }

  // 3. If in Mobile Browser or Native failed:
  // Use Android Intent URL if on Android Chrome
  const isAndroid = /android/i.test(navigator.userAgent || '');
  if (isAndroid) {
    const intentUrl = buildAndroidIntentUrl(options, targetApp);
    try {
      window.location.href = intentUrl;
      return {
        success: true,
        method: 'intent',
        message: 'UPI ऐप खोला जा रहा है...',
      };
    } catch {
      window.location.href = standardUri;
      return {
        success: true,
        method: 'scheme',
        message: 'UPI ऐप खोला जा रहा है...',
      };
    }
  }

  // 4. Default standard scheme
  try {
    window.location.href = standardUri;
    return {
      success: true,
      method: 'scheme',
      message: 'UPI ऐप खोला जा रहा है...',
    };
  } catch {
    return {
      success: true,
      method: 'fallback',
      message: `हब UPI ID (${options.upiId}) कॉपी हो गई है।`,
    };
  }
}
