import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { UserSubscription, createDefaultUserSubscription } from '../types';
import { normalizeUserSubscription } from './firestoreSync';

export interface PayuConfig {
  merchantKey: string;
  merchantSalt: string;
  environment: 'test' | 'live';
  merchantName: string;
}

export const PAYU_CONFIG_STORAGE_KEY = 'cp_payu_merchant_config_v1';

export const DEFAULT_PAYU_CONFIG: PayuConfig = {
  merchantKey: 'gtKFFx', // Standard PayU sandbox test merchant key
  merchantSalt: 'eCwWELxi', // Standard PayU sandbox test salt
  environment: 'test',
  merchantName: 'Courier Rider Payout (Pro SaaS)',
};

export function getStoredPayuConfig(): PayuConfig {
  try {
    const raw = localStorage.getItem(PAYU_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        merchantKey: (parsed.merchantKey || DEFAULT_PAYU_CONFIG.merchantKey).trim(),
        merchantSalt: (parsed.merchantSalt || DEFAULT_PAYU_CONFIG.merchantSalt).trim(),
        environment: parsed.environment === 'live' ? 'live' : 'test',
        merchantName: (parsed.merchantName || DEFAULT_PAYU_CONFIG.merchantName).trim(),
      };
    }
  } catch (e) {
    console.warn('Failed to parse stored PayU config', e);
  }
  return { ...DEFAULT_PAYU_CONFIG };
}

export function saveStoredPayuConfig(config: Partial<PayuConfig>): PayuConfig {
  const current = getStoredPayuConfig();
  const updated: PayuConfig = {
    merchantKey: (config.merchantKey ?? current.merchantKey).trim(),
    merchantSalt: (config.merchantSalt ?? current.merchantSalt).trim(),
    environment: config.environment ?? current.environment,
    merchantName: (config.merchantName ?? current.merchantName).trim(),
  };
  try {
    localStorage.setItem(PAYU_CONFIG_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to persist PayU config', e);
  }
  return updated;
}

export interface SubscriptionPlan {
  id: 'plan_test_1day' | '1_month' | '3_months' | '1_year' | string;
  name: string;
  nameHindi: string;
  price: number;
  originalPrice: number;
  savings?: number;
  durationDays: number;
  durationLabel: string;
  badge?: string;
  popular?: boolean;
  tagline: string;
  isTrial?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_test_1day',
    name: '1-Day Test Pass',
    nameHindi: '₹1 टेस्ट पास (1 दिन ट्रायल)',
    price: 1,
    originalPrice: 19,
    durationDays: 1,
    durationLabel: '1 Day Pass (24 Hours)',
    badge: 'Testing / 1-Day Trial',
    tagline: '₹1 for 1 Day Trial / Testing Pass',
    isTrial: true,
  },
  {
    id: '1_month',
    name: '1 Month Plan',
    nameHindi: '1 माह प्लान (अनलिमिटेड राइडर्स)',
    price: 499,
    originalPrice: 499,
    durationDays: 30,
    durationLabel: '30 Days Validity',
    tagline: 'Unlimited Riders + Firebase Cloud Sync',
  },
  {
    id: '3_months',
    name: '3 Months Plan',
    nameHindi: '3 माह प्लान (सर्वाधिक लोकप्रिय)',
    price: 1399,
    originalPrice: 1497,
    savings: 98,
    durationDays: 90,
    durationLabel: '90 Days Validity',
    badge: 'MOST POPULAR (Save ₹98)',
    popular: true,
    tagline: 'Save ₹98 - Most Popular Hub Choice',
  },
  {
    id: '1_year',
    name: '1 Year Plan',
    nameHindi: '1 वर्ष प्लान (सर्वश्रेष्ठ बचत)',
    price: 4999,
    originalPrice: 5988,
    savings: 989,
    durationDays: 365,
    durationLabel: '365 Days Validity',
    badge: 'BEST VALUE (Save ₹989)',
    tagline: 'Save ₹989 - Best Value + Priority Support',
  },
];

/**
 * Standard PayU SHA-512 Hash Generation using native Web Crypto API
 * Formula: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
 */
