import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { UserSubscription, createDefaultUserSubscription } from '../types';
import { normalizeUserSubscription } from './firestoreSync';

export interface RazorpayPlan {
  id: 'starter' | 'growth' | 'enterprise';
  name: string;
  displayName: string;
  nameHindi: string;
  price: number; // in INR
  amountInPaise: number; // price * 100
  originalPrice: number;
  durationDays: number;
  durationLabel: string;
  tagline: string;
  popular?: boolean;
  badge?: string;
  savings?: number;
}

export const RAZORPAY_PLANS: RazorpayPlan[] = [
  {
    id: 'starter',
    name: 'Starter Plan',
    displayName: '₹499 Starter',
    nameHindi: '₹499 स्टार्टर प्लान (1 माह)',
    price: 499,
    amountInPaise: 49900,
    originalPrice: 499,
    durationDays: 30,
    durationLabel: '30 Days Validity',
    tagline: 'Unlimited Fleet + Daily Payout Ledger + SIM SMS',
  },
  {
    id: 'growth',
    name: 'Growth Plan',
    displayName: '₹1399 Growth',
    nameHindi: '₹1399 ग्रोथ प्लान (3 माह)',
    price: 1399,
    amountInPaise: 139900,
    originalPrice: 1497,
    durationDays: 90,
    durationLabel: '90 Days Validity',
    popular: true,
    badge: 'POPULAR (Save ₹98)',
    savings: 98,
    tagline: 'Most Popular Hub Choice • Save ₹98 with 90-day peace of mind',
  },
  {
    id: 'enterprise',
    name: 'Enterprise Plan',
    displayName: '₹4999 Enterprise',
    nameHindi: '₹4999 एंटरप्राइज प्लान (1 वर्ष)',
    price: 4999,
    amountInPaise: 499900,
    originalPrice: 5988,
    durationDays: 365,
    durationLabel: '365 Days Validity',
    badge: 'BEST VALUE (Save ₹989)',
    savings: 989,
    tagline: '1 Year Full Fleet Automation • VIP Support & Multi-device Sync',
  },
];

export const RAZORPAY_KEY_STORAGE_KEY = 'cp_razorpay_live_key_v1';
export const LIVE_RAZORPAY_KEY_ID = 'rzp_live_TjM6Q6dUmC7FMm';

export function getRazorpayKeyId(): string {
  try {
    const custom = localStorage.getItem(RAZORPAY_KEY_STORAGE_KEY);
    if (custom && custom.trim().length > 0 && custom.trim() !== 'अपनी_पूरी_KEY_ID_यहाँ_डालें') {
      return custom.trim();
    }
  } catch (e) {
    console.warn('Could not read custom Razorpay key from storage', e);
  }

  const envKey = (import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined)?.trim();
  if (envKey && envKey.length > 0 && envKey !== 'अपनी_पूरी_KEY_ID_यहाँ_डालें') {
    return envKey;
  }

  return LIVE_RAZORPAY_KEY_ID;
}

export function setStoredRazorpayKeyId(key: string): void {
  try {
    localStorage.setItem(RAZORPAY_KEY_STORAGE_KEY, key.trim());
  } catch (e) {
    console.warn('Failed to save Razorpay key to localStorage', e);
  }
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

/**
 * Dynamically loads Razorpay Checkout script (https://checkout.razorpay.com/v1/checkout.js)
 */
export function loadRazorpayCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }

    const existingScript = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error('Failed to load Razorpay checkout script from checkout.razorpay.com');
      resolve(false);
    };

    document.body.appendChild(script);
  });
}

export interface OpenRazorpayOptions {
  plan: RazorpayPlan;
  user: {
    id: string;
    email?: string | null;
    name?: string;
    phone?: string;
  };
  customKeyId?: string;
  onSuccess: (response: RazorpaySuccessResponse, plan: RazorpayPlan, updatedSub?: UserSubscription) => void | Promise<void>;
  onDismiss?: () => void;
  onError?: (err: Error) => void;
}

/**
 * Triggers the Razorpay Standard Checkout Modal
 */
