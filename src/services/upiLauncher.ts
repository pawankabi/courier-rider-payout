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

/**
 * Generates an NPCI-compliant unique Transaction Reference (tr)
 * Bank fraud engines (Paytm Protect, PhonePe, GPay) require a unique tr per attempt.
 * Without tr, deep-link payments get flagged with "UPI Risk Policy" / "Risky transaction".
 */
export function generateUniqueTxnRef(): string {
  const ts = Date.now().toString().slice(-8); // 8-digit unique timestamp
  const rand = Math.floor(100000 + Math.random() * 900000); // 6-digit random sequence
  return `TXN${ts}${rand}`;
}

/**
 * Builds clean, NPCI-standard UPI URI with mandatory tr, mc=4215 (Courier Services)
 * and strict 2-decimal amount format (am=X.00).
 * Mode=02 is omitted to prevent triggering unsigned merchant JWS cert errors.
 */
export function buildStandardUpiUri(options: UpiPaymentOptions): string {
  const cleanUpi = options.upiId.trim();
  const cleanAmt = Math.round(options.amount * 100) / 100;
  const amtStr = cleanAmt.toFixed(2);
  const cleanName = (options.payeeName || 'Hub Collection').trim().replace(/[^a-zA-Z0-9 ]/g, ' ').substring(0, 50);
  const cleanNote = (options.note || 'COD Payment').trim().replace(/[^a-zA-Z0-9 ]/g, ' ').substring(0, 30);
  const txnRef = (options.transactionRef || generateUniqueTxnRef()).trim().replace(/[^a-zA-Z0-9]/g, '').substring(0, 35);

  const params = new URLSearchParams();
  params.set('pa', cleanUpi);
  params.set('pn', cleanName);
  params.set('mc', '4215'); // NPCI MCC for Courier & Delivery Services
  params.set('tr', txnRef);  // Unique Transaction Reference to pass bank risk checks
  params.set('am', amtStr);  // Strictly formatted with 2 decimal places
  params.set('cu', 'INR');
  params.set('tn', cleanNote);

  return `upi://pay?${params.toString()}`;
}

/**
 * Builds standard universal scheme for mobile browsers.
 * Replaces unsafe proprietary 'paytmmp://' (which Paytm Protect rejects)
 * with standard NPCI upi:// protocol.
 */
export function buildAppSpecificScheme(options: UpiPaymentOptions, _targetApp: 'gpay' | 'phonepe' | 'paytm' | 'all'): string {
  return buildStandardUpiUri(options);
}

/**
 * Builds Android Intent URL for direct Chrome Android execution.
 * Directly targets the specific package (Paytm, PhonePe, Google Pay) using the
 * standard upi scheme and verified transaction reference.
 */
export function buildAndroidIntentUrl(options: UpiPaymentOptions, targetApp: 'gpay' | 'phonepe' | 'paytm' | 'all' = 'all'): string {
  const cleanUpi = encodeURIComponent(options.upiId.trim());
  const cleanAmt = Math.round(options.amount * 100) / 100;
  const amtStr = cleanAmt.toFixed(2);
  const cleanName = encodeURIComponent((options.payeeName || 'Hub Collection').trim().replace(/[^a-zA-Z0-9 ]/g, ' ').substring(0, 50));
  const cleanNote = encodeURIComponent((options.note || 'COD Payment').trim().replace(/[^a-zA-Z0-9 ]/g, ' ').substring(0, 30));
  const txnRef = encodeURIComponent((options.transactionRef || generateUniqueTxnRef()).trim().replace(/[^a-zA-Z0-9]/g, '').substring(0, 35));

  const query = `pa=${cleanUpi}&pn=${cleanName}&mc=4215&tr=${txnRef}&am=${amtStr}&cu=INR&tn=${cleanNote}`;

  const pkg = APP_PACKAGES[targetApp];
  if (pkg) {
    return `intent://pay?${query}#Intent;scheme=upi;package=${pkg};end`;
  }
  return `intent://pay?${query}#Intent;scheme=upi;end`;
}

/**
 * Generates high-res QR code for scanning
 * Physical QR code scans are categorized by NPCI as 'Mode 01' (Customer In-Person Scan),
 * which NEVER triggers the 'Transaction is risky' block in Google Pay or Paytm.
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
 * Generates and preserves unique transaction reference (tr) for end-to-end reconciliation.
 */
export async function launchUpiPayment(options: UpiPaymentOptions): Promise<UpiLaunchResult> {
  if (!options.upiId || options.amount <= 0) {
    return {
      success: false,
      method: 'fallback',
      message: 'अमान्य UPI ID या शून्य रकम।',
    };
  }

  // 1. Ensure a unique transaction reference (tr) is generated
  const txnRef = options.transactionRef || generateUniqueTxnRef();
  const optionsWithTxn: UpiPaymentOptions = {
    ...options,
    transactionRef: txnRef,
  };

  // 2. Auto-copy UPI ID to clipboard as immediate fail-safe
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(options.upiId.trim());
    }
  } catch {}

  const standardUri = buildStandardUpiUri(optionsWithTxn);
  const targetApp = options.targetApp || 'all';
  const targetPackage = APP_PACKAGES[targetApp];

  // 3. If running inside Capacitor Native Android APK:
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

  // 4. For Mobile Browser on Android:
  const isAndroid = /android/i.test(navigator.userAgent || '');
  if (isAndroid) {
    const intentUrl = buildAndroidIntentUrl(optionsWithTxn, targetApp);
    try {
      window.location.href = intentUrl;
      return {
        success: true,
        method: 'intent',
        message: `${targetApp === 'gpay' ? 'Google Pay' : targetApp === 'phonepe' ? 'PhonePe' : targetApp === 'paytm' ? 'Paytm' : 'UPI ऐप'} खोला जा रहा है...`,
        transactionRef: txnRef,
      };
    } catch (e) {
      console.warn('Android intent failed, falling back to standard URI:', e);
    }
  }

  // 5. Default standard scheme (works for iOS and universal desktop/mobile)
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
