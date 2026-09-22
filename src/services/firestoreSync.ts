import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  serverTimestamp,
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
  DefaultSubscriptionConfig,
  DEFAULT_USER_PERMISSIONS, 
  DEFAULT_USER_RATE_CONFIG,
  DEFAULT_SUBSCRIPTION_CONFIG,
  createDefaultUserSubscription
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

  const validPlanTypes: UserPlanType[] = ['free', 'paid'];
  const planType: UserPlanType = validPlanTypes.includes(sub.planType) ? sub.planType : 'free';

  const validPaymentStatuses: UserPaymentStatus[] = [
    'active',
    'expiring_soon',
    'expired',
    'verification_pending',
  ];
  const paymentStatus: UserPaymentStatus = validPaymentStatuses.includes(sub.paymentStatus)
    ? sub.paymentStatus
    : 'active';

  let lastSubmittedSlip: UserSubmittedSlip | undefined = undefined;
  if (sub.lastSubmittedSlip && typeof sub.lastSubmittedSlip === 'object') {
    lastSubmittedSlip = {
      slipUrl: String(sub.lastSubmittedSlip.slipUrl || ''),
      utrNumber: sub.lastSubmittedSlip.utrNumber ? String(sub.lastSubmittedSlip.utrNumber) : undefined,
      submittedAt: String(sub.lastSubmittedSlip.submittedAt || new Date().toISOString()),
      amountPaid: typeof sub.lastSubmittedSlip.amountPaid === 'number' ? sub.lastSubmittedSlip.amountPaid : 0,
    };
  }

  return {
    planType,
    monthlyFee: typeof sub.monthlyFee === 'number' ? sub.monthlyFee : 0,
    validUntil:
      typeof sub.validUntil === 'string' && sub.validUntil
        ? sub.validUntil
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    qrCodeUrl: typeof sub.qrCodeUrl === 'string' ? sub.qrCodeUrl : '',
    paymentStatus,
    ...(lastSubmittedSlip ? { lastSubmittedSlip } : {}),
  };
}

export const SYSTEM_SETTINGS_COLLECTION = 'system_settings';
export const SUBSCRIPTION_CONFIG_DOC = 'subscription';

/**
 * Super Admin: Get configurable default subscription for new users
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
  } catch (err) {
    console.warn('Could not fetch default subscription config from Firestore:', err);
  }
  return { ...DEFAULT_SUBSCRIPTION_CONFIG };
}

/**
 * Super Admin: Save configurable default subscription for new users
 */
export async function saveDefaultSubscriptionConfig(config: DefaultSubscriptionConfig): Promise<void> {
  const docRef = doc(db, SYSTEM_SETTINGS_COLLECTION, SUBSCRIPTION_CONFIG_DOC);
  await setDoc(
    docRef,
    {
      planType: config.planType || 'free',
      monthlyFee: typeof config.monthlyFee === 'number' ? config.monthlyFee : 0,
      trialDays: typeof config.trialDays === 'number' ? config.trialDays : 30,
      qrCodeUrl: config.qrCodeUrl || '',
      paymentStatus: config.paymentStatus || 'active',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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
  status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked';
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
    const allUserRef = doc(db, 'all_users', user.uid);
    const existingSnap = await getDoc(allUserRef);

    let status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' = adminRole ? 'active' : 'pending';
    let role: 'admin' | 'user' = adminRole ? 'admin' : 'user';
    let permissions: UserPermissions = { ...DEFAULT_USER_PERMISSIONS };
    let rateConfig: UserRateConfig = { ...DEFAULT_USER_RATE_CONFIG };
    let subscription: UserSubscription = createDefaultUserSubscription();
    const userName = user.displayName || user.email?.split('@')[0] || 'User';

    if (existingSnap.exists()) {
      const data = existingSnap.data();
      // Super admin is always active; otherwise preserve recorded status or default to pending
      status = adminRole 
        ? 'active' 
        : (data.status as 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked') || 'pending';
      role = adminRole ? 'admin' : (data.role || 'user');
      if (data.permissions) {
        permissions = normalizeUserPermissions(data.permissions);
      }
      if (data.rateConfig) {
        rateConfig = { ...DEFAULT_USER_RATE_CONFIG, ...data.rateConfig };
      }
      if (data.subscription) {
        subscription = normalizeUserSubscription(data.subscription);
      } else {
        subscription = createDefaultUserSubscription();
      }

      // Update login timestamp, name, photo without overwriting pending/blocked state or permissions
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
        updatedAt: serverTimestamp(),
      });
    } else {
      // First time registration - configurable default subscription for new users
      const defaultSubConfig = await getDefaultSubscriptionConfig();
      subscription = createDefaultUserSubscription(defaultSubConfig);

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
        updatedAt: serverTimestamp(),
      };
      await setDoc(allUserRef, newUserData);
    }

    // Also update root user document
    const userRef = doc(db, 'users', user.uid);
    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: user.email || '',
        name: userName,
        displayName: userName,
        photoURL: user.photoURL || '',
        lastLoginAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const isPending = !adminRole && status === 'pending';
    const isBlocked = !adminRole && (status === 'deactivated' || status === 'blocked');
    const isApproved = adminRole || status === 'approved' || status === 'active';

    return { 
      status,
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
 * 1) Admin approval / activation / deactivation / blocking
 * 2) Feature access flag changes
 * 3) Rate configurations
 * 4) Subscription updates
 */