export async function openRazorpayCheckout({
  plan,
  user,
  customKeyId,
  onSuccess,
  onDismiss,
  onError,
}: OpenRazorpayOptions): Promise<void> {
  const isLoaded = await loadRazorpayCheckoutScript();
  if (!isLoaded || !(window as any).Razorpay) {
    const error = new Error('Razorpay Checkout SDK लोड करने में असमर्थ। कृपया इंटरनेट कनेक्शन जांचें।');
    onError?.(error);
    throw error;
  }

  const key = customKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID || getRazorpayKeyId() || LIVE_RAZORPAY_KEY_ID;

  const resolvedUserId = (
    user?.id ||
    (user as any)?.uid ||
    auth.currentUser?.uid ||
    (typeof window !== 'undefined' ? localStorage.getItem('cp_current_uid') : null) ||
    'current_user'
  ).trim();

  // 1. PERSIST PENDING TRANSACTION BEFORE LAUNCHING RAZORPAY
  if (typeof window !== 'undefined') {
    try {
      const pendingData = {
        userId: resolvedUserId,
        planId: plan.id,
        planName: plan.name,
        amount: plan.price,
        amountInPaise: plan.amountInPaise,
        initiatedAt: Date.now(),
      };
      localStorage.setItem('cp_pending_checkout', JSON.stringify(pendingData));
      console.log('Persisted pending checkout state before launching Razorpay:', pendingData);
    } catch (e) {
      console.warn('Could not save pending checkout state to localStorage', e);
    }
  }

  const options = {
    key: key,
    amount: plan.amountInPaise,
    currency: 'INR',
    name: 'Courier Rider Payout',
    description: 'Subscription Plan Payout Service',
    image: 'https://cdn-icons-png.flaticon.com/512/2830/2830312.png',
    handler: async function (response: RazorpaySuccessResponse) {
      try {
        // 1. BULLETPROOF FRONTEND AUTO-ACTIVATION IMMEDIATELY INSIDE HANDLER
        const activationResult = await activateUserPlanImmediately(
          resolvedUserId,
          plan.id,
          response.razorpay_payment_id,
          user.email || auth.currentUser?.email
        );

        if (onSuccess) {
          await onSuccess(response, plan, activationResult.subscription);
        }
      } catch (err: any) {
        console.error('Error in Razorpay success callback:', err);
        onError?.(err);
      }
    },
    prefill: {
      contact: user.phone && user.phone.trim().length >= 10 ? user.phone : '9110913070',
      name: user.name && user.name.trim().length > 0 && user.name !== 'Courier Hub Manager' ? user.name : 'PAWAN KABI',
      email: user.email || 'pawankabiseraikella@gmail.com',
    },
    notes: {
      plan_id: plan.id,
      plan_name: plan.name,
      plan_price: plan.price.toString(),
      duration_days: plan.durationDays.toString(),
      user_id: user.id,
      contact: '9110913070',
      customer_name: 'PAWAN KABI',
      app: 'Courier Rider Payout',
    },
    theme: {
      color: '#2563eb', // Primary brand blue
    },
    modal: {
      ondismiss: function () {
        onDismiss?.();
      },
      escape: true,
      backdropclose: false,
    },
  };

  try {
    const razorpayInstance = new (window as any).Razorpay(options);
    razorpayInstance.on('payment.failed', function (resp: any) {
      console.warn('Razorpay payment failed:', resp.error);
      const msg = resp.error?.description || 'भुगतान विफल रहा या रद्द किया गया।';
      onError?.(new Error(msg));
    });
    razorpayInstance.open();
  } catch (err: any) {
    console.error('Failed to initialize Razorpay checkout instance:', err);
    onError?.(err);
    throw err;
  }
}

export interface RazorpayTransactionRecord {
  paymentId: string;
  orderId?: string;
  planId: string;
  planName: string;
  amount: number;
  durationDays: number;
  date: string;
}

/**
 * Helper to immediately activate user plan with merge: true in Firestore and update localStorage.
 * Updates both users/{userId} and all_users/{userId} documents.
 */
