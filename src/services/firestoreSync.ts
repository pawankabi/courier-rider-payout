import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  serverTimestamp,
  query,
  where,
  limit,
  arrayUnion,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, auth } from '../firebase';
export { db };
import { 
  Rider, 
  DeliveryEntry, 
  SettlementRecord, 
  AppUser, 
  UserPermissions, 
  UserRateConfig, 
  UserSubscription,
  UserPlanType,
  UserPaymentStatus,
  UserSubmittedSlip,
  PaymentHistoryItem,
  DefaultSubscriptionConfig,
  DEFAULT_USER_PERMISSIONS, 
  DEFAULT_USER_RATE_CONFIG,
  DEFAULT_SUBSCRIPTION_CONFIG,
  createDefaultUserSubscription,
  RiderAdvanceEntry,
  RiderIncentiveEntry,
  PublicRiderStatement
} from '../types';
import { 
  saveRidersToStorage, 
  saveDeliveriesToStorage, 
  saveSettlementsToStorage, 
  loadSettlementsFromStorage,
  setCachedAuthUserId 
} from '../utils/storage';
import { purgePhantomAdvances } from '../utils/pureLedgerEngine';
import { calculateActiveAdvanceTotal, calculateActiveIncentiveTotal } from '../utils/payoutCalculations';

export const SUPER_ADMIN_EMAIL = 'pawankabiseraikella@gmail.com';

export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

export function isTransientNetworkError(err: any): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || err || '').toLowerCase();
  if (
    code === 'permission-denied' ||
    code === 'unauthenticated' ||
    code === 'invalid-argument' ||
    code === 'resource-exhausted' ||
    code === 'failed-precondition' ||
    msg.includes('permission') ||
    msg.includes('insufficient permissions') ||
    msg.includes('invalid-argument') ||
    msg.includes('quota')
  ) {
    return false;
  }
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'cancelled' ||
    msg.includes('offline') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('unavailable')
  );
}

/**
 * Recursively strips undefined values so Firestore never throws
 * "Unsupported field value: undefined" errors on setDoc / writeBatch.
 */
export function cleanForFirestore<T extends Record<string, any>>(obj: T): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => (typeof item === 'object' && item !== null ? cleanForFirestore(item) : item));
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        cleaned[key] = cleanForFirestore(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned;
}

/**
 * Strict Workspace Isolation & Negative Ownership Filter:
 * Only returns true if the entity was created by the target user:
 * - Matches createdBy == targetUid OR createdBy == targetEmail OR createdByEmail == targetEmail
 * - Strictly purges / rejects any entity created by other external Gmail accounts or different UIDs
 */
export function isEntityOwnedByUser(
  entity: {
    createdBy?: string;
    createdByEmail?: string;
    workspaceId?: string;
    userId?: string;
  },
  userUid: string,
  userEmail?: string | null
): boolean {
  if (!userUid) return false;
  const targetUid = userUid.trim();
  const targetEmail = (userEmail || '').trim().toLowerCase();

  // Master Super Admin has full ownership & visibility across all hub workspaces
  if (targetEmail === SUPER_ADMIN_EMAIL.toLowerCase() || isSuperAdmin(targetUid)) {
    return true;
  }

  // 1. Strict Negative Check: Purge all external Gmail accounts
  if (entity.createdByEmail) {
    const email = entity.createdByEmail.trim().toLowerCase();
    if (targetEmail && email !== targetEmail) {
      return false; // Created by an external email!
    }
  }

  if (entity.createdBy && entity.createdBy.includes('@')) {
    const email = entity.createdBy.trim().toLowerCase();
    if (targetEmail && email !== targetEmail) {
      return false; // Created by an external email!
    }
  }

  // Strict Negative Check: Purge foreign UIDs
  if (entity.createdBy && !entity.createdBy.includes('@') && entity.createdBy !== 'guest') {
    if (entity.createdBy !== targetUid) {
      return false; // Belongs to a different UID!
    }
  }

  if (entity.userId && entity.userId !== 'guest' && entity.userId !== targetUid) {
    return false;
  }

  if (entity.workspaceId && entity.workspaceId !== 'guest' && entity.workspaceId !== targetUid) {
    return false;
  }

  // 2. Positive Match Check:
  // Match either auth.currentUser.uid or auth.currentUser.email
  if (entity.createdBy === targetUid) return true;
  if (targetEmail && entity.createdBy && entity.createdBy.trim().toLowerCase() === targetEmail) return true;
  if (targetEmail && entity.createdByEmail && entity.createdByEmail.trim().toLowerCase() === targetEmail) return true;
  if (entity.workspaceId === targetUid) return true;
  if (entity.userId === targetUid) return true;

  // If untagged legacy item, only allow if running in local guest mode
  if (!entity.createdBy && !entity.createdByEmail && !entity.userId && !entity.workspaceId) {
    return !targetUid || targetUid === 'guest';
  }

  return false;
}

/**
 * Normalizes user permissions ensuring both standard keys (dailyEntry, riders, incentives, reports)
 * and legacy keys (canAccessDailyEntry, etc.) remain in sync.
 * Master Super Admin has codCompanionAccess active by default; normal hub accounts have it OFF by default.
 */
export function normalizeUserPermissions(raw?: any, isSuperAdminUser: boolean = false): UserPermissions {
  if (!raw) {
    const isAllowed = isSuperAdminUser;
    return {
      ...DEFAULT_USER_PERMISSIONS,
      codCompanionAccess: isAllowed,
      isCodAccessEnabled: isAllowed,
      hasCodPermission: isAllowed,
    };
  }
  const dailyEntry = raw.dailyEntry ?? raw.canAccessDailyEntry ?? true;
  const riders = raw.riders ?? raw.canAccessRiders ?? true;
  const incentives = raw.incentives ?? raw.canAccessIncentives ?? true;
  const reports = raw.reports ?? raw.canAccessReports ?? true;
  const festivalGreetings = raw.festivalGreetings ?? raw.canAccessFestivalGreetings ?? false;
  const canExportData = raw.canExportData ?? true;
  const codCompanionAccess = raw.isCodAccessEnabled !== undefined
    ? Boolean(raw.isCodAccessEnabled)
    : raw.hasCodPermission !== undefined
    ? Boolean(raw.hasCodPermission)
    : raw.codCompanionAccess !== undefined
    ? Boolean(raw.codCompanionAccess)
    : isSuperAdminUser;
  const isCodAccessEnabled = codCompanionAccess;
  const hasCodPermission = codCompanionAccess;
  const codShareLinkVisibility = raw.codShareLinkVisibility !== undefined
    ? Boolean(raw.codShareLinkVisibility)
    : false;
  const allowRiderDeliveryCountInput = raw.allowRiderDeliveryCountInput !== undefined
    ? Boolean(raw.allowRiderDeliveryCountInput)
    : false;

  return {
    dailyEntry,
    riders,
    incentives,
    reports,
    festivalGreetings,
    canAccessDailyEntry: dailyEntry,
    canAccessRiders: riders,
    canAccessIncentives: incentives,
    canAccessReports: reports,
    canAccessFestivalGreetings: festivalGreetings,
    canExportData,
    codCompanionAccess,
    isCodAccessEnabled,
    hasCodPermission,
    codShareLinkVisibility,
    allowRiderDeliveryCountInput,
  };
}

/**
 * Normalizes subscription data ensuring valid planType, paymentStatus, and valid dates
 */
