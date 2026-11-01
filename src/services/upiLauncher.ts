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
  method: 'native' | 'scheme' | 'intent' | 'fallback';
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
 * Builds clean, NPCI-standard UPI URI WITHOUT suspicious 'mode=02' or unsigned tokens
 * This resolves Google Pay's automated "This transaction may be risky" error.
 */
export function buildStandardUpiUri(options: UpiPaymentOptions): string {
  const cleanUpi = options.upiId.trim();
  const cleanAmt = Math.round(options.amount * 100) / 100;
  const amtStr = cleanAmt % 1 === 0 ? String(cleanAmt) : cleanAmt.toFixed(2);
  const cleanName = (options.payeeName || 'Hub Collection').trim().replace(/[^a-zA-Z0-9 ]/g, ' ');
  const cleanNote = (options.note || 'COD Payment').trim().replace(/[^a-zA-Z0-9 ]/g, ' ');

  const params = new URLSearchParams();
  params.set('pa', cleanUpi);
  params.set('pn', cleanName);
  params.set('am', amtStr);
  params.set('cu', 'INR');
  params.set('tn', cleanNote);

  // NOTE: NEVER add 'mode=02' here without an enterprise NPCI bank certificate.
  // Passing 'mode=02' without a signed certificate triggers Google Pay's anti-fraud
  // alarm: "This transaction may be risky. For your safety, it can't be completed at this time."

  return `upi://pay?${params.toString()}`;
}

/**
 * Builds app-specific custom schemes which bypass Chrome's generic intent filter
 */
export function buildAppSpecificScheme(options: UpiPaymentOptions, targetApp: 'gpay' | 'phonepe' | 'paytm' | 'all'): string {
  const cleanUpi = encodeURIComponent(options.upiId.trim());
  const cleanAmt = Math.round(options.amount * 100) / 100;
  const amtStr = cleanAmt % 1 === 0 ? String(cleanAmt) : cleanAmt.toFixed(2);
  const cleanName = encodeURIComponent((options.payeeName || 'Hub Collection').trim().replace(/[^a-zA-Z0-9 ]/g, ' '));
  const cleanNote = encodeURIComponent((options.note || 'COD Payment').trim().replace(/[^a-zA-Z0-9 ]/g, ' '));

  const query = `pa=${cleanUpi}&pn=${cleanName}&am=${amtStr}&cu=INR&tn=${cleanNote}`;

  if (targetApp === 'gpay') {
    return `tez://upi/pay?${query}`;
  }
  if (targetApp === 'phonepe') {
    return `phonepe://pay?${query}`;
  }
  if (targetApp === 'paytm') {
    return `paytmmp://pay?${query}`;
  }
  return `upi://pay?${query}`;
}

/**
 * Builds Android Intent URL for direct web browser execution on Chrome Android
 */
export function buildAndroidIntentUrl(options: UpiPaymentOptions, targetApp: 'gpay' | 'phonepe' | 'paytm' | 'all' = 'all'): string {
  const cleanUpi = encodeURIComponent(options.upiId.trim());
  const cleanAmt = Math.round(options.amount * 100) / 100;
  const amtStr = cleanAmt % 1 === 0 ? String(cleanAmt) : cleanAmt.toFixed(2);
  const cleanName = encodeURIComponent((options.payeeName || 'Hub Collection').trim().replace(/[^a-zA-Z0-9 ]/g, ' '));
  const cleanNote = encodeURIComponent((options.note || 'COD Payment').trim().replace(/[^a-zA-Z0-9 ]/g, ' '));

  const query = `pa=${cleanUpi}&pn=${cleanName}&am=${amtStr}&cu=INR&tn=${cleanNote}`;

  const pkg = APP_PACKAGES[targetApp];
  if (pkg) {
    return `intent://pay?${query}#Intent;scheme=upi;package=${pkg};end`;
  }
  return `intent://pay?${query}#Intent;scheme=upi;end`;
}

/**
 * Generates high-res QR code for scanning
 * Physical QR code scans are categorized by NPCI as 'Mode 01' (Customer In-Person Scan),
 * which NEVER triggers the 'Transaction is risky' block in Google Pay.
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
 * Works across Native Android APK and Mobile Browsers without tripping fraud filters.
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
      console.warn('Native UPI plugin fallback:', err);
    }
  }

  // 3. For Google Pay or direct app schemes:
  // Using direct app scheme (tez://, phonepe://, paytmmp://) bypasses Google Pay's external intent flags
  const appScheme = buildAppSpecificScheme(options, targetApp);
  const isAndroid = /android/i.test(navigator.userAgent || '');

  try {
    window.location.href = appScheme;
    return {
      success: true,
      method: 'scheme',
      message: `${targetApp === 'gpay' ? 'Google Pay' : targetApp === 'phonepe' ? 'PhonePe' : targetApp === 'paytm' ? 'Paytm' : 'UPI ऐप'} खुल रहा है...`,
    };
  } catch {
    // Fallback to intent URL on Android
    if (isAndroid) {
      const intentUrl = buildAndroidIntentUrl(options, targetApp);
      window.location.href = intentUrl;
      return {
        success: true,
        method: 'intent',
        message: 'UPI ऐप खोला जा रहा है...',
      };
    }

    // Default standard scheme fallback
    window.location.href = standardUri;
    return {
      success: true,
      method: 'scheme',
      message: 'UPI ऐप खोला जा रहा है...',
    };
  }
}