export function subscribeToCurrentUserDoc(
  userId: string,
  userEmail: string | null | undefined,
  onUpdate: (userData: {
    status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked';
    isPending: boolean;
    isBlocked: boolean;
    isApproved: boolean;
    permissions: UserPermissions;
    rateConfig: UserRateConfig;
    hubSignature?: string;
    subscription?: UserSubscription;
  }) => void
): () => void {
  const allUserRef = doc(db, 'all_users', userId);
  const userRef = doc(db, 'users', userId);
  const adminRole = isSuperAdmin(userEmail);

  let mergedData: any = {};

  const processAndNotify = () => {
    const rawStatus = (mergedData.status as 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked') || 'pending';
    const status = adminRole ? 'active' : rawStatus;
    const isPending = !adminRole && status === 'pending';
    const isBlocked = !adminRole && (status === 'deactivated' || status === 'blocked');
    const isApproved = adminRole || status === 'approved' || status === 'active';

    const permissions = normalizeUserPermissions(mergedData.permissions);
    const rateConfig = mergedData.rateConfig 
      ? { ...DEFAULT_USER_RATE_CONFIG, ...mergedData.rateConfig } 
      : { ...DEFAULT_USER_RATE_CONFIG };
    const hubSignature = mergedData.hubSignature || rateConfig.hubSignature || '';
    const subscription = normalizeUserSubscription(mergedData.subscription);

    onUpdate({ status, isPending, isBlocked, isApproved, permissions, rateConfig, hubSignature, subscription });
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
  onStatusChange: (status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked') => void
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
        const rawStatus = (data.status as 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked') || 'pending';
        const status = isSuperAdmin(data.email) ? 'active' : rawStatus;
        const permissions = normalizeUserPermissions(data.permissions);
        const userName = data.name || data.displayName || data.email?.split('@')[0] || 'User';

        users.push({
          uid: docSnap.id,
          email: data.email || '',
          name: userName,
          displayName: userName,
          photoURL: data.photoURL || '',
          createdAt: data.createdAt || '',
          lastLoginAt: data.lastLoginAt || '',
          status,
          role: data.role || (isSuperAdmin(data.email) ? 'admin' : 'user'),
          totalRiders: data.totalRiders || 0,
          totalEntries: data.totalEntries || 0,
          permissions,
          rateConfig: data.rateConfig 
            ? { ...DEFAULT_USER_RATE_CONFIG, ...data.rateConfig } 
            : { ...DEFAULT_USER_RATE_CONFIG },
          hubSignature: data.hubSignature || data.rateConfig?.hubSignature || '',
          subscription: normalizeUserSubscription(data.subscription),
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
  newStatus: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked'
): Promise<void> {
  const userRef = doc(db, 'all_users', userId);
  await updateDoc(userRef, {
    status: newStatus,
    statusUpdatedAt: serverTimestamp(),
  });
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
 * Automatically marks paymentStatus as 'verification_pending'
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
    paymentStatus: 'verification_pending',
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
}

/**
 * Delete Rider from isolated user workspace
 */
export async function deleteRiderFromFirestore(userId: string, riderId: string): Promise<void> {
  if (!userId) return;
  const workspaceRef = doc(db, 'workspaces', userId, 'riders', riderId);
  await deleteDoc(workspaceRef).catch(() => {});
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

