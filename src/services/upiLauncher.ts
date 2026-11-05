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
  transactionRef?: string;
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

export function generateUniqueTxnRef(): string {
  const ts = Date.now().toString().slice(-8);
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `TXN${ts}${rand}`;
}

/**
 * Builds the cleanest, purest, most minimal NPCI-standard UPI URI:
 * upi://pay?pa=...&am=...&cu=INR
 * 
 * Strict removal of:
 * - NO 'pn' (avoids name mismatch with PAWAN KABI)
 * - NO 'tr' (avoids unsigned merchant intent block)
 * - NO 'mc' (avoids MCC category block)
 * - NO 'tn' (avoids commercial order string block)
 * - NO '%40' encoding (preserves literal '@' for Paytm / PhonePe parsers)
 */
export function buildStandardUpiUri(options: UpiPaymentOptions): string {
  const cleanUpi = options.upiId.trim();
  const cleanAmt = Math.round(options.amount * 100) / 100;
  const amtStr = cleanAmt.toFixed(2);

  return `upi://pay?pa=${cleanUpi}&am=${amtStr}&cu=INR`;
}

export function buildAppSpecificScheme(options: UpiPaymentOptions, _targetApp: 'gpay' | 'phonepe' | 'paytm' | 'all'): string {
  return buildStandardUpiUri(options);
}

export function buildAndroidIntentUrl(options: UpiPaymentOptions, targetApp: 'gpay' | 'phonepe' | 'paytm' | 'all' = 'all'): string {
  const cleanUpi = encodeURIComponent(options.upiId.trim());
  const cleanAmt = Math.round(options.amount * 100) / 100;
  const amtStr = cleanAmt.toFixed(2);

  const query = `pa=${cleanUpi}&am=${amtStr}&cu=INR`;
  const pkg = APP_PACKAGES[targetApp];
  if (pkg) {
    return `intent://pay?${query}#Intent;scheme=upi;package=${pkg};end`;
  }
  return `intent://pay?${query}#Intent;scheme=upi;end`;
}

/**
 * Generates high-res QR code for scanning.
 * Physical QR code scans are categorized by NPCI as 'Mode 01' (Customer In-Person Scan),
 * which NEVER triggers fraud or intent blocks in PhonePe or Google Pay.
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
 * Master 1-Click Launch Function.
 * Uses pure, organic, minimal standard URI without any commercial intent flags.
 */
export async function launchUpiPayment(options: UpiPaymentOptions): Promise<UpiLaunchResult> {
  if (!options.upiId || options.amount <= 0) {
    return {
      success: false,
      method: 'fallback',
      message: 'अमान्य UPI ID या शून्य रकम।',
    };
  }

  const cleanUpi = options.upiId.trim();
  const cleanAmt = Math.round(options.amount * 100) / 100;
  const amtStr = cleanAmt.toFixed(2);
  const standardUri = `upi://pay?pa=${cleanUpi}&am=${amtStr}&cu=INR`;
  const txnRef = options.transactionRef || generateUniqueTxnRef();

  // 1. Auto-copy UPI ID to clipboard as immediate fail-safe
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(cleanUpi);
    }
  } catch {}

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
          transactionRef: txnRef,
        };
      }
    } catch (err) {
      console.warn('Native UPI plugin fallback:', err);
    }
  }

  // 3. For Web / Mobile Browser: Launch pure organic standard URI directly
  try {
    window.location.href = standardUri;
    return {
      success: true,
      method: 'scheme',
      message: 'UPI ऐप खोला जा रहा है...',
      transactionRef: txnRef,
    };
  } catch (e) {
    return {
      success: false,
      method: 'fallback',
      message: 'UPI ऐप नहीं खोला जा सका। कृपया QR कोड स्कैन करें।',
      transactionRef: txnRef,
    };
  }
}