export function normalizeUserSubscription(sub?: any): UserSubscription {
  if (!sub || typeof sub !== 'object') {
    return createDefaultUserSubscription();
  }

  let planType: UserPlanType = sub.planType === 'free' ? 'free' : 'paid';

  const validPaymentStatuses: UserPaymentStatus[] = [
    'active',
    'expiring_soon',
    'expired',
    'verification_pending',
    'awaiting_approval',
  ];
  let paymentStatus: UserPaymentStatus = validPaymentStatuses.includes(sub.paymentStatus)
    ? sub.paymentStatus
    : 'expired';

  const freeUntilDate = typeof sub.freeUntilDate === 'string' ? sub.freeUntilDate : '';

  // Check Time-Bound Free Trial (Conditional Free):
  // Once the freeUntilDate is passed, automatically mark plan as expired/paid
  if (planType === 'free' && freeUntilDate.trim().length > 0) {
    const freeUntilTime = freeUntilDate.length === 10
      ? new Date(`${freeUntilDate}T23:59:59.999Z`).getTime()
      : new Date(freeUntilDate).getTime();
    if (!isNaN(freeUntilTime) && freeUntilTime < Date.now()) {
      planType = 'paid';
      paymentStatus = 'expired';
    }
  }

  let lastSubmittedSlip: UserSubmittedSlip | undefined = undefined;
  if (sub.lastSubmittedSlip && typeof sub.lastSubmittedSlip === 'object') {
    lastSubmittedSlip = {
      slipUrl: String(sub.lastSubmittedSlip.slipUrl || ''),
      utrNumber: sub.lastSubmittedSlip.utrNumber ? String(sub.lastSubmittedSlip.utrNumber) : undefined,
      submittedAt: String(sub.lastSubmittedSlip.submittedAt || new Date().toISOString()),
      amountPaid: typeof sub.lastSubmittedSlip.amountPaid === 'number' 
        ? sub.lastSubmittedSlip.amountPaid 
        : (typeof sub.monthlyFee === 'number' ? sub.monthlyFee : 499),
    };
  }

  const paymentHistory: PaymentHistoryItem[] = Array.isArray(sub.paymentHistory)
    ? sub.paymentHistory.map((item: any) => ({
        id: String(item.id || `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
        date: String(item.date || new Date().toISOString()),
        amount: typeof item.amount === 'number' ? item.amount : (typeof sub.monthlyFee === 'number' ? sub.monthlyFee : 499),
        utr: item.utr ? String(item.utr) : undefined,
        slipUrl: item.slipUrl ? String(item.slipUrl) : undefined,
        approvedBy: String(item.approvedBy || 'admin'),
        notes: item.notes ? String(item.notes) : undefined,
      }))
    : [];

  return {
    planType,
    monthlyFee: typeof sub.monthlyFee === 'number' ? sub.monthlyFee : 499,
    validUntil:
      typeof sub.validUntil === 'string' && sub.validUntil
        ? sub.validUntil
        : new Date().toISOString(),
    qrCodeUrl: typeof sub.qrCodeUrl === 'string' ? sub.qrCodeUrl : '',
    paymentStatus,
    isPro: Boolean(sub.isPro || paymentStatus === 'active'),
    freeUntilDate,
    ...(lastSubmittedSlip ? { lastSubmittedSlip } : {}),
    paymentHistory,
  };
}

export const SYSTEM_SETTINGS_COLLECTION = 'system_settings';
export const SUBSCRIPTION_CONFIG_DOC = 'subscription';

/**
 * Super Admin: Get configurable default subscription for new users
 * Checks system_settings/subscription with fallback to settings/billing and admin_config/subscription
 */
export async function getDefaultSubscriptionConfig(): Promise<DefaultSubscriptionConfig> {
  try {
    const docRef = doc(db, SYSTEM_SETTINGS_COLLECTION, SUBSCRIPTION_CONFIG_DOC);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const validPlanTypes: UserPlanType[] = ['free', 'paid'];
      const planType: UserPlanType = validPlanTypes.includes(data.planType) ? data.planType : 'free';
      const validStatuses: UserPaymentStatus[] = ['active', 'expiring_soon', 'expired', 'verification_pending'];
      const paymentStatus: UserPaymentStatus = validStatuses.includes(data.paymentStatus) ? data.paymentStatus : 'active';

      return {
        planType,
        monthlyFee: typeof data.monthlyFee === 'number' ? data.monthlyFee : DEFAULT_SUBSCRIPTION_CONFIG.monthlyFee,
        trialDays: typeof data.trialDays === 'number' && data.trialDays > 0 ? data.trialDays : DEFAULT_SUBSCRIPTION_CONFIG.trialDays,
        qrCodeUrl: typeof data.qrCodeUrl === 'string' ? data.qrCodeUrl : DEFAULT_SUBSCRIPTION_CONFIG.qrCodeUrl,
        paymentStatus,
      };
    }

    // Secondary fallback to settings/billing
    try {
      const fallbackSnap = await getDoc(doc(db, 'settings', 'billing'));
      if (fallbackSnap.exists()) {
        const data = fallbackSnap.data();
        return {
          planType: data.planType || 'paid',
          monthlyFee: typeof data.monthlyFee === 'number' ? data.monthlyFee : 499,
          trialDays: typeof data.trialDays === 'number' ? data.trialDays : 30,
          qrCodeUrl: typeof data.qrCodeUrl === 'string' ? data.qrCodeUrl : '',
          paymentStatus: data.paymentStatus || 'expired',
        };
      }
    } catch {}
  } catch (err) {
    console.warn('Could not fetch default subscription config from Firestore:', err);
  }
  return { ...DEFAULT_SUBSCRIPTION_CONFIG };
}

/**
 * Super Admin: Save configurable default subscription for new users
 * Saves base64 QR image and subscription configuration to system_settings/subscription,
 * settings/billing, and admin_config/subscription for total cross-module availability.
 */
export async function saveDefaultSubscriptionConfig(config: DefaultSubscriptionConfig): Promise<void> {
  const payload = {
    planType: config.planType || 'free',
    monthlyFee: typeof config.monthlyFee === 'number' ? config.monthlyFee : 0,
    trialDays: typeof config.trialDays === 'number' ? config.trialDays : 30,
    qrCodeUrl: config.qrCodeUrl || '',
    paymentStatus: config.paymentStatus || 'active',
    updatedAt: serverTimestamp(),
  };

  // Primary store: system_settings/subscription
  const docRef = doc(db, SYSTEM_SETTINGS_COLLECTION, SUBSCRIPTION_CONFIG_DOC);
  await setDoc(docRef, payload, { merge: true });

  // Redundant mirrors for settings/billing & admin_config/subscription
  try {
    await setDoc(doc(db, 'settings', 'billing'), payload, { merge: true });
  } catch (err) {
    console.warn('Could not mirror settings to settings/billing:', err);
  }

  try {
    await setDoc(doc(db, 'admin_config', 'subscription'), payload, { merge: true });
  } catch (err) {
    console.warn('Could not mirror settings to admin_config/subscription:', err);
  }
}

/**
 * Subscribe to default subscription config changes in real-time
 */
export function subscribeToDefaultSubscriptionConfig(
  onConfig: (config: DefaultSubscriptionConfig) => void,
  onError?: (err: Error) => void
): () => void {
  const docRef = doc(db, SYSTEM_SETTINGS_COLLECTION, SUBSCRIPTION_CONFIG_DOC);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const validPlanTypes: UserPlanType[] = ['free', 'paid'];
        const planType: UserPlanType = validPlanTypes.includes(data.planType) ? data.planType : 'free';
        const validStatuses: UserPaymentStatus[] = ['active', 'expiring_soon', 'expired', 'verification_pending'];
        const paymentStatus: UserPaymentStatus = validStatuses.includes(data.paymentStatus) ? data.paymentStatus : 'active';

        onConfig({
          planType,
          monthlyFee: typeof data.monthlyFee === 'number' ? data.monthlyFee : DEFAULT_SUBSCRIPTION_CONFIG.monthlyFee,
          trialDays: typeof data.trialDays === 'number' && data.trialDays > 0 ? data.trialDays : DEFAULT_SUBSCRIPTION_CONFIG.trialDays,
          qrCodeUrl: typeof data.qrCodeUrl === 'string' ? data.qrCodeUrl : DEFAULT_SUBSCRIPTION_CONFIG.qrCodeUrl,
          paymentStatus,
        });
      } else {
        onConfig({ ...DEFAULT_SUBSCRIPTION_CONFIG });
      }
    },
    (err) => {
      console.warn('Error subscribing to subscription system settings:', err);
      onError?.(err);
    }
  );
}

export interface SyncProfileResult {
  status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected';
  validUntil?: string;
  isPending: boolean;
  isDeactivated: boolean;
  isBlocked: boolean;
  isApproved: boolean;
  isPro?: boolean;
  role: 'admin' | 'user';
  permissions: UserPermissions;
  rateConfig: UserRateConfig;
  hubSignature?: string;
  subscription: UserSubscription;
  codCompanies?: string[];
  appLockEnabled?: boolean;
}

/**
 * Update or register user in central all_users collection and users/{uid} root document.
 * On every user signup/login, automatically records details:
 * - If Super Admin: automatically assigned active status and admin role.
 * - If New Regular User: default status is STRICTLY "pending" until approved by Admin.
 * - Existing users preserve their established status (pending, approved, active, or blocked).
 */
export async function syncUserProfile(user: User): Promise<SyncProfileResult> {
  try {
    const adminRole = isSuperAdmin(user.email);
    const userRef = doc(db, 'users', user.uid);
    const allUserRef = doc(db, 'all_users', user.uid);

    const [userSnap, allSnap] = await Promise.all([
      getDoc(userRef).catch(() => null),
      getDoc(allUserRef).catch(() => null),
    ]);

    let status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected' = adminRole ? 'active' : 'pending';
    let role: 'admin' | 'user' = adminRole ? 'admin' : 'user';
    let permissions: UserPermissions = adminRole 
      ? { ...DEFAULT_USER_PERMISSIONS, codCompanionAccess: true }
      : { ...DEFAULT_USER_PERMISSIONS, codCompanionAccess: false };
    let rateConfig: UserRateConfig = { ...DEFAULT_USER_RATE_CONFIG };
    let subscription: UserSubscription;
    let validUntil: string = '';
    const userName = user.displayName || user.email?.split('@')[0] || 'User';

    // Fetch saved default subscription configuration from Firestore
    const defaultSubConfig = await getDefaultSubscriptionConfig();

    const defaultInitialSub: UserSubscription = {
      planType: defaultSubConfig.planType || 'paid', // Use configured default plan
      monthlyFee: typeof defaultSubConfig.monthlyFee === 'number' && defaultSubConfig.monthlyFee > 0 ? defaultSubConfig.monthlyFee : 499,
      validUntil: new Date().toISOString(), // Expired by default so initial payment is required
      paymentStatus: defaultSubConfig.planType === 'free' ? 'active' : (defaultSubConfig.paymentStatus || 'expired'),
      qrCodeUrl: defaultSubConfig.qrCodeUrl || '', // Automatically assigned from saved default QR!
    };

    // Check if user already has a configured subscription in users/{uid} or all_users/{uid}
    if (userSnap && userSnap.exists() && userSnap.data()?.subscription) {
      subscription = normalizeUserSubscription(userSnap.data()?.subscription);
      validUntil = userSnap.data()?.validUntil || subscription.validUntil || '';
      // Automatically assign saved default QR image if user's QR is not customized yet
      if (!subscription.qrCodeUrl && defaultSubConfig.qrCodeUrl) {
        subscription.qrCodeUrl = defaultSubConfig.qrCodeUrl;
      }
    } else if (allSnap && allSnap.exists() && allSnap.data()?.subscription) {
      subscription = normalizeUserSubscription(allSnap.data()?.subscription);
      validUntil = allSnap.data()?.validUntil || subscription.validUntil || '';
      if (!subscription.qrCodeUrl && defaultSubConfig.qrCodeUrl) {
        subscription.qrCodeUrl = defaultSubConfig.qrCodeUrl;
      }
    } else {
      // First-time Gmail login or new user registration
      subscription = defaultInitialSub;
      validUntil = subscription.validUntil;
    }

    if (allSnap && allSnap.exists()) {
      const data = allSnap.data();
      // Super admin is always active; otherwise preserve recorded status or default to pending
      status = adminRole 
        ? 'active' 
        : (data.status as 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected') || 'pending';
      role = adminRole ? 'admin' : (data.role || 'user');
      validUntil = data.validUntil || subscription.validUntil || '';
      if (data.permissions) {
        permissions = normalizeUserPermissions(data.permissions, adminRole);
      }
      if (data.rateConfig) {
        rateConfig = { ...DEFAULT_USER_RATE_CONFIG, ...data.rateConfig };
      }

      // Update login timestamp, name, photo, and ensure subscription is written
      await updateDoc(allUserRef, {
        email: user.email || '',
        name: userName,
        displayName: userName,
        photoURL: user.photoURL || '',
        lastLoginAt: new Date().toISOString(),
        role,
        permissions,
        rateConfig,
        subscription,
        validUntil,
        updatedAt: serverTimestamp(),
      });
    } else {
      // First time registration in central registry
      const newUserData = {
        uid: user.uid,
        email: user.email || '',
        name: userName,
        displayName: userName,
        photoURL: user.photoURL || '',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        status, // 'active' for super admin, 'pending' for regular user
        role,
        permissions: adminRole
          ? { ...DEFAULT_USER_PERMISSIONS, codCompanionAccess: true }
          : { ...DEFAULT_USER_PERMISSIONS, codCompanionAccess: false },
        rateConfig,
        subscription,
        validUntil,
        updatedAt: serverTimestamp(),
      };
      await setDoc(allUserRef, newUserData);
    }

    // Always ensure root user document users/{uid} contains subscription and validUntil
    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: user.email || '',
        name: userName,
        displayName: userName,
        photoURL: user.photoURL || '',
        lastLoginAt: new Date().toISOString(),
        subscription,
        validUntil,
        status,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    let userCodCompanies: string[] = ['Valmo', 'Xpressbees'];
    if (allSnap && allSnap.exists() && Array.isArray(allSnap.data()?.codCompanies) && allSnap.data()?.codCompanies.length > 0) {
      userCodCompanies = allSnap.data()?.codCompanies;
    } else if (userSnap && userSnap.exists() && Array.isArray(userSnap.data()?.codCompanies) && userSnap.data()?.codCompanies.length > 0) {
      userCodCompanies = userSnap.data()?.codCompanies;
    }

    const isPending = !adminRole && status === 'pending';
    const isBlocked = !adminRole && (status === 'deactivated' || status === 'blocked' || status === 'rejected');
    const isApproved = adminRole || status === 'approved' || status === 'active';

    return { 
      status,
      validUntil,
      isPending, 
      isDeactivated: isBlocked, 
      isBlocked, 
      isApproved,
      isPro: Boolean(subscription.isPro || subscription.paymentStatus === 'active' || adminRole),
      role, 
      permissions, 
      rateConfig,
      hubSignature: rateConfig.hubSignature || '',
      subscription,
      codCompanies: userCodCompanies,
      appLockEnabled: Boolean(userSnap?.data()?.appLockEnabled ?? allSnap?.data()?.appLockEnabled),
    };
  } catch (error) {
    console.error('Error syncing user profile to Firestore:', error);
    const adminRole = isSuperAdmin(user.email);
    return { 
      status: adminRole ? 'active' : 'pending',
      validUntil: '',
      isPending: !adminRole,
      isDeactivated: false, 
      isBlocked: false,
      isApproved: adminRole,
      isPro: adminRole,
      role: adminRole ? 'admin' : 'user',
      permissions: adminRole 
        ? { ...DEFAULT_USER_PERMISSIONS, codCompanionAccess: true }
        : { ...DEFAULT_USER_PERMISSIONS, codCompanionAccess: false },
      rateConfig: { ...DEFAULT_USER_RATE_CONFIG },
      hubSignature: '',
      subscription: createDefaultUserSubscription(),
    };
  }
}

/**
 * Real-time listener for current user document in all_users.
 * Listens for:
 * 1) Admin approval / activation / deactivation / blocking / validity extensions
 * 2) Feature access flag changes
 * 3) Rate configurations
 * 4) Subscription & validUntil updates
 */
export function subscribeToCurrentUserDoc(
  userId: string,
  userEmail: string | null | undefined,
  onUpdate: (userData: {
    status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected';
    validUntil?: string;
    isPending: boolean;
    isBlocked: boolean;
    isApproved: boolean;
    permissions: UserPermissions;
    rateConfig: UserRateConfig;
    hubSignature?: string;
    subscription?: UserSubscription;
    codCompanies?: string[];
    rawDoc?: any;
  }) => void
): () => void {
  const allUserRef = doc(db, 'all_users', userId);
  const userRef = doc(db, 'users', userId);
  const adminRole = isSuperAdmin(userEmail);

  let mergedData: any = {};

  const processAndNotify = () => {
    const isProSubscription = Boolean(
      mergedData.isPro ||
      mergedData.subscriptionStatus === 'active' ||
      mergedData.subscription?.isPro ||
      mergedData.subscription?.paymentStatus === 'active'
    );
    const rawStatus = (mergedData.status as 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected') || (isProSubscription ? 'approved' : 'pending');
    const status = adminRole ? 'active' : (rawStatus === 'pending' && isProSubscription ? 'approved' : rawStatus);
    const isPending = !adminRole && status === 'pending';
    const isBlocked = !adminRole && (status === 'deactivated' || status === 'blocked' || status === 'rejected');
    const isApproved = adminRole || status === 'approved' || status === 'active' || isProSubscription;

    const permissions = normalizeUserPermissions(mergedData.permissions, adminRole);
    const rateConfig = mergedData.rateConfig 
      ? { ...DEFAULT_USER_RATE_CONFIG, ...mergedData.rateConfig } 
      : { ...DEFAULT_USER_RATE_CONFIG };
    const hubSignature = mergedData.hubSignature || rateConfig.hubSignature || '';
    const subscription = normalizeUserSubscription(mergedData.subscription);
    const validUntil = mergedData.planExpiresAt || mergedData.validUntil || subscription.validUntil || '';

    const codCompanies = Array.isArray(mergedData.codCompanies) && mergedData.codCompanies.length > 0
      ? mergedData.codCompanies
      : ['Valmo', 'Xpressbees'];

    onUpdate({ 
      status, 
      validUntil,
      isPending, 
      isBlocked, 
      isApproved, 
      permissions, 
      rateConfig, 
      hubSignature, 
      subscription, 
      codCompanies,
      rawDoc: mergedData 
    });
  };

  const unsubAll = onSnapshot(
    allUserRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        mergedData = { ...mergedData, ...data };
        if (data.subscription) {
          mergedData.subscription = data.subscription;
        }
        processAndNotify();
      } else if (!mergedData.status) {
        onUpdate({
          status: adminRole ? 'active' : 'pending',
          isPending: !adminRole,
          isBlocked: false,
          isApproved: adminRole,
          permissions: adminRole ? { ...DEFAULT_USER_PERMISSIONS, codCompanionAccess: true } : DEFAULT_USER_PERMISSIONS,
          rateConfig: DEFAULT_USER_RATE_CONFIG,
          hubSignature: '',
          subscription: createDefaultUserSubscription(),
          codCompanies: ['Valmo', 'Xpressbees'],
        });
      }
    },
    (error) => {
      console.warn('Notice from all_users listener:', error);
    }
  );

  const unsubUser = onSnapshot(
    userRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        mergedData = { ...mergedData, ...data };
        if (data.subscription) {
          mergedData.subscription = data.subscription;
        }
        processAndNotify();
      }
    },
    (error) => {
      console.warn('Notice from users listener:', error);
    }
  );

  return () => {
    unsubAll();
    unsubUser();
  };
}

/**
 * Backward-compatible helper for user status listener
 */
export function subscribeToUserStatus(
  userId: string,
  userEmail: string | null | undefined,
  onStatusChange: (status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected') => void
): () => void {
  return subscribeToCurrentUserDoc(userId, userEmail, (data) => {
    onStatusChange(data.status);
  });
}

/**
 * Super Admin: Listen to all registered users in real-time
 */
export function subscribeToAllUsers(
  onUsers: (users: AppUser[]) => void,
  onError?: (error: Error) => void
): () => void {
  const allUsersRef = collection(db, 'all_users');
  return onSnapshot(
    allUsersRef,
    (snapshot) => {
      const users: AppUser[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const rawStatus = (data.status as 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected') || 'pending';
        const status = isSuperAdmin(data.email) ? 'active' : rawStatus;
        const permissions = normalizeUserPermissions(data.permissions);
        const userName = data.name || data.displayName || data.email?.split('@')[0] || 'User';

        const sub = normalizeUserSubscription(data.subscription);
        const validUntil = data.validUntil || sub.validUntil || '';

        const codCompanies = Array.isArray(data.codCompanies) && data.codCompanies.length > 0
          ? data.codCompanies
          : ['Valmo', 'Xpressbees'];

        users.push({
          uid: docSnap.id,
          email: data.email || '',
          name: userName,
          displayName: userName,
          photoURL: data.photoURL || '',
          createdAt: data.createdAt || '',
          lastLoginAt: data.lastLoginAt || '',
          status,
          validUntil,
          role: data.role || (isSuperAdmin(data.email) ? 'admin' : 'user'),
          totalRiders: data.totalRiders || 0,
          totalEntries: data.totalEntries || 0,
          permissions,
          rateConfig: data.rateConfig 
            ? { ...DEFAULT_USER_RATE_CONFIG, ...data.rateConfig } 
            : { ...DEFAULT_USER_RATE_CONFIG },
          hubSignature: data.hubSignature || data.rateConfig?.hubSignature || '',
          subscription: sub,
          codCompanies,
        });
      });

      // Sort: pending first, then newest creation date
      users.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      onUsers(users);
    },
    (error) => {
      console.error('Error listening to all_users:', error);
      onError?.(error);
    }
  );
}

/**
 * Super Admin: Instantly Approve a pending access request
 */
export async function approveUser(userId: string): Promise<void> {
  const userRef = doc(db, 'all_users', userId);
  await updateDoc(userRef, {
    status: 'approved',
    approvedAt: new Date().toISOString(),
    statusUpdatedAt: serverTimestamp(),
  });
}

/**
 * Super Admin: Reject a pending access request (sets status to blocked)
 */
export async function rejectUser(userId: string): Promise<void> {
  const userRef = doc(db, 'all_users', userId);
  await updateDoc(userRef, {
    status: 'blocked',
    rejectedAt: new Date().toISOString(),
    statusUpdatedAt: serverTimestamp(),
  });
}

/**
 * Super Admin: Block an active/approved user immediately
 */
export async function blockUser(userId: string): Promise<void> {
  const userRef = doc(db, 'all_users', userId);
  await updateDoc(userRef, {
    status: 'blocked',
    blockedAt: new Date().toISOString(),
    statusUpdatedAt: serverTimestamp(),
  });
}

/**
 * Super Admin: Unblock a previously blocked user
 */
export async function unblockUser(userId: string): Promise<void> {
  const userRef = doc(db, 'all_users', userId);
  await updateDoc(userRef, {
    status: 'approved',
    unblockedAt: new Date().toISOString(),
    statusUpdatedAt: serverTimestamp(),
  });
}

/**
 * Super Admin: Change user status (Active vs Approved vs Pending vs Blocked)
 */
export async function setUserStatus(
  userId: string,
  newStatus: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected'
): Promise<void> {
  const userRef = doc(db, 'all_users', userId);
  await updateDoc(userRef, {
    status: newStatus,
    statusUpdatedAt: serverTimestamp(),
  });
}

/**
 * Super Admin: Extend a user's validity by N days (e.g. 30 days or 90 days),
 * sets status: 'approved', sets subscription.paymentStatus: 'active',
 * and updates both all_users and users root collections.
 */
export async function extendUserValidity(
  userId: string,
  days: number,
  currentValidUntil?: string
): Promise<{ validUntil: string; status: 'approved' }> {
  const userRef = doc(db, 'users', userId);
  const allUserRef = doc(db, 'all_users', userId);

  let baseValidTime = Date.now();
  if (currentValidUntil && currentValidUntil.trim().length > 0) {
    const parsed = new Date(currentValidUntil).getTime();
    if (!isNaN(parsed) && parsed > Date.now()) {
      baseValidTime = parsed;
    }
  } else {
    // Check if user document has existing validUntil in Firestore
    try {
      const snap = await getDoc(allUserRef);
      if (snap.exists()) {
        const data = snap.data();
        const existing = data.planExpiresAt || data.validUntil || data.subscription?.validUntil;
        if (existing) {
          const parsed = new Date(existing).getTime();
          if (!isNaN(parsed) && parsed > Date.now()) {
            baseValidTime = parsed;
          }
        }
      }
    } catch {}
  }

  const newValidUntil = new Date(baseValidTime + days * 24 * 60 * 60 * 1000).toISOString();

  const payload = {
    status: 'approved',
    validUntil: newValidUntil,
    planExpiresAt: newValidUntil,
    'subscription.validUntil': newValidUntil,
    'subscription.paymentStatus': 'active',
    approvedAt: new Date().toISOString(),
    statusUpdatedAt: serverTimestamp(),
    validityUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(allUserRef, payload);
  } catch {
    await setDoc(allUserRef, payload, { merge: true });
  }

  try {
    await updateDoc(userRef, payload);
  } catch {
    await setDoc(userRef, payload, { merge: true });
  }

  return { validUntil: newValidUntil, status: 'approved' };
}

/**
 * Super Admin: Set a custom validity date for a user,
 * sets status: 'approved', sets subscription.paymentStatus: 'active',
 * and updates both all_users and users root collections.
 */
export async function setUserValidityDate(
  userId: string,
  targetDateStr: string
): Promise<{ validUntil: string; status: 'approved' }> {
  const userRef = doc(db, 'users', userId);
  const allUserRef = doc(db, 'all_users', userId);

  let finalIso = targetDateStr;
  if (targetDateStr.length === 10) {
    // Format YYYY-MM-DD to end of day local/ISO
    finalIso = new Date(`${targetDateStr}T23:59:59.999Z`).toISOString();
  } else {
    const d = new Date(targetDateStr);
    if (!isNaN(d.getTime())) {
      finalIso = d.toISOString();
    }
  }

  const payload = {
    status: 'approved',
    validUntil: finalIso,
    planExpiresAt: finalIso,
    'subscription.validUntil': finalIso,
    'subscription.paymentStatus': 'active',
    statusUpdatedAt: serverTimestamp(),
    validityUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(allUserRef, payload);
  } catch {
    await setDoc(allUserRef, payload, { merge: true });
  }

  try {
    await updateDoc(userRef, payload);
  } catch {
    await setDoc(userRef, payload, { merge: true });
  }

  return { validUntil: finalIso, status: 'approved' };
}

/**
 * Super Admin: Immediately Lock / Deactivate a user, revoking dashboard access.
 */
export async function deactivateOrLockUser(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const allUserRef = doc(db, 'all_users', userId);

  // Expired timestamp (yesterday)
  const expiredIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const payload = {
    status: 'rejected',
    validUntil: expiredIso,
    'subscription.validUntil': expiredIso,
    'subscription.paymentStatus': 'expired',
    lockedAt: new Date().toISOString(),
    statusUpdatedAt: serverTimestamp(),
    validityUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(allUserRef, payload);
  } catch {
    await setDoc(allUserRef, payload, { merge: true });
  }

  try {
    await updateDoc(userRef, payload);
  } catch {
    await setDoc(userRef, payload, { merge: true });
  }
}

/**
 * Super Admin: Toggle user status between Active/Approved and Blocked in real time
 */
export async function toggleUserStatus(
  userId: string,
  currentStatus: string
): Promise<'active' | 'blocked'> {
  const newStatus = (currentStatus === 'blocked' || currentStatus === 'deactivated') ? 'active' : 'blocked';
  await setUserStatus(userId, newStatus);
  return newStatus;
}

/**
 * Super Admin: Toggle a single feature permission for a specific user in real time
 */
export async function toggleUserPermission(
  userId: string,
  currentPermissions: UserPermissions,
  key: 'dailyEntry' | 'riders' | 'incentives' | 'reports' | 'festivalGreetings' | 'codCompanionAccess' | 'codShareLinkVisibility' | 'allowRiderDeliveryCountInput'
): Promise<UserPermissions> {
  const nextVal = !currentPermissions[key];
  const updated: UserPermissions = {
    ...currentPermissions,
    [key]: nextVal,
  };
  if (key === 'dailyEntry') updated.canAccessDailyEntry = nextVal;
  if (key === 'riders') updated.canAccessRiders = nextVal;
  if (key === 'incentives') updated.canAccessIncentives = nextVal;
  if (key === 'reports') updated.canAccessReports = nextVal;
  if (key === 'festivalGreetings') updated.canAccessFestivalGreetings = nextVal;
  if (key === 'codCompanionAccess') updated.codCompanionAccess = nextVal;
  if (key === 'codShareLinkVisibility') updated.codShareLinkVisibility = nextVal;
  if (key === 'allowRiderDeliveryCountInput') updated.allowRiderDeliveryCountInput = nextVal;

  await updateUserPermissions(userId, updated);
  return updated;
}

/**
 * Super Admin: Update feature access permissions for a specific user
 */
export async function updateUserPermissions(
  userId: string,
  permissions: UserPermissions
): Promise<void> {
  const userRef = doc(db, 'all_users', userId);
  const normalized = normalizeUserPermissions(permissions);
  await updateDoc(userRef, {
    permissions: normalized,
    permissionsUpdatedAt: serverTimestamp(),
  });
}

/**
 * Super Admin: Update default rate configuration for a specific user
 */
export async function updateUserRateConfig(
  userId: string,
  rateConfig: UserRateConfig
): Promise<void> {
  const userRef = doc(db, 'all_users', userId);
  await updateDoc(userRef, {
    rateConfig,
    rateConfigUpdatedAt: serverTimestamp(),
  });
}

/**
 * Super Admin: Update custom hub signature for a specific user's workspace
 */
export async function updateUserHubSignature(
  userId: string,
  hubSignature: string
): Promise<void> {
  const userRef = doc(db, 'all_users', userId);
  const cleanSig = hubSignature.trim();
  await updateDoc(userRef, {
    hubSignature: cleanSig,
    'rateConfig.hubSignature': cleanSig,
    hubSignatureUpdatedAt: serverTimestamp(),
  });
}

/**
 * Super Admin: Update configured dynamic COD courier companies for a hub tenant
 */
export async function updateUserCodCompanies(
  userId: string,
  codCompanies: string[]
): Promise<string[]> {
  const userRef = doc(db, 'all_users', userId);
  const cleanCompanies = Array.isArray(codCompanies)
    ? Array.from(new Set(codCompanies.map((c) => String(c).trim()).filter(Boolean)))
    : ['Valmo', 'Xpressbees'];
  const finalCompanies = cleanCompanies.length > 0 ? cleanCompanies : ['Valmo', 'Xpressbees'];

  await updateDoc(userRef, {
    codCompanies: finalCompanies,
    codCompaniesUpdatedAt: serverTimestamp(),
  });

  // Also sync to workspaces/{userId}/cod_settings/config so Company 1 & 2 match the exact serial sequence
  try {
    const codSettingsRef = doc(db, 'workspaces', userId, 'cod_settings', 'config');
    await setDoc(
      codSettingsRef,
      {
        company1Name: finalCompanies[0] || 'Valmo COD',
        company2Name: finalCompanies[1] || 'Xpressbees COD',
        companies: finalCompanies,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn('Could not sync cod_settings doc in updateUserCodCompanies:', e);
  }

  return finalCompanies;
}

/**
 * Super Admin / System: Update subscription object for a specific user
 */
export async function updateUserSubscription(
  userId: string,
  subscription: Partial<UserSubscription>
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
  } catch (readErr) {
    console.warn('Failed to read existing subscription before update:', readErr);
  }
  
  const updatedSub = normalizeUserSubscription({ ...currentSub, ...subscription });

  // 1. Strictly execute updateDoc on users/{userId} -> subscription
  try {
    await updateDoc(userRef, {
      subscription: updatedSub,
      subscriptionUpdatedAt: serverTimestamp(),
    });
  } catch (docErr: any) {
    // If document does not exist yet in users/{userId}, create it with setDoc merge
    await setDoc(userRef, {
      subscription: updatedSub,
      subscriptionUpdatedAt: serverTimestamp(),
    }, { merge: true });
  }

  // 2. Also keep all_users registry updated for Master Admin table view
  try {
    await updateDoc(allUserRef, {
      subscription: updatedSub,
      subscriptionUpdatedAt: serverTimestamp(),
    });
  } catch (allErr: any) {
    await setDoc(allUserRef, {
      subscription: updatedSub,
      subscriptionUpdatedAt: serverTimestamp(),
    }, { merge: true });
  }

  return updatedSub;
}

/**
 * User / Client: Submit payment slip with slipUrl, optional utrNumber, amountPaid, and submittedAt
 * Automatically marks paymentStatus as 'awaiting_approval' (strict lockout until admin approval)
 */
export async function submitUserPaymentSlip(
  userId: string,
  slip: UserSubmittedSlip
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
  } catch (readErr) {
    console.warn('Failed to read existing subscription before slip submission:', readErr);
  }

  const updatedSub: UserSubscription = {
    ...currentSub,
    paymentStatus: 'awaiting_approval',
    lastSubmittedSlip: {
      slipUrl: slip.slipUrl,
      utrNumber: slip.utrNumber,
      submittedAt: slip.submittedAt || new Date().toISOString(),
      amountPaid: typeof slip.amountPaid === 'number' ? slip.amountPaid : currentSub.monthlyFee,
    },
  };

  const payload = {
    subscription: updatedSub,
    lastPaymentSlipSubmittedAt: serverTimestamp(),
  };

  try {
    await updateDoc(userRef, payload);
  } catch (err: any) {
    await setDoc(userRef, payload, { merge: true });
  }

  try {
    await updateDoc(allUserRef, payload);
  } catch (allErr: any) {
    await setDoc(allUserRef, payload, { merge: true });
  }

  return updatedSub;
}

/**
 * Super Admin: Approve payment slip, extend subscription validity by 30 days,
 * set paymentStatus = 'active', and append to permanent paymentHistory array.
 */
export async function approveUserPaymentSlip(
  userId: string,
  adminEmail = 'admin'
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
  } catch (readErr) {
    console.warn('Failed to read subscription for approval:', readErr);
  }

  const baseTime = Math.max(
    Date.now(),
    currentSub.validUntil ? new Date(currentSub.validUntil).getTime() : Date.now()
  );
  const newValidUntil = new Date(baseTime + 30 * 86400000).toISOString();

  const slip = currentSub.lastSubmittedSlip;
  const historyItem: PaymentHistoryItem = {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString(),
    amount: typeof slip?.amountPaid === 'number' ? slip.amountPaid : currentSub.monthlyFee,
    utr: slip?.utrNumber || undefined,
    slipUrl: slip?.slipUrl || undefined,
    approvedBy: adminEmail,
    notes: 'Approved & 30 Days Extension',
  };

  const existingHistory = Array.isArray(currentSub.paymentHistory) ? currentSub.paymentHistory : [];
  const updatedHistory = [historyItem, ...existingHistory];

  const updatedSub: UserSubscription = {
    ...currentSub,
    planType: 'paid',
    validUntil: newValidUntil,
    paymentStatus: 'active',
    paymentHistory: updatedHistory,
  };

  const payload = {
    subscription: updatedSub,
    paymentHistory: updatedHistory,
    subscriptionUpdatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(userRef, payload);
  } catch (err) {
    await setDoc(userRef, payload, { merge: true });
  }

  try {
    await updateDoc(allUserRef, payload);
  } catch (err) {
    await setDoc(allUserRef, payload, { merge: true });
  }

  return updatedSub;
}

/**
 * Super Admin: Reject payment slip (marks paymentStatus = 'expired')
 */
export async function rejectUserPaymentSlip(
  userId: string,
  adminEmail = 'admin'
): Promise<UserSubscription> {
  const userRef = doc(db, 'users', userId);
  const allUserRef = doc(db, 'all_users', userId);

  let currentSub = createDefaultUserSubscription();
  try {
    const snap = await getDoc(userRef);
    if (snap.exists() && snap.data()?.subscription) {
      currentSub = normalizeUserSubscription(snap.data().subscription);
    }
  } catch (err) {
    console.warn('Error reading subscription for rejection:', err);
  }

  const updatedSub: UserSubscription = {
    ...currentSub,
    paymentStatus: 'expired',
  };

  const payload = {
    subscription: updatedSub,
    subscriptionUpdatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(userRef, payload);
  } catch (err) {
    await setDoc(userRef, payload, { merge: true });
  }

  try {
    await updateDoc(allUserRef, payload);
  } catch (err) {
    await setDoc(allUserRef, payload, { merge: true });
  }

  return updatedSub;
}

/**
 * Super Admin: Fetch riders list of any user from isolated workspace
 */
export async function fetchUserRiders(userId: string): Promise<Rider[]> {
  try {
    let snap = await getDocs(collection(db, 'workspaces', userId, 'riders'));
    if (snap.empty) {
      // Fallback to legacy path for backward compatibility
      snap = await getDocs(collection(db, 'users', userId, 'riders'));
    }
    const riders: Rider[] = [];
    snap.forEach((d) => {
      riders.push(d.data() as Rider);
    });
    riders.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 99999;
      const orderB = typeof b.order === 'number' ? b.order : 99999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.joinedDate < b.joinedDate ? 1 : -1);
    });
    return riders;
  } catch (err) {
    console.error(`Error fetching riders for user ${userId}:`, err);
    return [];
  }
}

/**
 * Super Admin: Real-time listener for riders list of any user
 */
export function subscribeToUserRiders(
  userId: string,
  onRiders: (riders: Rider[]) => void,
  onError?: (err: Error) => void
): () => void {
  const ridersRef = collection(db, 'workspaces', userId, 'riders');
  return onSnapshot(
    ridersRef,
    (snapshot) => {
      const riders: Rider[] = [];
      snapshot.forEach((docSnap) => {
        riders.push(docSnap.data() as Rider);
      });
      riders.sort((a, b) => {
        const orderA = typeof a.order === 'number' ? a.order : 99999;
        const orderB = typeof b.order === 'number' ? b.order : 99999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.joinedDate < b.joinedDate ? 1 : -1);
      });
      onRiders(riders);
    },
    (err) => {
      console.error(`Error listening to riders for user ${userId}:`, err);
      onError?.(err);
    }
  );
}

/**
 * Super Admin: Update specific rider rate and incentive options
 */
export async function updateRiderRates(
  userId: string,
  riderId: string,
  updates: {
    baseRate?: number;
    incentiveRate?: number;
    incentiveEnabled?: boolean;
  }
): Promise<void> {
  const workspaceRef = doc(db, 'workspaces', userId, 'riders', riderId);
  await setDoc(workspaceRef, {
    ...updates,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

/**
 * Super Admin: Bulk update rates for selected or all riders of a specific user
 */
export async function bulkUpdateRidersRates(
  userId: string,
  riderIds: string[],
  updates: {
    baseRate?: number;
    incentiveRate?: number;
    incentiveEnabled?: boolean;
  }
): Promise<void> {
  if (riderIds.length === 0) return;
  const batch = writeBatch(db);
  riderIds.forEach((id) => {
    const workspaceRef = doc(db, 'workspaces', userId, 'riders', id);
    batch.set(workspaceRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  });
  await batch.commit();
}

/**
 * Super Admin: Fetch counts of riders and deliveries for an inspected user
 */
export async function fetchUserCounts(
  userId: string
): Promise<{ riderCount: number; deliveryCount: number }> {
  try {
    let [ridersSnap, deliveriesSnap] = await Promise.all([
      getDocs(collection(db, 'workspaces', userId, 'riders')),
      getDocs(collection(db, 'workspaces', userId, 'entries')),
    ]);

    // Fallback if not yet migrated
    if (ridersSnap.empty && deliveriesSnap.empty) {
      const [legacyRiders, legacyDeliveries] = await Promise.all([
        getDocs(collection(db, 'users', userId, 'riders')),
        getDocs(collection(db, 'users', userId, 'deliveries')),
      ]);
      if (!legacyRiders.empty || !legacyDeliveries.empty) {
        return {
          riderCount: legacyRiders.size,
          deliveryCount: legacyDeliveries.size,
        };
      }
    }

    return {
      riderCount: ridersSnap.size,
      deliveryCount: deliveriesSnap.size,
    };
  } catch (err) {
    console.error(`Error fetching user counts for ${userId}:`, err);
    return { riderCount: 0, deliveryCount: 0 };
  }
}

/**
 * Super Admin: One-time fetch of any user's workspace data (riders, entries, settlements)
 */
export async function fetchUserWorkspaceData(userId: string): Promise<{
  riders: Rider[];
  entries: DeliveryEntry[];
  settlements: SettlementRecord[];
}> {
  if (!userId) {
    return { riders: [], entries: [], settlements: [] };
  }

  try {
    const [ridersSnap, entriesSnap, settlementsSnap] = await Promise.all([
      getDocs(collection(db, 'workspaces', userId, 'riders')),
      getDocs(collection(db, 'workspaces', userId, 'entries')),
      getDocs(collection(db, 'workspaces', userId, 'settlements')),
    ]);

    let riders: Rider[] = [];
    let entries: DeliveryEntry[] = [];
    let settlements: SettlementRecord[] = [];

    ridersSnap.forEach((d) => riders.push(d.data() as Rider));
    entriesSnap.forEach((d) => entries.push(d.data() as DeliveryEntry));
    settlementsSnap.forEach((d) => settlements.push(d.data() as SettlementRecord));

    // Fallback to legacy path if workspace is empty
    if (riders.length === 0 && entries.length === 0) {
      const [legacyRiders, legacyEntries, legacySettlements] = await Promise.all([
        getDocs(collection(db, 'users', userId, 'riders')),
        getDocs(collection(db, 'users', userId, 'deliveries')),
        getDocs(collection(db, 'users', userId, 'settlements')),
      ]);
      legacyRiders.forEach((d) => riders.push(d.data() as Rider));
      legacyEntries.forEach((d) => entries.push(d.data() as DeliveryEntry));
      legacySettlements.forEach((d) => settlements.push(d.data() as SettlementRecord));
    }

    riders.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 99999;
      const orderB = typeof b.order === 'number' ? b.order : 99999;
      if (orderA !== orderB) return orderA - orderB;
      return a.joinedDate < b.joinedDate ? 1 : -1;
    });

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    settlements.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

    return { riders, entries, settlements };
  } catch (err) {
    console.error(`Error in fetchUserWorkspaceData for ${userId}:`, err);
    return { riders: [], entries: [], settlements: [] };
  }
}

/**
 * Guarantee Zero Data Loss: Automatically migrate any legacy or offline data into
 * isolated user workspace (/workspaces/{userId}/*) without wiping existing records.
 * STRICT ISOLATION: Only items belonging to this user are ever copied or written!
 */
export async function ensureWorkspaceMigration(
  userId: string,
  isSuperAdminUser: boolean = false,
  userEmail?: string | null
): Promise<void> {
  if (!userId) return;
  try {
    const workspaceRidersSnap = await getDocs(collection(db, 'workspaces', userId, 'riders'));
    
    // If workspace already has riders, check if there's any local storage data to append
    if (!workspaceRidersSnap.empty) {
      await migrateLocalStorageToFirestore(userId);
      return;
    }

    // Workspace is empty: pull from legacy sources to preserve all historical records
    const legacyRidersSnap = await getDocs(collection(db, 'users', userId, 'riders'));
    const legacyEntriesSnap = await getDocs(collection(db, 'users', userId, 'deliveries'));
    const legacySettlementsSnap = await getDocs(collection(db, 'users', userId, 'settlements'));

    const ridersToCopy: Rider[] = [];
    const entriesToCopy: DeliveryEntry[] = [];
    const settlementsToCopy: SettlementRecord[] = [];

    legacyRidersSnap.forEach((d) => ridersToCopy.push(d.data() as Rider));
    legacyEntriesSnap.forEach((d) => entriesToCopy.push(d.data() as DeliveryEntry));
    legacySettlementsSnap.forEach((d) => settlementsToCopy.push(d.data() as SettlementRecord));

    // If super admin and legacy user subcollections are empty, check root collections
    // BUT strictly only copy items that belong to the super admin, NEVER foreign accounts!
    if (isSuperAdminUser && ridersToCopy.length === 0) {
      const rootRidersSnap = await getDocs(query(collection(db, 'riders'), where('userId', '==', userId)));
      const rootDeliveriesSnap = await getDocs(query(collection(db, 'deliveries'), where('userId', '==', userId)));
      const rootSettlementsSnap = await getDocs(query(collection(db, 'settlements'), where('userId', '==', userId)));

      rootRidersSnap.forEach((d) => {
        const r = d.data() as Rider;
        if (isEntityOwnedByUser(r, userId, userEmail || SUPER_ADMIN_EMAIL)) {
          ridersToCopy.push(r);
        }
      });
      rootDeliveriesSnap.forEach((d) => {
        const e = d.data() as DeliveryEntry;
        if (isEntityOwnedByUser(e, userId, userEmail || SUPER_ADMIN_EMAIL)) {
          entriesToCopy.push(e);
        }
      });
      rootSettlementsSnap.forEach((d) => {
        const s = d.data() as SettlementRecord;
        if (isEntityOwnedByUser(s, userId, userEmail || SUPER_ADMIN_EMAIL)) {
          settlementsToCopy.push(s);
        }
      });
    }

    // Also check local storage for this user or generic legacy
    const rawRiders = localStorage.getItem(`cp_cache_riders_${userId}`) || localStorage.getItem(`courier_riders_u_${userId}`) || localStorage.getItem('courier_riders');
    const rawDeliveries = localStorage.getItem(`cp_cache_deliveries_${userId}`) || localStorage.getItem(`courier_deliveries_u_${userId}`) || localStorage.getItem('courier_deliveries');
    const rawSettlements = localStorage.getItem(`cp_cache_settlements_${userId}`) || localStorage.getItem(`courier_settlements_u_${userId}`) || localStorage.getItem('courier_settlements');

    if (rawRiders) {
      try {
        const parsed: Rider[] = JSON.parse(rawRiders);
        parsed.forEach((r) => {
          if (!ridersToCopy.some((existing) => existing.id === r.id)) {
            ridersToCopy.push(r);
          }
        });
      } catch {}
    }

    if (rawDeliveries) {
      try {
        const parsed: DeliveryEntry[] = JSON.parse(rawDeliveries);
        parsed.forEach((e) => {
          if (!entriesToCopy.some((existing) => existing.id === e.id)) {
            entriesToCopy.push(e);
          }
        });
      } catch {}
    }

    if (rawSettlements) {
      try {
        const parsed: SettlementRecord[] = JSON.parse(rawSettlements);
        parsed.forEach((s) => {
          if (!settlementsToCopy.some((existing) => existing.id === s.id)) {
            settlementsToCopy.push(s);
          }
        });
      } catch {}
    }

    // Filter out ANY entity created by external Gmail accounts or other users
    const effectiveEmail = userEmail || (isSuperAdminUser ? SUPER_ADMIN_EMAIL : undefined);
    const filteredRiders = ridersToCopy.filter((r) => isEntityOwnedByUser(r, userId, effectiveEmail));
    const filteredEntries = entriesToCopy.filter((e) => isEntityOwnedByUser(e, userId, effectiveEmail));
    const filteredSettlements = settlementsToCopy.filter((s) => isEntityOwnedByUser(s, userId, effectiveEmail));

    // Write everything into isolated workspace in chunks of 250
    if (filteredRiders.length > 0 || filteredEntries.length > 0 || filteredSettlements.length > 0) {
      const ops: Array<{ ref: any; data: any }> = [];

      filteredRiders.forEach((r) => {
        ops.push({
          ref: doc(db, 'workspaces', userId, 'riders', r.id),
          data: cleanForFirestore({
            ...r,
            createdBy: r.createdBy || userId,
            createdByEmail: r.createdByEmail || effectiveEmail || '',
            workspaceId: r.workspaceId || userId,
            userId: r.userId || userId,
          }),
        });
      });

      filteredEntries.forEach((e) => {
        ops.push({
          ref: doc(db, 'workspaces', userId, 'entries', e.id),
          data: cleanForFirestore({
            ...e,
            createdBy: e.createdBy || userId,
            createdByEmail: e.createdByEmail || effectiveEmail || '',
            workspaceId: e.workspaceId || userId,
            userId: e.userId || userId,
          }),
        });
      });

      filteredSettlements.forEach((s) => {
        ops.push({
          ref: doc(db, 'workspaces', userId, 'settlements', s.id),
          data: cleanForFirestore({
            ...s,
            createdBy: s.createdBy || userId,
            createdByEmail: s.createdByEmail || effectiveEmail || '',
            workspaceId: s.workspaceId || userId,
            userId: s.userId || userId,
          }),
        });
      });

      const BATCH_SIZE = 250;
      for (let i = 0; i < ops.length; i += BATCH_SIZE) {
        const chunk = ops.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((op) => batch.set(op.ref, op.data, { merge: true }));
        await batch.commit();
      }

      // Update summary stats in user document
      try {
        const userDocRef = doc(db, 'all_users', userId);
        await updateDoc(userDocRef, {
          totalRiders: filteredRiders.length,
          totalEntries: filteredEntries.length,
          updatedAt: serverTimestamp(),
        });
      } catch {}
    }
  } catch (err) {
    console.error('Error in ensureWorkspaceMigration:', err);
  }
}

/**
 * Real-time listeners for all courier data.
 * STRICT MULTI-TENANT ISOLATION:
 * Listens ONLY to the authenticated user's workspace (/workspaces/{userId}/*).
 * Normal users NEVER see or receive other users' riders or entries!
 * Immediately purges any records created by other external accounts.
 */
interface DeletedTombstones {
  entryIds: string[];
  riderIds: string[];
  advanceIds: string[];
}

function getTombstonesStorageKey(userId: string): string {
  return `cp_deleted_tombstones_${userId || 'guest'}`;
}

export function getLocalDeletedTombstones(userId: string): DeletedTombstones {
  try {
    const raw = localStorage.getItem(getTombstonesStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        entryIds: Array.isArray(parsed?.entryIds) ? parsed.entryIds : [],
        riderIds: Array.isArray(parsed?.riderIds) ? parsed.riderIds : [],
        advanceIds: Array.isArray(parsed?.advanceIds) ? parsed.advanceIds : [],
      };
    }
  } catch {}
  return { entryIds: [], riderIds: [], advanceIds: [] };
}

function mergeLocalDeletedTombstones(
  userId: string,
  additions: Partial<DeletedTombstones>
): DeletedTombstones {
  const cur = getLocalDeletedTombstones(userId);
  const merged: DeletedTombstones = {
    entryIds: Array.from(new Set([...cur.entryIds, ...(additions.entryIds || [])])).slice(-2500),
    riderIds: Array.from(new Set([...cur.riderIds, ...(additions.riderIds || [])])).slice(-1000),
    advanceIds: Array.from(new Set([...cur.advanceIds, ...(additions.advanceIds || [])])).slice(-2500),
  };
  try {
    localStorage.setItem(getTombstonesStorageKey(userId), JSON.stringify(merged));
  } catch {}
  return merged;
}

function scrubTombstonesFromLocalCache(userId: string, tombstones: DeletedTombstones): void {
  if (!userId) return;
  const entrySet = new Set(tombstones.entryIds);
  const riderSet = new Set(tombstones.riderIds);
  const advSet = new Set(tombstones.advanceIds);

  if (entrySet.size > 0) {
    const entryKeys = [
      `cp_cache_deliveries_${userId}`,
      `courier_deliveries_u_${userId}`,
      'courier_deliveries',
    ];
    entryKeys.forEach((k) => {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        const filtered = arr.filter((item: any) => item && !entrySet.has(item.id));
        if (filtered.length !== arr.length) {
          localStorage.setItem(k, JSON.stringify(filtered));
        }
      } catch {}
    });
  }

  if (riderSet.size > 0 || advSet.size > 0) {
    const riderKeys = [
      `cp_cache_riders_${userId}`,
      `courier_riders_u_${userId}`,
      'courier_riders',
    ];
    riderKeys.forEach((k) => {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        let changed = false;
        const filtered = arr
          .filter((r: any) => {
            if (!r) return false;
            if (riderSet.has(r.id)) {
              changed = true;
              return false;
            }
            return true;
          })
          .map((r: any) => {
            if (advSet.size > 0 && Array.isArray(r.advances)) {
              const keptAdvs = r.advances.filter((a: any) => {
                if (!a) return false;
                const cleanA = String(a.id || '').replace(/^adv-/, '');
                if (advSet.has(a.id) || advSet.has(cleanA)) {
                  changed = true;
                  return false;
                }
                return true;
              });
              if (keptAdvs.length !== r.advances.length) {
                return { ...r, advances: keptAdvs };
              }
            }
            return r;
          });
        if (changed) {
          localStorage.setItem(k, JSON.stringify(filtered));
        }
      } catch {}
    });
  }
}

async function fetchMergedDeletedTombstones(userId: string): Promise<DeletedTombstones> {
  const local = getLocalDeletedTombstones(userId);
  if (!userId || userId === 'guest') return local;
  try {
    const snap = await getDoc(doc(db, 'workspaces', userId, 'metadata', 'deleted_tombstones'));
    if (snap.exists()) {
      const data = snap.data() || {};
      return mergeLocalDeletedTombstones(userId, {
        entryIds: Array.isArray(data.entryIds) ? data.entryIds : [],
        riderIds: Array.isArray(data.riderIds) ? data.riderIds : [],
        advanceIds: Array.isArray(data.advanceIds) ? data.advanceIds : [],
      });
    }
  } catch (err) {
    console.warn('Notice reading deleted tombstones:', err);
  }
  return local;
}

async function recordDeletedTombstones(
  userId: string,
  additions: Partial<DeletedTombstones>
): Promise<void> {
  const merged = mergeLocalDeletedTombstones(userId, additions);
  scrubTombstonesFromLocalCache(userId, merged);
  if (!userId || userId === 'guest') return;

  const docRef = doc(db, 'workspaces', userId, 'metadata', 'deleted_tombstones');
  const payload: any = { updatedAt: new Date().toISOString() };
  if (additions.entryIds && additions.entryIds.length > 0) {
    payload.entryIds = arrayUnion(...additions.entryIds);
  }
  if (additions.riderIds && additions.riderIds.length > 0) {
    payload.riderIds = arrayUnion(...additions.riderIds);
  }
  if (additions.advanceIds && additions.advanceIds.length > 0) {
    payload.advanceIds = arrayUnion(...additions.advanceIds);
  }
  await setDoc(docRef, payload, { merge: true });
}

export function subscribeToUserData(
  userId: string,
  callbacks: {
    onRiders: (riders: Rider[]) => void;
    onDeliveries: (deliveries: DeliveryEntry[]) => void;
    onSettlements: (settlements: SettlementRecord[]) => void;
    onError?: (error: Error) => void;
  },
  userEmail?: string | null
): () => void {
  if (!userId) {
    callbacks.onRiders([]);
    callbacks.onDeliveries([]);
    callbacks.onSettlements([]);
    return () => {};
  }

  const effectiveEmail = userEmail || (isSuperAdmin(userId) ? SUPER_ADMIN_EMAIL : undefined);
  const ridersMap = new Map<string, Rider>();
  const deliveriesMap = new Map<string, DeliveryEntry>();
  const settlementsMap = new Map<string, SettlementRecord>();
  const advancesMap = new Map<string, RiderAdvanceEntry>();
  const incentivesMap = new Map<string, RiderIncentiveEntry>();
  const initialTombstones = getLocalDeletedTombstones(userId);
  const tombstonedEntries = new Set<string>(initialTombstones.entryIds);
  const tombstonedRiders = new Set<string>(initialTombstones.riderIds);
  const tombstonedAdvances = new Set<string>(initialTombstones.advanceIds);

  const notifyRiders = () => {
    // Strictly isolate: only include riders created by or belonging to this user's workspace
    const rawList = Array.from(ridersMap.values()).filter(
      (r) => !tombstonedRiders.has(r.id) && isEntityOwnedByUser(r, userId, effectiveEmail)
    );
    const allWorkspaceAdvances = Array.from(advancesMap.values()).filter((a) => {
      const cleanId = String(a.id || '').replace(/^adv-/, '');
      return !tombstonedAdvances.has(a.id) && !tombstonedAdvances.has(cleanId);
    });
    const allWorkspaceIncentives = Array.from(incentivesMap.values());
    let settlementsList = Array.from(settlementsMap.values());
    if (settlementsList.length === 0) {
      const cachedSettlements = loadSettlementsFromStorage(userId);
      if (Array.isArray(cachedSettlements) && cachedSettlements.length > 0) {
        settlementsList = cachedSettlements;
      }
    }

    const list = rawList.map((r) => {
      const cleanRiderPhone = String(r.phone || '').replace(/\D/g, '').slice(-10);

      // Merge advances from rider doc and authoritative workspace advances collection
      const advByKey = new Map<string, RiderAdvanceEntry>();
      (r.advances || []).forEach((a) => {
        if (!a) return;
        const cleanId = String(a.id || '').replace(/^adv-/, '');
        if (tombstonedAdvances.has(a.id) || tombstonedAdvances.has(cleanId)) return;
        const key = a.id || `${a.date}_${a.amount}_${a.reason}`;
        advByKey.set(key, a);
      });
      allWorkspaceAdvances.forEach((adv) => {
        if (!adv) return;
        const matchesId = String(adv.riderId || '').trim() === String(r.id).trim();
        const cleanAdvPhone = String((adv as any).riderPhone || '').replace(/\D/g, '').slice(-10);
        const matchesPhone = Boolean(cleanAdvPhone && cleanRiderPhone && cleanAdvPhone === cleanRiderPhone);
        if (matchesId || matchesPhone) {
          const key = adv.id || `${adv.date}_${adv.amount}_${adv.reason}`;
          const prev = advByKey.get(key);
          // Workspace subcollection soft-delete or latest edit overrides embedded rider snapshot
          advByKey.set(key, prev ? { ...prev, ...adv } : adv);
        }
      });
      const dedupedAdvances = Array.from(advByKey.values());

      // Merge incentives from rider doc and authoritative workspace incentives collection
      const incByKey = new Map<string, RiderIncentiveEntry>();
      (r.incentives || []).forEach((inc) => {
        if (!inc) return;
        const key = inc.id || `${inc.date}_${inc.amount}_${inc.reason}`;
        incByKey.set(key, inc);
      });
      allWorkspaceIncentives.forEach((inc) => {
        if (!inc) return;
        const matchesId = String(inc.riderId || '').trim() === String(r.id).trim();
        const cleanIncPhone = String((inc as any).riderPhone || '').replace(/\D/g, '').slice(-10);
        const matchesPhone = Boolean(cleanIncPhone && cleanRiderPhone && cleanIncPhone === cleanRiderPhone);
        if (matchesId || matchesPhone) {
          const key = inc.id || `${inc.date}_${inc.amount}_${inc.reason}`;
          const prev = incByKey.get(key);
          incByKey.set(key, prev ? { ...prev, ...inc } : inc);
        }
      });
      const dedupedIncentives = Array.from(incByKey.values());

      const totalAdv = calculateActiveAdvanceTotal(dedupedAdvances, settlementsList, r.id);
      const totalInc = calculateActiveIncentiveTotal(dedupedIncentives, settlementsList, r.id);
      const netAdv = Math.max(0, totalAdv - totalInc);
      const netInc = Math.max(0, totalInc - totalAdv);
      return {
        ...r,
        advances: dedupedAdvances,
        incentives: dedupedIncentives,
        totalAdvance: netAdv,
        totalIncentive: netInc,
      };
    });

    list.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 99999;
      const orderB = typeof b.order === 'number' ? b.order : 99999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.joinedDate < b.joinedDate ? 1 : -1);
    });
    setCachedAuthUserId(userId);
    saveRidersToStorage(list, userId);
    callbacks.onRiders(list);
  };

  const notifyDeliveries = () => {
    const allowedRiderIds = new Set(
      Array.from(ridersMap.values())
        .filter((r) => !tombstonedRiders.has(r.id))
        .map((r) => r.id)
    );
    const list = Array.from(deliveriesMap.values()).filter((d) => {
      if (tombstonedEntries.has(d.id)) return false;
      if (!isEntityOwnedByUser(d, userId, effectiveEmail)) return false;
      // Never hide soft-deleted Trash Bin entries or entries arriving before ridersMap hydrates
      if (d.isDeleted) return true;
      if (allowedRiderIds.size > 0 && d.riderId && !allowedRiderIds.has(d.riderId)) return false;
      return true;
    });
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setCachedAuthUserId(userId);
    saveDeliveriesToStorage(list, userId);
    callbacks.onDeliveries(list);
  };

  const notifySettlements = () => {
    const allowedRiderIds = new Set(Array.from(ridersMap.values()).map((r) => r.id));
    const list = Array.from(settlementsMap.values()).filter((s) => {
      if (!isEntityOwnedByUser(s, userId, effectiveEmail)) return false;
      if (s.isDeleted) return true;
      if (allowedRiderIds.size > 0 && s.riderId && !allowedRiderIds.has(s.riderId)) return false;
      return true;
    });
    list.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
    setCachedAuthUserId(userId);
    saveSettlementsToStorage(list, userId);
    callbacks.onSettlements(list);
  };

  // Run migration in background to ensure zero data loss
  ensureWorkspaceMigration(userId, isSuperAdmin(effectiveEmail || userId), effectiveEmail).catch((err) => {
    console.warn('Workspace background migration note:', err);
  });

  const workspaceRidersRef = collection(db, 'workspaces', userId, 'riders');
  const workspaceEntriesRef = collection(db, 'workspaces', userId, 'entries');
  const workspaceSettlementsRef = collection(db, 'workspaces', userId, 'settlements');
  const workspaceAdvancesRef = collection(db, 'workspaces', userId, 'advances');
  const workspaceIncentivesRef = collection(db, 'workspaces', userId, 'incentives');

  const unsubRiders = onSnapshot(
    workspaceRidersRef,
    (snapshot) => {
      ridersMap.clear();
      snapshot.forEach((docSnap) => {
        const r = docSnap.data() as Rider;
        if (!isEntityOwnedByUser(r, userId, effectiveEmail)) {
          return;
        }
        ridersMap.set(docSnap.id, r);
      });
      notifyRiders();
      if (deliveriesMap.size > 0) notifyDeliveries();
      if (settlementsMap.size > 0) notifySettlements();
    },
    (error) => {
      console.warn('Warning listening to workspace riders collection:', error);
      callbacks.onError?.(error);
    }
  );

  const unsubAdvances = onSnapshot(
    workspaceAdvancesRef,
    (snapshot) => {
      advancesMap.clear();
      snapshot.forEach((docSnap) => {
        const adv = docSnap.data() as RiderAdvanceEntry;
        advancesMap.set(docSnap.id, adv);
      });
      notifyRiders();
    },
    (error) => {
      console.warn('Warning listening to workspace advances collection:', error);
    }
  );

  const unsubIncentives = onSnapshot(
    workspaceIncentivesRef,
    (snapshot) => {
      incentivesMap.clear();
      snapshot.forEach((docSnap) => {
        const inc = docSnap.data() as RiderIncentiveEntry;
        incentivesMap.set(docSnap.id, inc);
      });
      notifyRiders();
    },
    (error) => {
      console.warn('Warning listening to workspace incentives collection:', error);
    }
  );

  const unsubEntries = onSnapshot(
    workspaceEntriesRef,
    (snapshot) => {
      deliveriesMap.clear();
      snapshot.forEach((docSnap) => {
        const e = docSnap.data() as DeliveryEntry;
        if (!isEntityOwnedByUser(e, userId, effectiveEmail)) {
          return;
        }
        deliveriesMap.set(docSnap.id, e);
      });
      notifyDeliveries();
    },
    (error) => {
      console.warn('Warning listening to workspace entries collection:', error);
      callbacks.onError?.(error);
    }
  );

  const unsubSettlements = onSnapshot(
    workspaceSettlementsRef,
    (snapshot) => {
      settlementsMap.clear();
      snapshot.forEach((docSnap) => {
        const s = docSnap.data() as SettlementRecord;
        if (!isEntityOwnedByUser(s, userId, effectiveEmail)) {
          return;
        }
        settlementsMap.set(docSnap.id, s);
      });
      notifySettlements();
      notifyRiders();
    },
    (error) => {
      console.warn('Warning listening to workspace settlements collection:', error);
      callbacks.onError?.(error);
    }
  );

  const tombstonesDocRef = doc(db, 'workspaces', userId, 'metadata', 'deleted_tombstones');
  const unsubTombstones = onSnapshot(
    tombstonesDocRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() || {};
      const entryIds = Array.isArray(data.entryIds) ? data.entryIds : [];
      const riderIds = Array.isArray(data.riderIds) ? data.riderIds : [];
      const advanceIds = Array.isArray(data.advanceIds) ? data.advanceIds : [];
      let changed = false;
      entryIds.forEach((id: string) => {
        if (id && !tombstonedEntries.has(id)) {
          tombstonedEntries.add(id);
          deliveriesMap.delete(id);
          changed = true;
        }
      });
      riderIds.forEach((id: string) => {
        if (id && !tombstonedRiders.has(id)) {
          tombstonedRiders.add(id);
          ridersMap.delete(id);
          changed = true;
        }
      });
      advanceIds.forEach((id: string) => {
        if (id && !tombstonedAdvances.has(id)) {
          tombstonedAdvances.add(id);
          advancesMap.delete(id);
          changed = true;
        }
      });
      if (changed) {
        const syncedTombstones = mergeLocalDeletedTombstones(userId, { entryIds, riderIds, advanceIds });
        scrubTombstonesFromLocalCache(userId, syncedTombstones);
        notifyRiders();
        notifyDeliveries();
      }
    },
    () => {}
  );

  return () => {
    unsubRiders();
    unsubAdvances();
    unsubIncentives();
    unsubEntries();
    unsubSettlements();
    unsubTombstones();
  };
}

/**
 * Super Admin: Real-time listener for any inspected user's workspace
 */
export function subscribeToUserWorkspace(
  userId: string,
  callbacks: {
    onRiders: (riders: Rider[]) => void;
    onDeliveries: (deliveries: DeliveryEntry[]) => void;
    onSettlements: (settlements: SettlementRecord[]) => void;
    onError?: (error: Error) => void;
  }
): () => void {
  return subscribeToUserData(userId, callbacks);
}

/**
 * Super Admin: Update a rider in any user workspace
 */
export async function updateWorkspaceRider(userId: string, rider: Rider): Promise<void> {
  const ref = doc(db, 'workspaces', userId, 'riders', rider.id);
  await setDoc(ref, rider, { merge: true });
}

/**
 * Super Admin: Delete a rider from any user workspace
 */
export async function deleteWorkspaceRider(userId: string, riderId: string): Promise<void> {
  const ref = doc(db, 'workspaces', userId, 'riders', riderId);
  await deleteDoc(ref);
}

export interface MigrationResult {
  migratedDeliveries: number;
  migratedRiders: number;
  migratedSettlements: number;
  totalSynced: number;
}

/**
 * Automatically migrate all existing offline data from localStorage into Firebase Firestore
 * as soon as the user logs in. If an entry or rider already exists in Firestore, it is preserved/merged.
 * This guarantees zero data loss when switching to cloud auth.
 */
export async function migrateLocalStorageToFirestore(userId: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    migratedDeliveries: 0,
    migratedRiders: 0,
    migratedSettlements: 0,
    totalSynced: 0,
  };

  try {
    const rawRiders = localStorage.getItem(`cp_cache_riders_${userId}`) || localStorage.getItem(`courier_riders_u_${userId}`) || localStorage.getItem('courier_riders');
    const rawDeliveries = localStorage.getItem(`cp_cache_deliveries_${userId}`) || localStorage.getItem(`courier_deliveries_u_${userId}`) || localStorage.getItem('courier_deliveries');
    const rawSettlements = localStorage.getItem(`cp_cache_settlements_${userId}`) || localStorage.getItem(`courier_settlements_u_${userId}`) || localStorage.getItem('courier_settlements');

    const localRiders: Rider[] = rawRiders ? JSON.parse(rawRiders) : [];
    const localDeliveries: DeliveryEntry[] = rawDeliveries ? JSON.parse(rawDeliveries) : [];
    const localSettlements: SettlementRecord[] = rawSettlements ? JSON.parse(rawSettlements) : [];

    if (!localRiders.length && !localDeliveries.length && !localSettlements.length) {
      return result;
    }

    const tombstones = await fetchMergedDeletedTombstones(userId);
    scrubTombstonesFromLocalCache(userId, tombstones);
    const deadRiderIds = new Set(tombstones.riderIds);
    const deadEntryIds = new Set(tombstones.entryIds);

    const [ridersSnap, deliveriesSnap, settlementsSnap] = await Promise.all([
      getDocs(collection(db, 'workspaces', userId, 'riders')),
      getDocs(collection(db, 'workspaces', userId, 'entries')),
      getDocs(collection(db, 'workspaces', userId, 'settlements')),
    ]);

    const existingRiderIds = new Set(ridersSnap.docs.map((d) => d.id));
    const existingDeliveryIds = new Set(deliveriesSnap.docs.map((d) => d.id));
    const existingSettlementIds = new Set(settlementsSnap.docs.map((d) => d.id));

    const ops: Array<{ ref: any; data: any }> = [];

    localRiders.forEach((rider, idx) => {
      if (!rider || !rider.id) return;
      // Never resurrect permanently deleted riders or stale trashed snapshots missing from cloud
      if (deadRiderIds.has(rider.id) || rider.isDeleted) return;
      if (!existingRiderIds.has(rider.id)) {
        const riderWithOrder: Rider = {
          ...rider,
          order: typeof rider.order === 'number' ? rider.order : idx,
        };
        ops.push({
          ref: doc(db, 'workspaces', userId, 'riders', rider.id),
          data: riderWithOrder,
        });
        result.migratedRiders++;
      }
    });

    localDeliveries.forEach((entry) => {
      if (!entry || !entry.id) return;
      // Never resurrect permanently deleted entries or stale trashed entries missing from cloud
      if (deadEntryIds.has(entry.id) || entry.isDeleted) return;
      if (!existingDeliveryIds.has(entry.id)) {
        ops.push({
          ref: doc(db, 'workspaces', userId, 'entries', entry.id),
          data: entry,
        });
        result.migratedDeliveries++;
      }
    });

    localSettlements.forEach((settlement) => {
      if (!settlement || !settlement.id) return;
      if (!existingSettlementIds.has(settlement.id)) {
        ops.push({
          ref: doc(db, 'workspaces', userId, 'settlements', settlement.id),
          data: settlement,
        });
        result.migratedSettlements++;
      }
    });

    result.totalSynced = ops.length;

    if (ops.length > 0) {
      const CHUNK_SIZE = 250;
      for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
        const chunk = ops.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((op) => {
          batch.set(op.ref, op.data, { merge: true });
        });
        await batch.commit();
      }
    }

    return result;
  } catch (error) {
    console.error('Error during localStorage migration to Firestore:', error);
    return result;
  }
}

/**
 * Save / Update Rider in isolated user workspace (/workspaces/{userId}/riders)
 */
export async function saveRiderToFirestore(
  userId: string,
  rider: Rider,
  userEmail?: string | null
): Promise<void> {
  if (!userId) return;
  const workspaceRef = doc(db, 'workspaces', userId, 'riders', rider.id);
  const riderWithOwnership = cleanForFirestore({
    ...rider,
    createdBy: rider.createdBy || userId,
    createdByEmail: rider.createdByEmail || userEmail || '',
    workspaceId: rider.workspaceId || userId,
    userId: rider.userId || userId,
  });
  await setDoc(workspaceRef, riderWithOwnership, { merge: true });

  // Dual-write to root /riders/{rider.id} so public statement can directly read it
  try {
    const rootRef = doc(db, 'riders', rider.id);
    await setDoc(rootRef, riderWithOwnership, { merge: true });
  } catch (err) {
    console.warn('Root /riders write notice:', err);
  }
}

/**
 * Soft-Delete Rider from user workspace (Zero Data Loss - Never hard deletes)
 */
export async function deleteRiderFromFirestore(userId: string, riderId: string): Promise<void> {
  if (!userId || !riderId) return;
  const softDeletePayload = {
    isDeleted: true,
    deletedAt: new Date().toISOString(),
    active: false,
    status: 'inactive' as const,
  };
  try {
    const workspaceRef = doc(db, 'workspaces', userId, 'riders', riderId);
    await setDoc(workspaceRef, softDeletePayload, { merge: true });
  } catch (err) {
    console.warn('Workspace rider soft-delete notice:', err);
  }
  try {
    const rootRef = doc(db, 'riders', riderId);
    await setDoc(rootRef, softDeletePayload, { merge: true });
  } catch (err) {
    console.warn('Root rider soft-delete notice:', err);
  }
}

/**
 * Restore soft-deleted Rider back to active list
 */
export async function restoreRiderInFirestore(userId: string, riderId: string): Promise<void> {
  if (!userId || !riderId) return;
  const restorePayload = {
    isDeleted: false,
    deletedAt: null,
    active: true,
    status: 'active' as const,
  };
  try {
    const workspaceRef = doc(db, 'workspaces', userId, 'riders', riderId);
    await setDoc(workspaceRef, restorePayload, { merge: true });
  } catch (err) {
    console.warn('Workspace rider restore notice:', err);
  }
  try {
    const rootRef = doc(db, 'riders', riderId);
    await setDoc(rootRef, restorePayload, { merge: true });
  } catch (err) {
    console.warn('Root rider restore notice:', err);
  }
}

/**
 * Batch update custom ordering for riders in isolated user workspace
 */
export async function updateRidersOrderInFirestore(
  userId: string,
  orderedRiders: Rider[]
): Promise<void> {
  if (!userId) return;
  const batch = writeBatch(db);
  orderedRiders.forEach((rider, index) => {
    const workspaceRef = doc(db, 'workspaces', userId, 'riders', rider.id);
    batch.set(workspaceRef, { order: index }, { merge: true });
  });
  await batch.commit();
}

/**
 * Save / Update Delivery Entry in isolated user workspace (/workspaces/{userId}/entries)
 */
export async function saveDeliveryToFirestore(
  userId: string,
  entry: DeliveryEntry,
  userEmail?: string | null
): Promise<void> {
  if (!userId) return;
  const workspaceRef = doc(db, 'workspaces', userId, 'entries', entry.id);
  const entryWithOwnership = cleanForFirestore({
    ...entry,
    createdBy: entry.createdBy || userId,
    createdByEmail: entry.createdByEmail || userEmail || '',
    workspaceId: entry.workspaceId || userId,
    userId: entry.userId || userId,
  });
  await setDoc(workspaceRef, entryWithOwnership);

  // Dual-write to root /deliveries/{entry.id}
  try {
    const rootRef = doc(db, 'deliveries', entry.id);
    await setDoc(rootRef, entryWithOwnership, { merge: true });
  } catch (err) {
    console.warn('Root /deliveries write notice:', err);
  }
}

/**
 * Soft-Delete Delivery Entry from user workspace (Zero Data Loss - Never hard deletes)
 */
export async function deleteDeliveryFromFirestore(
  userId: string,
  entryId: string
): Promise<void> {
  if (!userId || !entryId) return;
  const softDeletePayload = {
    isDeleted: true,
    deletedAt: new Date().toISOString(),
  };
  try {
    const workspaceRef = doc(db, 'workspaces', userId, 'entries', entryId);
    await setDoc(workspaceRef, softDeletePayload, { merge: true });
  } catch (err) {
    console.warn('Workspace delivery soft-delete notice:', err);
  }
  try {
    const rootRef = doc(db, 'deliveries', entryId);
    await setDoc(rootRef, softDeletePayload, { merge: true });
  } catch (err) {
    console.warn('Root delivery soft-delete notice:', err);
  }
}

/**
 * Restore soft-deleted Delivery Entry back to active entries list
 */
export async function restoreDeliveryInFirestore(
  userId: string,
  entryId: string
): Promise<void> {
  if (!userId || !entryId) return;
  const restorePayload = {
    isDeleted: false,
    deletedAt: null,
  };
  try {
    const workspaceRef = doc(db, 'workspaces', userId, 'entries', entryId);
    await setDoc(workspaceRef, restorePayload, { merge: true });
  } catch (err) {
    console.warn('Workspace delivery restore notice:', err);
  }
  try {
    const rootRef = doc(db, 'deliveries', entryId);
    await setDoc(rootRef, restorePayload, { merge: true });
  } catch (err) {
    console.warn('Root delivery restore notice:', err);
  }
}

/**
 * Batch update multiple delivery entries (e.g. marking as paid) and optionally add settlement record
 * in isolated user workspace
 */
export async function batchUpdateDeliveriesAndSettlement(
  userId: string,
  entries: DeliveryEntry[],
  settlement?: SettlementRecord,
  userEmail?: string | null
): Promise<void> {
  if (!userId) return;
  const batch = writeBatch(db);

  entries.forEach((entry) => {
    const workspaceRef = doc(db, 'workspaces', userId, 'entries', entry.id);
    const cleanedEntry = cleanForFirestore({
      ...entry,
      createdBy: entry.createdBy || userId,
      createdByEmail: entry.createdByEmail || userEmail || '',
      workspaceId: entry.workspaceId || userId,
      userId: entry.userId || userId,
    });
    batch.set(workspaceRef, cleanedEntry);
  });

  if (settlement) {
    const workspaceSettleRef = doc(db, 'workspaces', userId, 'settlements', settlement.id);
    const cleanedSettlement = cleanForFirestore({
      ...settlement,
      createdBy: settlement.createdBy || userId,
      createdByEmail: settlement.createdByEmail || userEmail || '',
      workspaceId: settlement.workspaceId || userId,
      userId: settlement.userId || userId,
    });
    batch.set(workspaceSettleRef, cleanedSettlement);
  }

  await batch.commit();
}

/**
 * Restores and imports full backup (riders, deliveries, settlements) into isolated user workspace
 */
export async function batchImportBackupToFirestore(
  userId: string,
  riders: Rider[],
  entries: DeliveryEntry[],
  settlements: SettlementRecord[] = [],
  settings?: any,
  userEmail?: string | null
): Promise<{ ridersCount: number; entriesCount: number; settlementsCount: number }> {
  if (!userId) return { ridersCount: 0, entriesCount: 0, settlementsCount: 0 };
  const operations: Array<{ ref: any; data: any }> = [];

  riders.forEach((rider) => {
    const riderWithOwnership = cleanForFirestore({
      ...rider,
      createdBy: userId,
      createdByEmail: userEmail || '',
      workspaceId: userId,
      userId: userId,
    });
    operations.push({ ref: doc(db, 'workspaces', userId, 'riders', rider.id), data: riderWithOwnership });
  });

  entries.forEach((entry) => {
    const entryWithOwnership = cleanForFirestore({
      ...entry,
      createdBy: userId,
      createdByEmail: userEmail || '',
      workspaceId: userId,
      userId: userId,
    });
    operations.push({ ref: doc(db, 'workspaces', userId, 'entries', entry.id), data: entryWithOwnership });
  });

  settlements.forEach((settlement) => {
    const settlementWithOwnership = cleanForFirestore({
      ...settlement,
      createdBy: userId,
      createdByEmail: userEmail || '',
      workspaceId: userId,
      userId: userId,
    });
    operations.push({ ref: doc(db, 'workspaces', userId, 'settlements', settlement.id), data: settlementWithOwnership });
  });

  const BATCH_SIZE = 250;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const chunk = operations.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((op) => {
      batch.set(op.ref, op.data, { merge: true });
    });
    await batch.commit();
  }

  try {
    const userDocRef = doc(db, 'all_users', userId);
    const updatePayload: Record<string, any> = {
      totalRiders: riders.length,
      totalEntries: entries.length,
      updatedAt: serverTimestamp(),
    };
    if (settings && typeof settings === 'object') {
      updatePayload.rateConfig = settings;
    }
    await updateDoc(userDocRef, updatePayload);
  } catch (err) {
    console.warn('Could not update user summary stats after restore:', err);
  }

  return {
    ridersCount: riders.length,
    entriesCount: entries.length,
    settlementsCount: settlements.length,
  };
}

/**
 * Sync public read-only statement to Firestore collection (/public_statements/{riderId})
 * Accessible to riders without requiring authentication.
 */
export async function syncPublicRiderStatement(
  rider: Rider,
  advances: RiderAdvanceEntry[] = [],
  settlements: SettlementRecord[] = [],
  deliveries: DeliveryEntry[] = [],
  hubName?: string,
  hubSignature?: string
): Promise<void> {
  if (!rider?.id) return;
  try {
    const docRef = doc(db, 'public_statements', rider.id);
    const isNotDeleted = (item: any) =>
      Boolean(item) &&
      item.isDeleted !== true &&
      item.status !== 'DELETED' &&
      item.status !== 'RESET_ARCHIVED';

    // Read existing doc once when either settlements or deliveries are omitted/empty so we NEVER wipe them
    let existingDocData: PublicRiderStatement | null = null;
    if (!settlements || settlements.length === 0 || !deliveries || deliveries.length === 0) {
      try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          existingDocData = snap.data() as PublicRiderStatement;
        }
      } catch (e) {
        console.warn('Could not read existing public_statements doc:', e);
      }
    }

    // Purge phantom & soft-deleted advances
    const rawAdvances = (advances.length > 0 ? advances : (rider.advances || [])).filter(isNotDeleted);
    const cleanAdvances = purgePhantomAdvances(rawAdvances);

    // If settlements parameter is not passed or empty, NEVER wipe out authentic settlements!
    let riderSettlements: any[] = [];
    if (settlements && settlements.length > 0) {
      riderSettlements = settlements
        .filter((s) => !s.isDeleted && (s.riderId === rider.id || (rider.phone && (s as any).riderPhone === rider.phone)))
        .sort((a, b) => new Date(b.paidAt || b.startDate).getTime() - new Date(a.paidAt || a.startDate).getTime())
        .map((s) => ({
          id: s.id,
          startDate: s.startDate,
          endDate: s.endDate,
          totalParcels: Number(s.totalParcels) || 0,
          baseAmount: Number(s.baseAmount) || 0,
          incentiveAmount: Number(s.incentiveAmount) || 0,
          grossTotal: Number(s.grossTotal) || 0,
          advanceAmount: Number(s.advanceAmount) || 0,
          advanceDate: s.advanceDate || s.paidAt?.split('T')[0] || s.startDate,
          advanceReason: s.advanceReason || `एडवांस राशि (पे-आउट सेटलमेंट ${s.startDate} से ${s.endDate})`,
          netTotal: Number(s.netTotal) || 0,
          paidAt: s.paidAt || s.endDate,
          status: s.status || 'PAID',
          settledAdvanceIds: s.settledAdvanceIds,
          settledIncentiveIds: s.settledIncentiveIds,
        }));
    } else {
      if (existingDocData && Array.isArray(existingDocData.salaries) && existingDocData.salaries.length > 0) {
        riderSettlements = existingDocData.salaries;
      }

      // If still empty, query collectionGroup('settlements') to find all authentic settlements for this rider
      if (riderSettlements.length === 0) {
        try {
          const qSettle = query(collectionGroup(db, 'settlements'), where('riderId', '==', rider.id));
          const snapSettle = await getDocs(qSettle);
          if (!snapSettle.empty) {
            riderSettlements = snapSettle.docs
              .map((d) => d.data() as SettlementRecord)
              .filter((s) => !s.isDeleted)
              .map((s) => ({
                id: s.id,
                startDate: s.startDate,
                endDate: s.endDate,
                totalParcels: Number(s.totalParcels) || 0,
                baseAmount: Number(s.baseAmount) || 0,
                incentiveAmount: Number(s.incentiveAmount) || 0,
                grossTotal: Number(s.grossTotal) || 0,
                advanceAmount: Number(s.advanceAmount) || 0,
                advanceDate: s.advanceDate || s.paidAt?.split('T')[0] || s.startDate,
                advanceReason: s.advanceReason || `एडवांस राशि (पे-आउट सेटलमेंट ${s.startDate} से ${s.endDate})`,
                netTotal: Number(s.netTotal) || 0,
                paidAt: s.paidAt || s.endDate,
                status: s.status || 'PAID',
                settledAdvanceIds: s.settledAdvanceIds,
                settledIncentiveIds: s.settledIncentiveIds,
              }));
          }
        } catch (e) {
          console.warn('collectionGroup settlements lookup notice:', e);
        }
      }
    }

    // Dynamically pull authentic advances directly from settlements into advances
    riderSettlements.forEach((s) => {
      if (s.advanceAmount > 0) {
        const hasMatch = cleanAdvances.some(
          (a) =>
            a.id === `settlement_adv_${s.id}` ||
            a.id === s.id ||
            a.settlementId === s.id ||
            a.settledPayoutId === s.id ||
            ((s as any).settledAdvanceIds && (s as any).settledAdvanceIds.includes(a.id)) ||
            (!a.settlementId && !a.settledPayoutId && Math.abs(Number(a.amount) - s.advanceAmount) < 0.01)
        );
        if (!hasMatch) {
          cleanAdvances.push({
            id: `settlement_adv_${s.id}`,
            riderId: rider.id,
            amount: s.advanceAmount,
            date: s.advanceDate || s.paidAt?.split('T')[0] || s.startDate,
            createdAt: s.advanceDate || s.paidAt || s.startDate,
            reason: s.advanceReason || `एडवांस राशि (पे-आउट सेटलमेंट ${s.startDate} से ${s.endDate})`,
            isSettled: true,
            isDeducted: true,
            status: 'PAID',
          });
        }
      }
    });

    const sortedAdvances = [...cleanAdvances].sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.date ? new Date(b.date).getTime() : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });

    // Deliveries: keep all unpaid deliveries plus recent paid ones; NEVER wipe existing recentDeliveries if omitted
    let recentDeliveries: any[] = [];
    if (deliveries && deliveries.length > 0) {
      const riderDeliveries = deliveries.filter((d) => d && !d.isDeleted && d.riderId === rider.id);
      const unpaidDeliveries = riderDeliveries.filter((d) => d.status === 'Unpaid');
      const paidDeliveries = riderDeliveries
        .filter((d) => d.status === 'Paid')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 100);
      recentDeliveries = [...unpaidDeliveries, ...paidDeliveries]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((d) => ({
          id: d.id,
          date: d.date,
          parcels: d.parcels,
          totalEarnings: d.totalEarnings,
          status: d.status,
          settlementId: d.settlementId,
        }));
    } else if (existingDocData && Array.isArray(existingDocData.recentDeliveries)) {
      recentDeliveries = existingDocData.recentDeliveries;
    }

    const sortedIncentives = [...(rider.incentives || [])]
      .filter(isNotDeleted)
      .sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : new Date(a.createdAt).getTime();
        const timeB = b.date ? new Date(b.date).getTime() : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });

    const canonicalRawAdv = calculateActiveAdvanceTotal(sortedAdvances, riderSettlements as any, rider.id);
    const canonicalRawInc = calculateActiveIncentiveTotal(sortedIncentives, riderSettlements as any, rider.id);
    const canonicalTotalAdv = Math.max(0, canonicalRawAdv - canonicalRawInc);
    const canonicalTotalInc = Math.max(0, canonicalRawInc - canonicalRawAdv);

    const statementPayload: PublicRiderStatement = {
      riderId: rider.id,
      riderName: rider.name,
      riderPhone: rider.phone,
      vehicleType: rider.vehicleType || 'Hero Splendor (Bike)',
      hubName: hubName || existingDocData?.hubName || 'Courier Delivery Hub',
      hubSignature: hubSignature || existingDocData?.hubSignature || '',
      totalAdvance: canonicalTotalAdv,
      advances: sortedAdvances,
      totalIncentive: canonicalTotalInc,
      incentives: sortedIncentives,
      salaries: riderSettlements,
      recentDeliveries,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(docRef, cleanForFirestore(statementPayload), { merge: true });
  } catch (err) {
    console.warn('Failed to sync public statement document:', err);
  }
}

/**
 * Real-time listener for public rider statement document (/public_statements/{riderId}).
 * Provides instant real-time parity between Admin and Rider views.
 * When document updates on Admin phone, Rider phone updates in real time (< 500ms).
 */
export function subscribeToPublicRiderStatement(
  riderId: string,
  onUpdate: (statement: PublicRiderStatement | null) => void,
  onError?: (error: Error) => void
): () => void {
  if (!riderId) {
    onUpdate(null);
    return () => {};
  }

  const cleanId = riderId.trim();
  const docRef = doc(db, 'public_statements', cleanId);

  // Perform immediate fetch / self-healing in parallel
  fetchPublicRiderStatement(cleanId)
    .then((initialData) => {
      if (initialData) onUpdate(initialData);
    })
    .catch(() => {});

  // Listen to Firestore real-time snapshot
  const unsubscribe = onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as PublicRiderStatement;
        if (Array.isArray(data.advances)) {
          data.advances = purgePhantomAdvances(data.advances);
        }
        onUpdate(data);
      }
    },
    (err) => {
      console.warn('Real-time statement subscription notice:', err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}

/**
 * Fetch public read-only statement by riderId from Firestore (/public_statements/{riderId})
 * Callable without authentication.
 * Fetches rider profile, advances, delivery entries, and settlements.
 */
export async function fetchPublicRiderStatement(
  riderId: string
): Promise<PublicRiderStatement | null> {
  if (!riderId) return null;
  const cleanId = riderId.trim();
  const decodedId = decodeURIComponent(cleanId).trim();

  try {
    // 1. Direct document lookup by clean ID or decoded ID
    let existingStatement: PublicRiderStatement | null = null;
    try {
      const docRef = doc(db, 'public_statements', cleanId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        existingStatement = snap.data() as PublicRiderStatement;
      } else if (decodedId !== cleanId) {
        const docRefDecoded = doc(db, 'public_statements', decodedId);
        const snapDecoded = await getDoc(docRefDecoded);
        if (snapDecoded.exists()) {
          existingStatement = snapDecoded.data() as PublicRiderStatement;
        }
      }
    } catch (e) {
      console.warn('public_statements direct lookup notice:', e);
    }

    const isNotDeleted = (item: any) =>
      Boolean(item) &&
      item.isDeleted !== true &&
      item.status !== 'DELETED' &&
      item.status !== 'RESET_ARCHIVED';

    // If existing statement exists, ensure its salaries and advances are complete and deleted items are stripped
    if (existingStatement) {
      if (Array.isArray(existingStatement.advances)) {
        existingStatement.advances = purgePhantomAdvances(existingStatement.advances.filter(isNotDeleted));
      }
      if (Array.isArray(existingStatement.incentives)) {
        existingStatement.incentives = existingStatement.incentives.filter(isNotDeleted);
      }

      // Check if salaries are missing or empty in this existingStatement
      if (!Array.isArray(existingStatement.salaries) || existingStatement.salaries.length === 0) {
        try {
          const qSettle = query(collectionGroup(db, 'settlements'), where('riderId', 'in', [cleanId, decodedId]));
          const snapSettle = await getDocs(qSettle);
          if (!snapSettle.empty) {
            existingStatement.salaries = snapSettle.docs
              .map((d) => d.data() as SettlementRecord)
              .filter((s) => !s.isDeleted)
              .map((s) => ({
                id: s.id,
                startDate: s.startDate,
                endDate: s.endDate,
                totalParcels: Number(s.totalParcels) || 0,
                baseAmount: Number(s.baseAmount) || 0,
                incentiveAmount: Number(s.incentiveAmount) || 0,
                grossTotal: Number(s.grossTotal) || 0,
                advanceAmount: Number(s.advanceAmount) || 0,
                advanceDate: s.advanceDate || s.paidAt?.split('T')[0] || s.startDate,
                advanceReason: s.advanceReason || `एडवांस राशि (पे-आउट सेटलमेंट ${s.startDate} से ${s.endDate})`,
                netTotal: Number(s.netTotal) || 0,
                paidAt: s.paidAt || s.endDate,
                status: s.status || 'PAID',
                settledAdvanceIds: s.settledAdvanceIds,
                settledIncentiveIds: s.settledIncentiveIds,
              }));
            // Background save back to document so it stays locked & permanent
            setDoc(doc(db, 'public_statements', cleanId), { salaries: existingStatement.salaries }, { merge: true }).catch(() => {});
          }
        } catch (e) {
          console.warn('Background settlements replenishment notice:', e);
        }
      }

      // If existing statement has detailed advances or deliveries/salaries, return it
      if (
        (existingStatement.advances && existingStatement.advances.length > 0) ||
        (existingStatement.salaries && existingStatement.salaries.length > 0) ||
        (existingStatement.recentDeliveries && existingStatement.recentDeliveries.length > 0)
      ) {
        return existingStatement;
      }
    }

    // 2. Fetch rider profile document (prefer collectionGroup /workspaces/*/riders over legacy root /riders)
    let foundRider: Rider | null = null;

    // Check collectionGroup('riders') first so workspace-authoritative data wins over stale root doc
    try {
      const qRider = query(collectionGroup(db, 'riders'), where('id', '==', cleanId), limit(1));
      const snapRider = await getDocs(qRider);
      if (!snapRider.empty) {
        foundRider = snapRider.docs[0].data() as Rider;
      }
    } catch (err) {
      console.warn('collectionGroup riders notice:', err);
    }

    // Check direct /riders/{id}
    if (!foundRider) {
      try {
        const riderDirectSnap = await getDoc(doc(db, 'riders', cleanId));
        if (riderDirectSnap.exists()) {
          foundRider = riderDirectSnap.data() as Rider;
        } else if (decodedId !== cleanId) {
          const decodedSnap = await getDoc(doc(db, 'riders', decodedId));
          if (decodedSnap.exists()) {
            foundRider = decodedSnap.data() as Rider;
          }
        }
      } catch {}
    }

    // Check query on collection('riders')
    if (!foundRider) {
      try {
        const qDirect = query(collection(db, 'riders'), where('id', '==', cleanId), limit(1));
        const snapDirect = await getDocs(qDirect);
        if (!snapDirect.empty) {
          foundRider = snapDirect.docs[0].data() as Rider;
        }
      } catch {}
    }

    // Local storage fallback
    if (!foundRider) {
      try {
        const raw = localStorage.getItem('cp_riders');
        if (raw) {
          const cached: Rider[] = JSON.parse(raw);
          const found = cached.find((r) => r.id === cleanId || r.id === decodedId);
          if (found) foundRider = found;
        }
      } catch {}
    }

    // If foundRider not found, create a safe fallback statement object
    const safeFallback: PublicRiderStatement = existingStatement || {
      riderId: cleanId,
      riderName: `राइडर (${cleanId})`,
      riderPhone: '',
      vehicleType: 'Hero Splendor (Bike)',
      hubName: 'सरायकेला कूरियर डिलीवरी हब',
      hubSignature: 'सरायकेला कूरियर डिलीवरी हब',
      totalAdvance: 0,
      advances: [],
      salaries: [],
      recentDeliveries: [],
      updatedAt: new Date().toISOString(),
    };

    if (!foundRider) {
      return safeFallback;
    }

    // 3. Merge advances from foundRider and collectionGroup('advances')
    const advMap = new Map<string, RiderAdvanceEntry>();
    (Array.isArray(foundRider.advances) ? foundRider.advances : []).forEach((a) => {
      if (a && a.id) advMap.set(a.id, a);
    });
    try {
      const qAdv = query(collectionGroup(db, 'advances'), where('riderId', '==', cleanId));
      const snapAdv = await getDocs(qAdv);
      snapAdv.docs.forEach((d) => {
        const a = d.data() as RiderAdvanceEntry;
        if (a && a.id) {
          const prev = advMap.get(a.id);
          advMap.set(a.id, prev ? { ...prev, ...a } : a);
        }
      });
    } catch {}
    let advances: RiderAdvanceEntry[] = purgePhantomAdvances(Array.from(advMap.values()).filter(isNotDeleted));

    // 3b. Merge incentives from foundRider and collectionGroup('incentives')
    const incMap = new Map<string, RiderIncentiveEntry>();
    (Array.isArray(foundRider.incentives) ? foundRider.incentives : []).forEach((i) => {
      if (i && i.id) incMap.set(i.id, i);
    });
    try {
      const qInc = query(collectionGroup(db, 'incentives'), where('riderId', '==', cleanId));
      const snapInc = await getDocs(qInc);
      snapInc.docs.forEach((d) => {
        const i = d.data() as RiderIncentiveEntry;
        if (i && i.id) {
          const prev = incMap.get(i.id);
          incMap.set(i.id, prev ? { ...prev, ...i } : i);
        }
      });
    } catch {}
    let incentives: RiderIncentiveEntry[] = Array.from(incMap.values()).filter(isNotDeleted);

    // 4. Fetch & merge settlements from BOTH collectionGroup('settlements') (workspace-authoritative) AND root settlements
    const salariesMap = new Map<string, any>();
    try {
      const qSettleGroup = query(collectionGroup(db, 'settlements'), where('riderId', '==', cleanId));
      const snapSettleGroup = await getDocs(qSettleGroup);
      snapSettleGroup.docs.forEach((d) => {
        const s = d.data() as SettlementRecord;
        if (s && !s.isDeleted) {
          const key = s.id || `${s.startDate}_${s.endDate}`;
          salariesMap.set(key, {
            id: s.id,
            startDate: s.startDate,
            endDate: s.endDate,
            totalParcels: s.totalParcels,
            baseAmount: s.baseAmount,
            incentiveAmount: s.incentiveAmount,
            grossTotal: s.grossTotal,
            advanceAmount: s.advanceAmount || 0,
            advanceDate: s.advanceDate,
            advanceReason: s.advanceReason,
            netTotal: s.netTotal,
            paidAt: s.paidAt,
            status: s.status || 'PAID',
            settledAdvanceIds: s.settledAdvanceIds,
            settledIncentiveIds: s.settledIncentiveIds,
          });
        }
      });
    } catch {}
    try {
      const qSettlements = query(collection(db, 'settlements'), where('riderId', '==', cleanId));
      const snapSettlements = await getDocs(qSettlements);
      snapSettlements.docs.forEach((d) => {
        const s = d.data() as SettlementRecord;
        if (s && !s.isDeleted) {
          const key = s.id || `${s.startDate}_${s.endDate}`;
          if (!salariesMap.has(key)) {
            salariesMap.set(key, {
              id: s.id,
              startDate: s.startDate,
              endDate: s.endDate,
              totalParcels: s.totalParcels,
              baseAmount: s.baseAmount,
              incentiveAmount: s.incentiveAmount,
              grossTotal: s.grossTotal,
              advanceAmount: s.advanceAmount || 0,
              advanceDate: s.advanceDate,
              advanceReason: s.advanceReason,
              netTotal: s.netTotal,
              paidAt: s.paidAt,
              status: s.status || 'PAID',
              settledAdvanceIds: s.settledAdvanceIds,
              settledIncentiveIds: s.settledIncentiveIds,
            });
          }
        }
      });
    } catch {}
    let salaries: any[] = Array.from(salariesMap.values());

    // Check localStorage settlements fallback
    if (salaries.length === 0) {
      try {
        const rawS = localStorage.getItem('cp_settlements');
        if (rawS) {
          const cachedS: SettlementRecord[] = JSON.parse(rawS);
          salaries = cachedS
            .filter((s) => s.riderId === cleanId || s.riderId === decodedId)
            .map((s) => ({
              id: s.id,
              startDate: s.startDate,
              endDate: s.endDate,
              totalParcels: s.totalParcels,
              baseAmount: s.baseAmount,
              incentiveAmount: s.incentiveAmount,
              grossTotal: s.grossTotal,
              advanceAmount: s.advanceAmount || 0,
              netTotal: s.netTotal,
              paidAt: s.paidAt,
              status: s.status || 'PAID',
            }));
        }
      } catch {}
    }

    // 5. Fetch delivery entries (from root deliveries or collectionGroup)
    let recentDeliveries: any[] = [];
    try {
      const qDel = query(collection(db, 'deliveries'), where('riderId', '==', cleanId), limit(100));
      const snapDel = await getDocs(qDel);
      if (!snapDel.empty) {
        recentDeliveries = snapDel.docs.map((d) => {
          const e = d.data() as DeliveryEntry;
          return {
            id: e.id,
            date: e.date,
            parcels: e.parcels,
            totalEarnings: e.totalEarnings,
            status: e.status,
            settlementId: e.settlementId,
          };
        });
      }
    } catch {}

    if (recentDeliveries.length === 0) {
      try {
        const qEntries = query(collectionGroup(db, 'entries'), where('riderId', '==', cleanId), limit(100));
        const snapEntries = await getDocs(qEntries);
        if (!snapEntries.empty) {
          recentDeliveries = snapEntries.docs.map((d) => {
            const e = d.data() as DeliveryEntry;
            return {
              id: e.id,
              date: e.date,
              parcels: e.parcels,
              totalEarnings: e.totalEarnings,
              status: e.status,
              settlementId: e.settlementId,
            };
          });
        }
      } catch {}
    }

    if (recentDeliveries.length === 0) {
      try {
        const qDeliveries = query(collectionGroup(db, 'deliveries'), where('riderId', 'in', [cleanId, decodedId]), limit(100));
        const snapDeliveries = await getDocs(qDeliveries);
        if (!snapDeliveries.empty) {
          recentDeliveries = snapDeliveries.docs.map((d) => {
            const e = d.data() as DeliveryEntry;
            return {
              id: e.id,
              date: e.date,
              parcels: e.parcels,
              totalEarnings: e.totalEarnings,
              status: e.status,
            };
          });
        }
      } catch {}
    }

    // Local storage deliveries fallback
    if (recentDeliveries.length === 0) {
      try {
        const rawD = localStorage.getItem('cp_deliveries');
        if (rawD) {
          const cachedD: DeliveryEntry[] = JSON.parse(rawD);
          recentDeliveries = cachedD
            .filter((e) => e.riderId === cleanId || e.riderId === decodedId)
            .slice(0, 100)
            .map((e) => ({
              id: e.id,
              date: e.date,
              parcels: e.parcels,
              totalEarnings: e.totalEarnings,
              status: e.status,
            }));
        }
      } catch {}
    }

    // Include authentic advances from settlements if not already present in advances
    salaries.forEach((s) => {
      if (s.advanceAmount > 0) {
        const hasMatch = advances.some(
          (a) =>
            a.id === `settlement_adv_${s.id}` ||
            a.id === s.id ||
            a.settlementId === s.id ||
            a.settledPayoutId === s.id ||
            ((s as any).settledAdvanceIds && (s as any).settledAdvanceIds.includes(a.id)) ||
            (!a.settlementId && !a.settledPayoutId && Math.abs(Number(a.amount) - s.advanceAmount) < 0.01)
        );
        if (!hasMatch) {
          advances.push({
            id: `settlement_adv_${s.id}`,
            riderId: foundRider.id,
            amount: s.advanceAmount,
            date: s.advanceDate || s.paidAt?.split('T')[0] || s.startDate,
            createdAt: s.advanceDate || s.paidAt || s.startDate,
            reason: s.advanceReason || `एडवांस राशि (पे-आउट सेटलमेंट ${s.startDate} से ${s.endDate})`,
            isSettled: true,
            isDeducted: true,
            status: 'PAID',
          });
        }
      }
    });

    const constructedStatement: PublicRiderStatement = {
      riderId: foundRider.id,
      riderName: foundRider.name,
      riderPhone: foundRider.phone,
      vehicleType: foundRider.vehicleType || 'Hero Splendor (Bike)',
      hubName: 'सरायकेला कूरियर डिलीवरी हब',
      hubSignature: 'सरायकेला कूरियर डिलीवरी हब',
      totalAdvance: typeof foundRider.totalAdvance === 'number' ? foundRider.totalAdvance : 0,
      advances,
      totalIncentive: typeof foundRider.totalIncentive === 'number' ? foundRider.totalIncentive : 0,
      incentives,
      salaries,
      recentDeliveries,
      updatedAt: new Date().toISOString(),
    };

    // Cache back to public_statements document for fast subsequent loads
    try {
      const docRefToSave = doc(db, 'public_statements', cleanId);
      setDoc(docRefToSave, cleanForFirestore(constructedStatement), { merge: true }).catch(() => {});
    } catch {}

    return constructedStatement;
  } catch (err) {
    console.warn('Notice loading public statement from Firestore, falling back to local snapshot:', err);
    try {
      const rawRiders = localStorage.getItem('cp_riders');
      if (rawRiders) {
        const riders: Rider[] = JSON.parse(rawRiders);
        const matched = riders.find((r) => r.id === cleanId || r.id === decodedId);
        if (matched) {
          return {
            riderId: matched.id,
            riderName: matched.name,
            riderPhone: matched.phone,
            vehicleType: matched.vehicleType || 'Hero Splendor (Bike)',
            hubName: 'सरायकेला कूरियर डिलीवरी हब',
            hubSignature: 'सरायकेला कूरियर डिलीवरी हब',
            totalAdvance: typeof matched.totalAdvance === 'number' ? matched.totalAdvance : 0,
            advances: Array.isArray(matched.advances) ? matched.advances : [],
            salaries: [],
            recentDeliveries: [],
            updatedAt: new Date().toISOString(),
          };
        }
      }
    } catch {}

    return {
      riderId: cleanId,
      riderName: `राइडर (${cleanId})`,
      riderPhone: '',
      vehicleType: 'Hero Splendor (Bike)',
      hubName: 'सरायकेला कूरियर डिलीवरी हब',
      hubSignature: 'सरायकेला कूरियर डिलीवरी हब',
      totalAdvance: 0,
      advances: [],
      salaries: [],
      recentDeliveries: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Background bulk sync all riders' public statement documents
 */
export async function syncAllRidersPublicStatements(
  riders: Rider[],
  settlements: SettlementRecord[] = [],
  deliveries: DeliveryEntry[] = [],
  hubName?: string,
  hubSignature?: string
): Promise<void> {
  if (!Array.isArray(riders) || riders.length === 0) return;
  for (const r of riders) {
    try {
      await syncPublicRiderStatement(r, r.advances || [], settlements, deliveries, hubName, hubSignature);
    } catch (e) {
      console.warn('Notice syncing statement for rider:', r.name, e);
    }
  }
}

/**
 * Write advance entry directly to Firestore 'advances' collection
 */
export async function writeAdvanceEntryToFirestore(
  userId: string,
  advance: {
    id?: string;
    riderId: string;
    riderName?: string;
    riderPhone?: string;
    amount: number;
    remainingAmount?: number;
    date: string;
    reason?: string;
    isSettled?: boolean;
    status?: 'PENDING' | 'SETTLED' | string;
    runningBalance?: number;
  }
): Promise<string> {
  const effectiveUserId = (userId || '').trim();
  const isGuest = !effectiveUserId || effectiveUserId === 'guest';

  const advId = advance.id || `adv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();
  const advData = cleanForFirestore({
    id: advId,
    riderId: advance.riderId,
    riderName: advance.riderName || '',
    riderPhone: advance.riderPhone || '',
    amount: advance.amount,
    remainingAmount: advance.remainingAmount !== undefined ? advance.remainingAmount : advance.amount,
    isSettled: Boolean(advance.isSettled),
    status: Boolean(advance.isSettled) ? 'SETTLED' : 'PENDING',
    date: advance.date,
    reason: advance.reason,
    runningBalance: advance.runningBalance || advance.amount,
    workspaceId: effectiveUserId || 'guest',
    userId: effectiveUserId || 'guest',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const rootPromise = setDoc(doc(db, 'advances', advId), advData, { merge: true });
  const wsPromise = !isGuest
    ? setDoc(doc(db, 'workspaces', effectiveUserId, 'advances', advId), advData, { merge: true })
    : Promise.resolve();

  const [rootRes, wsRes] = await Promise.allSettled([rootPromise, wsPromise]);
  if (!isGuest) {
    if (wsRes.status === 'rejected') {
      if (rootRes.status === 'rejected' || Boolean(auth?.currentUser)) {
        throw wsRes.reason;
      }
      console.warn('Workspace advance mirror skipped in companion session:', wsRes.reason);
    }
  } else if (rootRes.status === 'rejected') {
    throw rootRes.reason;
  }

  return advId;
}

/**
 * Wipe ONLY unsettled/pending advance records from Firestore backend
 * while retaining all historical settled advances (isSettled === true).
 */
export async function purgeUnsettledAdvancesFromFirestore(userId?: string): Promise<void> {
  try {
    // 1. Root /advances collection
    const q1 = query(collection(db, 'advances'), where('isSettled', '!=', true));
    const snap1 = await getDocs(q1);
    for (const d of snap1.docs) {
      const data = d.data();
      // Double check it's not settled or paid
      if (data.isSettled !== true && data.status !== 'PAID') {
        await deleteDoc(d.ref).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Notice purging root unsettled advances:', err);
  }

  if (userId) {
    try {
      const qWs = query(collection(db, 'workspaces', userId, 'advances'), where('isSettled', '!=', true));
      const snapWs = await getDocs(qWs);
      for (const d of snapWs.docs) {
        const data = d.data();
        if (data.isSettled !== true && data.status !== 'PAID') {
          await deleteDoc(d.ref).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Notice purging workspace unsettled advances:', err);
    }
  }
}

/**
 * Update advance entry directly in Firestore 'advances' collection via updateDoc
 */
export async function updateAdvanceInFirestore(
  userId: string,
  advanceId: string,
  updates: {
    amount: number;
    date: string;
    reason?: string;
  }
): Promise<void> {
  if (!advanceId) return;
  const cleanId = advanceId.replace(/^adv-/, '');
  const data = cleanForFirestore({
    amount: updates.amount,
    date: updates.date,
    reason: updates.reason || 'सामान्य एडवांस',
    updatedAt: new Date().toISOString(),
  });

  // Direct doc update
  try {
    const advRef = doc(db, 'advances', cleanId);
    await updateDoc(advRef, data);
  } catch {
    try {
      const advRef = doc(db, 'advances', cleanId);
      await setDoc(advRef, data, { merge: true });
    } catch (err) {
      console.warn('Direct /advances update error:', err);
    }
  }

  if (userId) {
    try {
      const wsAdvRef = doc(db, 'workspaces', userId, 'advances', cleanId);
      await updateDoc(wsAdvRef, data);
    } catch {
      try {
        const wsAdvRef = doc(db, 'workspaces', userId, 'advances', cleanId);
        await setDoc(wsAdvRef, data, { merge: true });
      } catch (err) {
        console.warn('Workspace /advances update error:', err);
      }
    }
  }
}

/**
 * Write incentive entry directly to Firestore 'incentives' collection
 */
export async function writeIncentiveEntryToFirestore(
  userId: string,
  incentive: {
    id?: string;
    riderId: string;
    riderName?: string;
    riderPhone?: string;
    amount: number;
    date: string;
    reason: string;
    source?: 'manual' | 'surplus';
    createdBy?: string;
  }
): Promise<string> {
  const effectiveUserId = (userId || '').trim();
  const isGuest = !effectiveUserId || effectiveUserId === 'guest';

  const incId = incentive.id || `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();
  const incData = cleanForFirestore({
    id: incId,
    riderId: incentive.riderId,
    riderName: incentive.riderName || '',
    riderPhone: incentive.riderPhone || '',
    amount: incentive.amount,
    date: incentive.date,
    reason: incentive.reason,
    source: incentive.source || 'manual',
    workspaceId: effectiveUserId || 'guest',
    userId: effectiveUserId || 'guest',
    createdBy: incentive.createdBy || '',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const rootPromise = setDoc(doc(db, 'incentives', incId), incData, { merge: true });
  const wsPromise = !isGuest
    ? setDoc(doc(db, 'workspaces', effectiveUserId, 'incentives', incId), incData, { merge: true })
    : Promise.resolve();

  const [rootRes, wsRes] = await Promise.allSettled([rootPromise, wsPromise]);
  if (!isGuest) {
    if (wsRes.status === 'rejected') {
      if (rootRes.status === 'rejected' || Boolean(auth?.currentUser)) {
        throw wsRes.reason;
      }
      console.warn('Workspace incentive mirror skipped in companion session:', wsRes.reason);
    }
  } else if (rootRes.status === 'rejected') {
    throw rootRes.reason;
  }

  return incId;
}

/**
 * Update incentive entry directly in Firestore 'incentives' collection via updateDoc
 */
export async function updateIncentiveInFirestore(
  userId: string,
  incentiveId: string,
  updates: {
    amount: number;
    date: string;
    reason?: string;
  }
): Promise<void> {
  if (!incentiveId) return;
  const cleanId = incentiveId.replace(/^inc-/, '');
  const data = cleanForFirestore({
    amount: updates.amount,
    date: updates.date,
    reason: updates.reason || 'इंसेंटिव / बोनस',
    updatedAt: new Date().toISOString(),
  });

  try {
    const incRef = doc(db, 'incentives', cleanId);
    await updateDoc(incRef, data);
  } catch {
    try {
      const incRef = doc(db, 'incentives', cleanId);
      await setDoc(incRef, data, { merge: true });
    } catch (err) {
      console.warn('Direct /incentives update error:', err);
    }
  }

  if (userId) {
    try {
      const wsIncRef = doc(db, 'workspaces', userId, 'incentives', cleanId);
      await updateDoc(wsIncRef, data);
    } catch {
      try {
        const wsIncRef = doc(db, 'workspaces', userId, 'incentives', cleanId);
        await setDoc(wsIncRef, data, { merge: true });
      } catch (err) {
        console.warn('Workspace /incentives update error:', err);
      }
    }
  }
}

/**
 * Soft-Delete advance document from Firestore (Zero Data Loss - Never hard deletes)
 */
export async function deleteAdvanceFromFirestore(
  userId: string,
  advanceId: string
): Promise<void> {
  if (!advanceId) return;
  const cleanId = advanceId.replace(/^adv-/, '');
  const softDeletePayload = {
    isDeleted: true,
    deletedAt: new Date().toISOString(),
    status: 'DELETED',
  };

  try {
    await setDoc(doc(db, 'advances', cleanId), softDeletePayload, { merge: true });
  } catch (err) {
    console.warn('Root advance soft-delete notice:', err);
  }
  if (cleanId !== advanceId) {
    try {
      await setDoc(doc(db, 'advances', advanceId), softDeletePayload, { merge: true });
    } catch {}
  }
  if (userId) {
    try {
      await setDoc(doc(db, 'workspaces', userId, 'advances', cleanId), softDeletePayload, { merge: true });
    } catch (err) {
      console.warn('Workspace advance soft-delete notice:', err);
    }
    if (cleanId !== advanceId) {
      try {
        await setDoc(doc(db, 'workspaces', userId, 'advances', advanceId), softDeletePayload, { merge: true });
      } catch {}
    }
  }
}

/**
 * Restore soft-deleted advance document back to active ledger
 */
export async function restoreAdvanceInFirestore(
  userId: string,
  advanceId: string
): Promise<void> {
  if (!advanceId) return;
  const cleanId = advanceId.replace(/^adv-/, '');
  const restorePayload = {
    isDeleted: false,
    deletedAt: null,
    status: 'UNPAID',
  };
  try {
    await setDoc(doc(db, 'advances', cleanId), restorePayload, { merge: true });
  } catch {}
  if (cleanId !== advanceId) {
    try {
      await setDoc(doc(db, 'advances', advanceId), restorePayload, { merge: true });
    } catch {}
  }
  if (userId) {
    try {
      await setDoc(doc(db, 'workspaces', userId, 'advances', cleanId), restorePayload, { merge: true });
    } catch {}
    if (cleanId !== advanceId) {
      try {
        await setDoc(doc(db, 'workspaces', userId, 'advances', advanceId), restorePayload, { merge: true });
      } catch {}
    }
  }
}

/**
 * Soft-Delete incentive document from Firestore root and workspace collections (Zero Data Loss)
 */
export async function deleteIncentiveFromFirestore(
  userId: string,
  incentiveId: string
): Promise<void> {
  if (!incentiveId) return;
  const cleanId = incentiveId.replace(/^inc-/, '');
  const softDeletePayload = {
    isDeleted: true,
    deletedAt: new Date().toISOString(),
    status: 'DELETED',
  };

  try {
    await setDoc(doc(db, 'incentives', cleanId), softDeletePayload, { merge: true });
  } catch {}
  if (cleanId !== incentiveId) {
    try {
      await setDoc(doc(db, 'incentives', incentiveId), softDeletePayload, { merge: true });
    } catch {}
  }
  if (userId) {
    try {
      await setDoc(doc(db, 'workspaces', userId, 'incentives', cleanId), softDeletePayload, { merge: true });
    } catch {}
    if (cleanId !== incentiveId) {
      try {
        await setDoc(doc(db, 'workspaces', userId, 'incentives', incentiveId), softDeletePayload, { merge: true });
      } catch {}
    }
  }
}

/**
 * Restore soft-deleted incentive document back to active incentives
 */
export async function restoreIncentiveInFirestore(
  userId: string,
  incentiveId: string
): Promise<void> {
  if (!incentiveId) return;
  const cleanId = incentiveId.replace(/^inc-/, '');
  const restorePayload = {
    isDeleted: false,
    deletedAt: null,
    status: 'UNPAID',
  };
  try {
    await setDoc(doc(db, 'incentives', cleanId), restorePayload, { merge: true });
  } catch {}
  if (cleanId !== incentiveId) {
    try {
      await setDoc(doc(db, 'incentives', incentiveId), restorePayload, { merge: true });
    } catch {}
  }
  if (userId) {
    try {
      await setDoc(doc(db, 'workspaces', userId, 'incentives', cleanId), restorePayload, { merge: true });
    } catch {}
    if (cleanId !== incentiveId) {
      try {
        await setDoc(doc(db, 'workspaces', userId, 'incentives', incentiveId), restorePayload, { merge: true });
      } catch {}
    }
  }
}

/**
 * Safely archive a rider's ledger/advances/incentives in Firestore without data loss
 */
export async function resetRiderAccountInFirestore(
  userId: string,
  riderId: string
): Promise<void> {
  if (!riderId) return;
  const archivePayload = {
    isDeleted: true,
    status: 'RESET_ARCHIVED',
    resetAt: new Date().toISOString(),
  };

  // 1. Archive advances rather than deleting
  try {
    const qAdvRoot = query(collection(db, 'advances'), where('riderId', '==', riderId));
    const snapAdvRoot = await getDocs(qAdvRoot);
    for (const d of snapAdvRoot.docs) {
      await setDoc(d.ref, archivePayload, { merge: true }).catch(() => {});
    }
  } catch (e) {
    console.warn('Error archiving root advances during reset:', e);
  }

  if (userId) {
    try {
      const qAdvWs = query(collection(db, 'workspaces', userId, 'advances'), where('riderId', '==', riderId));
      const snapAdvWs = await getDocs(qAdvWs);
      for (const d of snapAdvWs.docs) {
        await setDoc(d.ref, archivePayload, { merge: true }).catch(() => {});
      }
    } catch (e) {
      console.warn('Error archiving workspace advances during reset:', e);
    }
  }

  // 2. Archive incentives rather than deleting
  try {
    const qIncRoot = query(collection(db, 'incentives'), where('riderId', '==', riderId));
    const snapIncRoot = await getDocs(qIncRoot);
    for (const d of snapIncRoot.docs) {
      await setDoc(d.ref, archivePayload, { merge: true }).catch(() => {});
    }
  } catch (e) {
    console.warn('Error archiving root incentives during reset:', e);
  }

  if (userId) {
    try {
      const qIncWs = query(collection(db, 'workspaces', userId, 'incentives'), where('riderId', '==', riderId));
      const snapIncWs = await getDocs(qIncWs);
      for (const d of snapIncWs.docs) {
        await setDoc(d.ref, archivePayload, { merge: true }).catch(() => {});
      }
    } catch (e) {
      console.warn('Error archiving workspace incentives during reset:', e);
    }
  }

  // CollectionGroup archive
  try {
    const qCgAdv = query(collectionGroup(db, 'advances'), where('riderId', '==', riderId));
    const snapCgAdv = await getDocs(qCgAdv);
    for (const d of snapCgAdv.docs) {
      await setDoc(d.ref, archivePayload, { merge: true }).catch(() => {});
    }
  } catch (e) {}

  try {
    const qCgInc = query(collectionGroup(db, 'incentives'), where('riderId', '==', riderId));
    const snapCgInc = await getDocs(qCgInc);
    for (const d of snapCgInc.docs) {
      await setDoc(d.ref, archivePayload, { merge: true }).catch(() => {});
    }
  } catch (e) {}

  // 3. Reset rider record in /riders and /workspaces/{userId}/riders
  try {
    const riderRef = doc(db, 'riders', riderId);
    await setDoc(riderRef, { totalAdvance: 0, totalIncentive: 0, advances: [], incentives: [] }, { merge: true }).catch(() => {});
  } catch (e) {
    console.warn('Error resetting rider doc:', e);
  }

  if (userId) {
    try {
      const wsRiderRef = doc(db, 'workspaces', userId, 'riders', riderId);
      await setDoc(wsRiderRef, { totalAdvance: 0, totalIncentive: 0, advances: [], incentives: [] }, { merge: true }).catch(() => {});
    } catch (e) {
      console.warn('Error resetting workspace rider doc:', e);
    }
  }

  // 4. Reset public statement record in /public_statements/{riderId}
  try {
    const stmtRef = doc(db, 'public_statements', riderId);
    await setDoc(stmtRef, {
      totalAdvance: 0,
      totalIncentive: 0,
      advances: [],
      incentives: [],
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {});
  } catch (e) {
    console.warn('Error resetting public statement doc:', e);
  }
}

/**
 * Keep /advances and /incentives root & workspace subcollections in sync when settlement executes,
 * so subscribeToUserData merging subcollection docs NEVER reverts settled statuses.
 */
export async function syncSettledAdvancesAndIncentivesToFirestore(
  userId: string,
  settledAdvances: RiderAdvanceEntry[],
  settledIncentives: RiderIncentiveEntry[],
  riderMeta: { riderId: string; riderName?: string; riderPhone?: string; createdBy?: string }
): Promise<void> {
  if (!userId && settledAdvances.length === 0 && settledIncentives.length === 0) return;

  const ops: Promise<any>[] = [];

  settledAdvances.forEach((adv) => {
    if (!adv || !adv.id) return;
    const cleanId = adv.id.replace(/^adv-/, '');
    const payload = cleanForFirestore({
      ...adv,
      riderId: adv.riderId || riderMeta.riderId,
      riderName: adv.riderName || riderMeta.riderName || '',
      riderPhone: adv.riderPhone || riderMeta.riderPhone || '',
      createdBy: adv.createdBy || riderMeta.createdBy || userId || '',
      workspaceId: userId || '',
      userId: userId || '',
      updatedAt: new Date().toISOString(),
    });
    ops.push(setDoc(doc(db, 'advances', cleanId), payload, { merge: true }).catch(() => {}));
    if (userId) {
      ops.push(setDoc(doc(db, 'workspaces', userId, 'advances', cleanId), payload, { merge: true }).catch(() => {}));
    }
  });

  settledIncentives.forEach((inc) => {
    if (!inc || !inc.id) return;
    const cleanId = inc.id.replace(/^inc-/, '');
    const payload = cleanForFirestore({
      ...inc,
      riderId: inc.riderId || riderMeta.riderId,
      riderName: inc.riderName || riderMeta.riderName || '',
      riderPhone: inc.riderPhone || riderMeta.riderPhone || '',
      createdBy: inc.createdBy || riderMeta.createdBy || userId || '',
      workspaceId: userId || '',
      userId: userId || '',
      updatedAt: new Date().toISOString(),
    });
    ops.push(setDoc(doc(db, 'incentives', cleanId), payload, { merge: true }).catch(() => {}));
    if (userId) {
      ops.push(setDoc(doc(db, 'workspaces', userId, 'incentives', cleanId), payload, { merge: true }).catch(() => {}));
    }
  });

  await Promise.all(ops);
}

/**
 * Permanently delete a single trashed Delivery Entry from Firestore (frees Firebase storage)
 * Records a workspace tombstone so stale browser caches can never resurrect the deleted entry.
 */
export async function permanentlyDeleteDeliveryFromFirestore(
  userId: string,
  entryId: string
): Promise<void> {
  if (!entryId) return;
  await recordDeletedTombstones(userId, { entryIds: [entryId] });

  const mirrorOps: Promise<any>[] = [
    deleteDoc(doc(db, 'deliveries', entryId)).catch(() => {}),
  ];
  if (userId && userId !== 'guest') {
    mirrorOps.push(deleteDoc(doc(db, 'users', userId, 'deliveries', entryId)).catch(() => {}));
    // Primary workspace document MUST delete cleanly (propagate if permission/network fails)
    await deleteDoc(doc(db, 'workspaces', userId, 'entries', entryId));
  }
  await Promise.all(mirrorOps);
}

/**
 * Permanently delete a single trashed Rider from Firestore (frees Firebase storage)
 * Records a workspace tombstone so stale browser caches can never resurrect the deleted rider.
 */
export async function permanentlyDeleteRiderFromFirestore(
  userId: string,
  riderId: string
): Promise<void> {
  if (!riderId) return;
  await recordDeletedTombstones(userId, { riderIds: [riderId] });

  const mirrorOps: Promise<any>[] = [
    deleteDoc(doc(db, 'riders', riderId)).catch(() => {}),
    deleteDoc(doc(db, 'public_statements', riderId)).catch(() => {}),
  ];
  if (userId && userId !== 'guest') {
    mirrorOps.push(deleteDoc(doc(db, 'users', userId, 'riders', riderId)).catch(() => {}));
    await deleteDoc(doc(db, 'workspaces', userId, 'riders', riderId));
  }
  await Promise.all(mirrorOps);
}

/**
 * Permanently delete a single trashed Advance from Firestore subcollections and update Rider doc
 */
export async function permanentlyDeleteAdvanceFromFirestore(
  userId: string,
  updatedRider: Rider,
  advanceId: string,
  userEmail?: string | null
): Promise<void> {
  if (!advanceId) return;
  const cleanId = advanceId.replace(/^adv-/, '');
  await recordDeletedTombstones(userId, { advanceIds: [advanceId, cleanId] });

  const mirrorOps: Promise<any>[] = [
    deleteDoc(doc(db, 'advances', cleanId)).catch(() => {}),
    syncPublicRiderStatement(updatedRider, updatedRider.advances || []).catch(() => {}),
  ];
  if (cleanId !== advanceId) {
    mirrorOps.push(deleteDoc(doc(db, 'advances', advanceId)).catch(() => {}));
  }
  if (userId && userId !== 'guest') {
    const wsDeletes: Promise<any>[] = [
      deleteDoc(doc(db, 'workspaces', userId, 'advances', cleanId)),
    ];
    if (cleanId !== advanceId) {
      wsDeletes.push(deleteDoc(doc(db, 'workspaces', userId, 'advances', advanceId)));
    }
    wsDeletes.push(saveRiderToFirestore(userId, updatedRider, userEmail));
    await Promise.all(wsDeletes);
  }
  await Promise.all(mirrorOps);
}

/**
 * Empty All / Auto-Purge expired trash records from Firestore cleanly in chunks
 * Records tombstones first so Web/other devices immediately drop and never re-upload deleted data.
 */
export async function emptyAllTrashInFirestore(
  userId: string,
  trashedEntryIds: string[],
  trashedRiderIds: string[],
  trashedAdvances: Array<{ advanceId: string }>,
  ridersWithPrunedAdvances: Rider[],
  userEmail?: string | null
): Promise<void> {
  const allAdvIds: string[] = [];
  trashedAdvances.forEach(({ advanceId }) => {
    if (!advanceId) return;
    allAdvIds.push(advanceId);
    const clean = advanceId.replace(/^adv-/, '');
    if (clean !== advanceId) allAdvIds.push(clean);
  });

  if (trashedEntryIds.length > 0 || trashedRiderIds.length > 0 || allAdvIds.length > 0) {
    await recordDeletedTombstones(userId, {
      entryIds: trashedEntryIds,
      riderIds: trashedRiderIds,
      advanceIds: allAdvIds,
    });
  }

  const primaryOps: Array<() => Promise<any>> = [];
  const mirrorOps: Promise<any>[] = [];

  trashedEntryIds.forEach((entryId) => {
    mirrorOps.push(deleteDoc(doc(db, 'deliveries', entryId)).catch(() => {}));
    if (userId && userId !== 'guest') {
      mirrorOps.push(deleteDoc(doc(db, 'users', userId, 'deliveries', entryId)).catch(() => {}));
      primaryOps.push(() => deleteDoc(doc(db, 'workspaces', userId, 'entries', entryId)));
    }
  });

  trashedRiderIds.forEach((riderId) => {
    mirrorOps.push(deleteDoc(doc(db, 'riders', riderId)).catch(() => {}));
    mirrorOps.push(deleteDoc(doc(db, 'public_statements', riderId)).catch(() => {}));
    if (userId && userId !== 'guest') {
      mirrorOps.push(deleteDoc(doc(db, 'users', userId, 'riders', riderId)).catch(() => {}));
      primaryOps.push(() => deleteDoc(doc(db, 'workspaces', userId, 'riders', riderId)));
    }
  });

  trashedAdvances.forEach(({ advanceId }) => {
    const cleanId = advanceId.replace(/^adv-/, '');
    mirrorOps.push(deleteDoc(doc(db, 'advances', cleanId)).catch(() => {}));
    if (cleanId !== advanceId) {
      mirrorOps.push(deleteDoc(doc(db, 'advances', advanceId)).catch(() => {}));
    }
    if (userId && userId !== 'guest') {
      primaryOps.push(() => deleteDoc(doc(db, 'workspaces', userId, 'advances', cleanId)));
      if (cleanId !== advanceId) {
        primaryOps.push(() => deleteDoc(doc(db, 'workspaces', userId, 'advances', advanceId)));
      }
    }
  });

  if (userId && userId !== 'guest') {
    ridersWithPrunedAdvances.forEach((r) => {
      primaryOps.push(() => saveRiderToFirestore(userId, r, userEmail));
      mirrorOps.push(syncPublicRiderStatement(r, r.advances || []).catch(() => {}));
    });
  }

  const CHUNK_SIZE = 20;
  for (let i = 0; i < primaryOps.length; i += CHUNK_SIZE) {
    await Promise.all(primaryOps.slice(i, i + CHUNK_SIZE).map((fn) => fn()));
  }
  await Promise.all(mirrorOps);
}