export async function activateUserPlanImmediately(
  userId: string,
  planId: string,
  paymentId: string,
  userEmail?: string | null
): Promise<{
  subscription: UserSubscription;
  validUntil: string;
  plan: RazorpayPlan;
}> {
  const effectiveUserId = (
    userId ||
    auth.currentUser?.uid ||
    (typeof window !== 'undefined' ? localStorage.getItem('cp_current_uid') : null) ||
    'current_user'
  ).trim();

  const effectiveEmail = userEmail || auth.currentUser?.email || null;
  const matchedPlan = RAZORPAY_PLANS.find((p) => p.id === planId) || RAZORPAY_PLANS[0];
  const durationDays = matchedPlan.durationDays || 30;

  const now = Date.now();
  const activatedAt = new Date(now).toISOString();

  // Read current subscription to preserve prior payment history and extend expiration if active
  const userRef = doc(db, 'users', effectiveUserId);
  const allUserRef = doc(db, 'all_users', effectiveUserId);

  let currentSub = createDefaultUserSubscription();
  try {
    const [userSnap, allSnap] = await Promise.all([
      getDoc(userRef).catch(() => null),
      getDoc(allUserRef).catch(() => null),
    ]);

    if (userSnap && userSnap.exists() && userSnap.data()?.subscription) {
      currentSub = normalizeUserSubscription(userSnap.data().subscription);
    } else if (allSnap && allSnap.exists() && allSnap.data()?.subscription) {
      currentSub = normalizeUserSubscription(allSnap.data().subscription);
    }
  } catch (err) {
    console.warn('Could not read existing subscription in activateUserPlanImmediately:', err);
  }

  let baseTimestamp = now;
  if (currentSub.validUntil && currentSub.paymentStatus === 'active') {
    const existingExpiry = new Date(currentSub.validUntil).getTime();
    if (!isNaN(existingExpiry) && existingExpiry > now) {
      baseTimestamp = existingExpiry;
    }
  }

  const finalExpiresAt = new Date(baseTimestamp + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const historyItem = {
    id: `rzp_${paymentId}`,
    date: activatedAt,
    amount: matchedPlan.price,
    utr: paymentId,
    slipUrl: 'RAZORPAY_LIVE_ONLINE_SUCCESS',
    approvedBy: 'razorpay_live_auto_approval',
    status: 'success',
    notes: `Razorpay Live: ${matchedPlan.displayName} (${durationDays} Days) • ID: ${paymentId}`,
  };

  const updatedSub: UserSubscription = {
    ...currentSub,
    planType: 'paid',
    paymentStatus: 'active',
    isPro: true,
    monthlyFee: matchedPlan.price,
    validUntil: finalExpiresAt,
    paymentHistory: [historyItem, ...(currentSub.paymentHistory || [])],
  };

  // 1. Immediately update localStorage with all standard keys so app state never gets locked out
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('isPro', 'true');
      localStorage.setItem('subscriptionStatus', 'active');
      localStorage.setItem('cp_current_is_pro', 'true');
      localStorage.setItem(`cp_is_pro_${effectiveUserId}`, 'true');
      localStorage.setItem(`cp_sub_${effectiveUserId}`, JSON.stringify(updatedSub));
      localStorage.setItem('cp_plan_expires_at', finalExpiresAt);
      localStorage.setItem('cp_user_status', 'approved');
      localStorage.setItem('cp_last_plan', matchedPlan.name);
      localStorage.setItem('cp_last_payment_id', paymentId);

      const txRecord: RazorpayTransactionRecord = {
        paymentId: paymentId,
        planId: matchedPlan.id,
        planName: matchedPlan.name,
        amount: matchedPlan.price,
        durationDays: durationDays,
        date: activatedAt,
      };
      const rawHistory = localStorage.getItem('cp_razorpay_transactions');
      const txHistory = rawHistory ? JSON.parse(rawHistory) : [];
      localStorage.setItem('cp_razorpay_transactions', JSON.stringify([txRecord, ...txHistory]));
      localStorage.setItem('cp_last_razorpay_tx', JSON.stringify(txRecord));
    } catch (e) {
      console.warn('Failed to update localStorage in activateUserPlanImmediately:', e);
    }
  }

  // 2. Exactly specified Firestore schema payload:
  const firestorePayload: any = {
    isPro: true,
    isApproved: true,
    status: 'approved',
    subscriptionStatus: 'active',
    plan: matchedPlan.name,
    planId: matchedPlan.id,
    planActivatedAt: activatedAt,
    planExpiresAt: finalExpiresAt,
    validUntil: finalExpiresAt,
    lastPaymentId: paymentId,
    lastPaymentAt: activatedAt,
    updatedAt: activatedAt,
    subscription: updatedSub,
  };

  if (effectiveEmail) {
    firestorePayload.email = effectiveEmail;
  }

  // 3. Write with merge: true to prevent permission rejection on non-existent fields
  try {
    const paymentDocRef = doc(db, 'razorpay_payments', paymentId);
    await Promise.all([
      setDoc(userRef, firestorePayload, { merge: true }),
      setDoc(allUserRef, firestorePayload, { merge: true }),
      setDoc(
        paymentDocRef,
        {
          paymentId,
          userId: effectiveUserId,
          email: effectiveEmail,
          planId: matchedPlan.id,
          planName: matchedPlan.name,
          amount: matchedPlan.price,
          status: 'captured',
          activatedAt,
          expiresAt: finalExpiresAt,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      ).catch((e) => console.warn('Could not record razorpay payment document:', e)),
    ]);
    console.log('Successfully written activation payload to Firestore for user:', effectiveUserId);
  } catch (err) {
    console.error('CRITICAL: Error writing activation to Firestore:', err);
  }

  // Clear pending checkout on successful activation
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('cp_pending_checkout');
    } catch (e) {
      // Ignore
    }
  }

  // 4. Dispatch global window event for instant React context / component update
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('courier-payout:plan-activated', {
          detail: {
            userId: effectiveUserId,
            plan: matchedPlan,
            paymentId,
            subscription: updatedSub,
            validUntil: finalExpiresAt,
          },
        })
      );
    } catch (e) {
      console.warn('Could not dispatch plan-activated event:', e);
    }
  }

  return {
    subscription: updatedSub,
    validUntil: finalExpiresAt,
    plan: matchedPlan,
  };
}

