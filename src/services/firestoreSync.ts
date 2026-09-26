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
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../firebase';
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
  PublicRiderStatement
} from '../types';

export const SUPER_ADMIN_EMAIL = 'pawankabiseraikella@gmail.com';

export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
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

  // If untagged legacy item, only allow if it has no foreign tags at all
  if (!entity.createdBy && !entity.createdByEmail && !entity.userId && !entity.workspaceId) {
    return true;
  }

  return false;
}

/**
 * Normalizes user permissions ensuring both standard keys (dailyEntry, riders, incentives, reports)
 * and legacy keys (canAccessDailyEntry, etc.) remain in sync.
 */
export function normalizeUserPermissions(raw?: any): UserPermissions {
  if (!raw) return { ...DEFAULT_USER_PERMISSIONS };
  const dailyEntry = raw.dailyEntry ?? raw.canAccessDailyEntry ?? true;
  const riders = raw.riders ?? raw.canAccessRiders ?? true;
  const incentives = raw.incentives ?? raw.canAccessIncentives ?? true;
  const reports = raw.reports ?? raw.canAccessReports ?? true;
  const festivalGreetings = raw.festivalGreetings ?? raw.canAccessFestivalGreetings ?? false;
  const canExportData = raw.canExportData ?? true;

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
  role: 'admin' | 'user';
  permissions: UserPermissions;
  rateConfig: UserRateConfig;
  hubSignature?: string;
  subscription: UserSubscription;
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
    let permissions: UserPermissions = { ...DEFAULT_USER_PERMISSIONS };
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
        permissions = normalizeUserPermissions(data.permissions);
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
        permissions: { ...DEFAULT_USER_PERMISSIONS },
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
      role, 
      permissions, 
      rateConfig,
      hubSignature: rateConfig.hubSignature || '',
      subscription,
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
      role: adminRole ? 'admin' : 'user',
      permissions: { ...DEFAULT_USER_PERMISSIONS },
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
    rawDoc?: any;
  }) => void
): () => void {
  const allUserRef = doc(db, 'all_users', userId);
  const userRef = doc(db, 'users', userId);
  const adminRole = isSuperAdmin(userEmail);

  let mergedData: any = {};

  const processAndNotify = () => {
    const rawStatus = (mergedData.status as 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected') || 'pending';
    const status = adminRole ? 'active' : rawStatus;
    const isPending = !adminRole && status === 'pending';
    const isBlocked = !adminRole && (status === 'deactivated' || status === 'blocked' || status === 'rejected');
    const isApproved = adminRole || status === 'approved' || status === 'active';

    const permissions = normalizeUserPermissions(mergedData.permissions);
    const rateConfig = mergedData.rateConfig 
      ? { ...DEFAULT_USER_RATE_CONFIG, ...mergedData.rateConfig } 
      : { ...DEFAULT_USER_RATE_CONFIG };
    const hubSignature = mergedData.hubSignature || rateConfig.hubSignature || '';
    const subscription = normalizeUserSubscription(mergedData.subscription);
    const validUntil = mergedData.validUntil || subscription.validUntil || '';

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
          permissions: DEFAULT_USER_PERMISSIONS,
          rateConfig: DEFAULT_USER_RATE_CONFIG,
          hubSignature: '',
          subscription: createDefaultUserSubscription(),
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
        if (data.subscription) {
          mergedData.subscription = data.subscription;
          processAndNotify();
        }
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
        const existing = data.validUntil || data.subscription?.validUntil;
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
  key: 'dailyEntry' | 'riders' | 'incentives' | 'reports' | 'festivalGreetings'
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
      const rootRidersSnap = await getDocs(collection(db, 'riders'));
      const rootDeliveriesSnap = await getDocs(collection(db, 'deliveries'));
      const rootSettlementsSnap = await getDocs(collection(db, 'settlements'));

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
    const rawRiders = localStorage.getItem(`courier_riders_u_${userId}`) || localStorage.getItem('courier_riders');
    const rawDeliveries = localStorage.getItem(`courier_deliveries_u_${userId}`) || localStorage.getItem('courier_deliveries');
    const rawSettlements = localStorage.getItem(`courier_settlements_u_${userId}`) || localStorage.getItem('courier_settlements');

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

  const notifyRiders = () => {
    // Strictly isolate: only include riders created by or belonging to this user's workspace
    const list = Array.from(ridersMap.values()).filter((r) => isEntityOwnedByUser(r, userId, effectiveEmail));
    list.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : 99999;
      const orderB = typeof b.order === 'number' ? b.order : 99999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.joinedDate < b.joinedDate ? 1 : -1);
    });
    callbacks.onRiders(list);
  };

  const notifyDeliveries = () => {
    const allowedRiderIds = new Set(Array.from(ridersMap.values()).map((r) => r.id));
    const list = Array.from(deliveriesMap.values()).filter((d) => {
      if (d.riderId && !allowedRiderIds.has(d.riderId)) return false;
      return isEntityOwnedByUser(d, userId, effectiveEmail);
    });
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    callbacks.onDeliveries(list);
  };

  const notifySettlements = () => {
    const allowedRiderIds = new Set(Array.from(ridersMap.values()).map((r) => r.id));
    const list = Array.from(settlementsMap.values()).filter((s) => {
      if (s.riderId && !allowedRiderIds.has(s.riderId)) return false;
      return isEntityOwnedByUser(s, userId, effectiveEmail);
    });
    list.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
    callbacks.onSettlements(list);
  };

  // Run migration in background to ensure zero data loss
  ensureWorkspaceMigration(userId, isSuperAdmin(effectiveEmail || userId), effectiveEmail).catch((err) => {
    console.warn('Workspace background migration note:', err);
  });

  const workspaceRidersRef = collection(db, 'workspaces', userId, 'riders');
  const workspaceEntriesRef = collection(db, 'workspaces', userId, 'entries');
  const workspaceSettlementsRef = collection(db, 'workspaces', userId, 'settlements');

  const unsubRiders = onSnapshot(
    workspaceRidersRef,
    (snapshot) => {
      ridersMap.clear();
      snapshot.forEach((docSnap) => {
        const r = docSnap.data() as Rider;
        // Purge check: if this document in userId's workspace is tagged with an external Gmail account or other UID
        if (!isEntityOwnedByUser(r, userId, effectiveEmail)) {
          deleteDoc(docSnap.ref).catch(() => {});
          return;
        }
        ridersMap.set(docSnap.id, r);
      });
      notifyRiders();
    },
    (error) => {
      console.warn('Warning listening to workspace riders collection:', error);
      callbacks.onError?.(error);
    }
  );

  const unsubEntries = onSnapshot(
    workspaceEntriesRef,
    (snapshot) => {
      deliveriesMap.clear();
      snapshot.forEach((docSnap) => {
        const e = docSnap.data() as DeliveryEntry;
        if (!isEntityOwnedByUser(e, userId, effectiveEmail)) {
          deleteDoc(docSnap.ref).catch(() => {});
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
          deleteDoc(docSnap.ref).catch(() => {});
          return;
        }
        settlementsMap.set(docSnap.id, s);
      });
      notifySettlements();
    },
    (error) => {
      console.warn('Warning listening to workspace settlements collection:', error);
      callbacks.onError?.(error);
    }
  );

  return () => {
    unsubRiders();
    unsubEntries();
    unsubSettlements();
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
    const rawRiders = localStorage.getItem(`courier_riders_u_${userId}`) || localStorage.getItem('courier_riders');
    const rawDeliveries = localStorage.getItem(`courier_deliveries_u_${userId}`) || localStorage.getItem('courier_deliveries');
    const rawSettlements = localStorage.getItem(`courier_settlements_u_${userId}`) || localStorage.getItem('courier_settlements');

    const localRiders: Rider[] = rawRiders ? JSON.parse(rawRiders) : [];
    const localDeliveries: DeliveryEntry[] = rawDeliveries ? JSON.parse(rawDeliveries) : [];
    const localSettlements: SettlementRecord[] = rawSettlements ? JSON.parse(rawSettlements) : [];

    if (!localRiders.length && !localDeliveries.length && !localSettlements.length) {
      return result;
    }

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
      if (!existingDeliveryIds.has(entry.id)) {
        ops.push({
          ref: doc(db, 'workspaces', userId, 'entries', entry.id),
          data: entry,
        });
        result.migratedDeliveries++;
      }
    });

    localSettlements.forEach((settlement) => {
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
 * Delete Rider from isolated user workspace
 */
export async function deleteRiderFromFirestore(userId: string, riderId: string): Promise<void> {
  if (!userId) return;
  const workspaceRef = doc(db, 'workspaces', userId, 'riders', riderId);
  await deleteDoc(workspaceRef).catch(() => {});
  try {
    const rootRef = doc(db, 'riders', riderId);
    await deleteDoc(rootRef).catch(() => {});
  } catch {}
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
 * Delete Delivery Entry from isolated user workspace
 */
export async function deleteDeliveryFromFirestore(
  userId: string,
  entryId: string
): Promise<void> {
  if (!userId) return;
  const workspaceRef = doc(db, 'workspaces', userId, 'entries', entryId);
  await deleteDoc(workspaceRef).catch(() => {});
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
    
    // Sort advances by date or createdAt descending
    const sortedAdvances = [...(advances.length > 0 ? advances : (rider.advances || []))].sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : new Date(a.createdAt).getTime();
      const timeB = b.date ? new Date(b.date).getTime() : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });

    // Filter and sort settlements for this rider
    const riderSettlements = settlements
      .filter((s) => s.riderId === rider.id)
      .sort((a, b) => new Date(b.paidAt || b.startDate).getTime() - new Date(a.paidAt || a.startDate).getTime())
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

    // Recent deliveries (up to 100)
    const recentDeliveries = deliveries
      .filter((d) => d.riderId === rider.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 100)
      .map((d) => ({
        id: d.id,
        date: d.date,
        parcels: d.parcels,
        totalEarnings: d.totalEarnings,
        status: d.status,
      }));

    const statementPayload: PublicRiderStatement = {
      riderId: rider.id,
      riderName: rider.name,
      riderPhone: rider.phone,
      vehicleType: rider.vehicleType || 'Hero Splendor (Bike)',
      hubName: hubName || 'Courier Delivery Hub',
      hubSignature: hubSignature || '',
      totalAdvance: typeof rider.totalAdvance === 'number' ? rider.totalAdvance : 0,
      advances: sortedAdvances,
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

    // If existing statement has detailed advances or deliveries/salaries, return it
    if (existingStatement && (
      (existingStatement.advances && existingStatement.advances.length > 0) ||
      (existingStatement.salaries && existingStatement.salaries.length > 0) ||
      (existingStatement.recentDeliveries && existingStatement.recentDeliveries.length > 0)
    )) {
      return existingStatement;
    }

    // 2. Fetch rider profile document (direct /riders, collection query, or collectionGroup)
    let foundRider: Rider | null = null;

    // Check direct /riders/{id}
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

    // Check collectionGroup('riders') with single equality (does not require composite index)
    if (!foundRider) {
      try {
        const qRider = query(collectionGroup(db, 'riders'), where('id', '==', cleanId), limit(1));
        const snapRider = await getDocs(qRider);
        if (!snapRider.empty) {
          foundRider = snapRider.docs[0].data() as Rider;
        }
      } catch (err) {
        console.warn('collectionGroup riders notice:', err);
      }
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

    // 3. Fetch advances
    let advances: RiderAdvanceEntry[] = Array.isArray(foundRider.advances) ? foundRider.advances : [];
    if (advances.length === 0) {
      try {
        const qAdv = query(collectionGroup(db, 'advances'), where('riderId', '==', cleanId));
        const snapAdv = await getDocs(qAdv);
        if (!snapAdv.empty) {
          advances = snapAdv.docs.map((d) => d.data() as RiderAdvanceEntry);
        }
      } catch {}
    }

    // 4. Fetch settlements / salaries
    let salaries: any[] = [];
    try {
      const qSettlements = query(collection(db, 'settlements'), where('riderId', '==', cleanId));
      const snapSettlements = await getDocs(qSettlements);
      if (!snapSettlements.empty) {
        salaries = snapSettlements.docs.map((d) => {
          const s = d.data() as SettlementRecord;
          return {
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
          };
        });
      }
    } catch {}

    if (salaries.length === 0) {
      try {
        const qSettlements = query(collectionGroup(db, 'settlements'), where('riderId', '==', cleanId));
        const snapSettlements = await getDocs(qSettlements);
        if (!snapSettlements.empty) {
          salaries = snapSettlements.docs.map((d) => {
            const s = d.data() as SettlementRecord;
            return {
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
            };
          });
        }
      } catch {}
    }

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

    const constructedStatement: PublicRiderStatement = {
      riderId: foundRider.id,
      riderName: foundRider.name,
      riderPhone: foundRider.phone,
      vehicleType: foundRider.vehicleType || 'Hero Splendor (Bike)',
      hubName: 'सरायकेला कूरियर डिलीवरी हब',
      hubSignature: 'सरायकेला कूरियर डिलीवरी हब',
      totalAdvance: typeof foundRider.totalAdvance === 'number' ? foundRider.totalAdvance : 0,
      advances,
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