export async function generatePayuSha512Hash(params: {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  salt: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
}): Promise<string> {
  const hashString = `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|${params.udf1 || ''}|${params.udf2 || ''}|${params.udf3 || ''}|${params.udf4 || ''}|${params.udf5 || ''}||||||${params.salt}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(hashString);
  const hashBuffer = await window.crypto.subtle.digest('SHA-512', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface PayuTransactionResult {
  status: 'success' | 'failure';
  txnid: string;
  amount: number;
  planId: 'plan_test_1day' | '1_month' | '3_months' | '1_year' | string;
  planName: string;
  durationDays: number;
  paymentId?: string;
  paymentMode?: string;
  gatewayName?: string;
  errorMessage?: string;
}

/**
 * Executes Instant Auto-Approval for PayU transaction:
 * - Updates user subscription to isPro: true, paymentStatus: 'active'
 * - Sets validUntil date based on purchased plan (30 / 90 / 365 days)
 * - Updates users/{userId} and all_users/{userId} with status: 'approved'
 * - Records payment in paymentHistory
 * - Unlocks full Firebase cloud sync and unlimited riders
 */
export async function executePayuAutoApproval(
  userId: string,
  userEmail: string | null,
  txn: PayuTransactionResult
): Promise<UserSubscription> {
  const userRef = doc(db, 'users', userId);
  const allUserRef = doc(db, 'all_users', userId);

  let currentSub = createDefaultUserSubscription();
  try {
    const snap = await getDoc(userRef);
    if (snap.exists() && snap.data()?.subscription) {
      currentSub = normalizeUserSubscription(snap.data().subscription);
    } else {
      const allSnap = await getDoc(allUserRef);
      if (allSnap.exists() && allSnap.data()?.subscription) {
        currentSub = normalizeUserSubscription(allSnap.data().subscription);
      }
    }
  } catch (err) {
    console.warn('Could not read existing subscription before PayU auto-approval:', err);
  }

  // Calculate new expiration date (or extend if currently active)
  const now = Date.now();
  let baseTimestamp = now;
  if (currentSub.validUntil && currentSub.paymentStatus === 'active') {
    const existingExpiry = new Date(currentSub.validUntil).getTime();
    if (existingExpiry > now) {
      baseTimestamp = existingExpiry; // Extend from current expiration date!
    }
  }

  const validUntilTimestamp = baseTimestamp + txn.durationDays * 24 * 60 * 60 * 1000;
  const newValidUntilIso = new Date(validUntilTimestamp).toISOString();

  const historyItem = {
    id: txn.txnid,
    date: new Date().toISOString(),
    amount: txn.amount,
    utr: txn.paymentId || txn.txnid,
    slipUrl: 'PAYU_ONLINE_GATEWAY_SUCCESS',
    approvedBy: 'payu_instant_auto_approval',
    status: 'success',
    notes: `PayU Auto-Approved: ${txn.planName} (${txn.durationDays} days) • Mode: ${txn.paymentMode || 'PayU PG'}`,
  };

  const updatedSub: UserSubscription = {
    ...currentSub,
    planType: 'paid',
    paymentStatus: 'active',
    isPro: true,
    monthlyFee: txn.amount,
    validUntil: newValidUntilIso,
    paymentHistory: [historyItem, ...(currentSub.paymentHistory || [])],
  };

  // Immediate local cache update for instant 0ms offline/freemium unlock
  try {
    localStorage.setItem('cp_current_is_pro', 'true');
    localStorage.setItem(`cp_sub_${userId}`, JSON.stringify(updatedSub));
    localStorage.setItem(`cp_is_pro_${userId}`, 'true');
  } catch (err) {
    console.warn('Failed to cache pro status to localStorage', err);
  }

  // 1. Update user's personal doc
  try {
    await updateDoc(userRef, {
      subscription: updatedSub,
      status: 'approved',
      validUntil: newValidUntilIso,
      isPro: true,
      isApproved: true,
      lastPaymentAt: serverTimestamp(),
      subscriptionUpdatedAt: serverTimestamp(),
    });
  } catch (e) {
    await setDoc(userRef, {
      subscription: updatedSub,
      status: 'approved',
      validUntil: newValidUntilIso,
      isPro: true,
      isApproved: true,
      email: userEmail,
      lastPaymentAt: serverTimestamp(),
      subscriptionUpdatedAt: serverTimestamp(),
    }, { merge: true });
  }

  // 2. Update Master Admin all_users collection
  try {
    await updateDoc(allUserRef, {
      subscription: updatedSub,
      status: 'approved',
      validUntil: newValidUntilIso,
      isPro: true,
      isApproved: true,
      lastPaymentAt: serverTimestamp(),
      subscriptionUpdatedAt: serverTimestamp(),
    });
  } catch (e) {
    await setDoc(allUserRef, {
      subscription: updatedSub,
      status: 'approved',
      validUntil: newValidUntilIso,
      isPro: true,
      isApproved: true,
      email: userEmail,
      lastPaymentAt: serverTimestamp(),
      subscriptionUpdatedAt: serverTimestamp(),
    }, { merge: true });
  }

  return updatedSub;
}