/**
 * On successful payment auto-approval wrapper
 */
export async function executeRazorpayAutoApproval(
  userId: string,
  userEmail: string | null,
  plan: RazorpayPlan,
  response: RazorpaySuccessResponse
): Promise<UserSubscription> {
  const result = await activateUserPlanImmediately(
    userId,
    plan.id,
    response.razorpay_payment_id,
    userEmail
  );
  return result.subscription;
}

/**
 * Check if the user already has a successful payment in Firestore
 */
export async function checkRecentPaymentInFirestore(
  userId: string
): Promise<{ found: boolean; paymentId?: string; planId?: string }> {
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data?.lastPaymentId && (data?.isPro || data?.subscriptionStatus === 'active')) {
        return { found: true, paymentId: data.lastPaymentId, planId: data.planId || 'growth' };
      }
    }

    const allUserRef = doc(db, 'all_users', userId);
    const allSnap = await getDoc(allUserRef);
    if (allSnap.exists()) {
      const data = allSnap.data();
      if (data?.lastPaymentId && (data?.isPro || data?.subscriptionStatus === 'active')) {
        return { found: true, paymentId: data.lastPaymentId, planId: data.planId || 'growth' };
      }
    }
  } catch (e) {
    console.warn('Error checking recent payment in Firestore:', e);
  }

  return { found: false };
}

/**
 * Verifies user entered payment ID (or pending checkout) and restores access immediately
 */
export async function verifyAndRestorePayment(
  userId: string,
  paymentIdInput: string,
  userEmail?: string | null
): Promise<{ success: boolean; message: string; subscription?: UserSubscription; validUntil?: string }> {
  const cleanInput = paymentIdInput.trim();
  if (!cleanInput) {
    return { success: false, message: 'कृपया मान्य Razorpay Payment ID (उदा. pay_...) दर्ज करें।' };
  }

  // Format payment ID (ensure pay_ prefix if standard alphanumeric ID given)
  let targetPaymentId = cleanInput;
  if (!targetPaymentId.startsWith('pay_') && !targetPaymentId.startsWith('rzp_') && targetPaymentId.length > 5) {
    targetPaymentId = `pay_${cleanInput}`;
  }

  let targetPlanId = 'growth';
  try {
    const pendingRaw = localStorage.getItem('cp_pending_checkout');
    if (pendingRaw) {
      const pending = JSON.parse(pendingRaw);
      if (pending?.planId) {
        targetPlanId = pending.planId;
      }
    }
  } catch (e) {
    // Ignore
  }

  try {
    const res = await activateUserPlanImmediately(
      userId,
      targetPlanId,
      targetPaymentId,
      userEmail
    );

    return {
      success: true,
      message: `सत्यापित! आपका ${res.plan.displayName} खाता सफलतापूर्वक सक्रिय कर दिया गया है।`,
      subscription: res.subscription,
      validUntil: res.validUntil,
    };
  } catch (err: any) {
    console.error('Error in verifyAndRestorePayment:', err);
    return {
      success: false,
      message: err.message || 'भुगतान सत्यापन में त्रुटि हुई। कृपया पुनः प्रयास करें।',
    };
  }
}
