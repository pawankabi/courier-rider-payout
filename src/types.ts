export interface RiderAdvanceEntry {
  id: string;
  riderId: string;
  amount: number;
  date?: string; // Optional date (YYYY-MM-DD or empty)
  reason?: string; // e.g. "Bike repair", "Fuel", "Festival emergency"
  runningBalance: number; // previousAdvanceTotal + newAdvanceAmount = currentTotalAdvance
  createdAt: string; // ISO string
  createdBy?: string;
  settlementId?: string;
}

export interface Rider {
  id: string;
  name: string;
  phone: string; // 10-digit WhatsApp number
  vehicleType?: string;
  joinedDate: string;
  active: boolean;
  order?: number; // custom display sequence order index
  baseRate?: number; // custom base payout per parcel (e.g. ₹13 or admin-configured)
  incentiveRate?: number; // custom incentive rate per parcel (e.g. ₹2 or admin-configured)
  incentiveEnabled?: boolean; // toggle whether incentive is enabled for this specific rider
  createdBy?: string; // UID or email of user who registered the rider
  createdByEmail?: string; // Email of user who registered the rider
  workspaceId?: string; // Workspace UID isolation tag
  userId?: string; // Associated User UID
  totalAdvance?: number; // Running advance balance
  advances?: RiderAdvanceEntry[]; // Detailed advance payment records
}

export interface PublicRiderStatement {
  riderId: string;
  riderName: string;
  riderPhone: string;
  vehicleType?: string;
  hubName?: string;
  hubSignature?: string;
  totalAdvance: number;
  advances: RiderAdvanceEntry[];
  salaries: {
    id: string;
    startDate: string;
    endDate: string;
    totalParcels: number;
    baseAmount: number;
    incentiveAmount: number;
    grossTotal: number;
    advanceAmount: number;
    netTotal: number;
    paidAt: string;
    status: string;
  }[];
  recentDeliveries?: {
    id: string;
    date: string;
    parcels: number;
    totalEarnings: number;
    status: string;
    settlementId?: string;
  }[];
  updatedAt: string;
}

export interface DeliveryEntry {
  id: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  date: string; // YYYY-MM-DD
  parcels: number;
  baseRate: number; // ₹13 or rider/account configured
  hasIncentive: boolean; // +₹2 or rider/account configured
  incentiveRate: number; // ₹2 or rider/account configured
  appliedBaseRate?: number;
  appliedIncentiveRate?: number;
  baseAmount: number; // parcels * baseRate
  incentiveAmount: number; // parcels * (hasIncentive ? incentiveRate : 0)
  totalEarnings: number; // baseAmount + incentiveAmount
  status: 'Unpaid' | 'Paid';
  paidAt?: string;
  advanceAmount?: number;
  advanceDate?: string;
  advanceReason?: string;
  settlementId?: string;
  notes?: string;
  createdAt: string;
  createdBy?: string;
  createdByEmail?: string;
  workspaceId?: string;
  userId?: string;
}

export interface SettlementRecord {
  id: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  startDate: string;
  endDate: string;
  entryIds: string[];
  totalParcels: number;
  baseAmount: number;
  incentiveAmount: number;
  grossTotal: number;
  advanceAmount: number;
  advanceDate?: string;
  advanceReason?: string;
  netTotal: number;
  paidAt: string;
  status: 'PAID';
  createdBy?: string;
  createdByEmail?: string;
  workspaceId?: string;
  userId?: string;
}

export type TabType = 'entry' | 'riders' | 'reports' | 'settlement' | 'festivals' | 'admin';

export interface UserPermissions {
  dailyEntry: boolean;
  riders: boolean;
  incentives: boolean;
  reports: boolean;
  festivalGreetings?: boolean;
  canAccessDailyEntry?: boolean;
  canAccessRiders?: boolean;
  canAccessIncentives?: boolean;
  canAccessReports?: boolean;
  canAccessFestivalGreetings?: boolean;
  canExportData?: boolean;
}

export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  dailyEntry: true,
  riders: true,
  incentives: true,
  reports: true,
  festivalGreetings: false,
  canAccessDailyEntry: true,
  canAccessRiders: true,
  canAccessIncentives: true,
  canAccessReports: true,
  canAccessFestivalGreetings: false,
  canExportData: true,
};

export interface UserRateConfig {
  defaultBaseRate: number; // e.g. 13
  defaultIncentiveRate: number; // e.g. 2
  incentivesEnabled: boolean; // toggle incentive system on/off for user
  minParcelThreshold?: number; // parcel minimum for incentive (e.g. 0 or 80)
  hubSignature?: string; // Custom Hub / Business Signature (e.g. "सरायकेला कूरियर डिलीवरी टीम")
}

export const DEFAULT_USER_RATE_CONFIG: UserRateConfig = {
  defaultBaseRate: 13,
  defaultIncentiveRate: 2,
  incentivesEnabled: true,
  minParcelThreshold: 0,
  hubSignature: '',
};

export type UserPlanType = 'free' | 'paid';
export type UserPaymentStatus = 'active' | 'expiring_soon' | 'expired' | 'verification_pending' | 'awaiting_approval';

export interface UserSubmittedSlip {
  slipUrl: string;
  utrNumber?: string;
  submittedAt: string; // ISO date string
  amountPaid: number;
}

export interface PaymentHistoryItem {
  id: string;
  date: string; // ISO timestamp
  amount: number;
  utr?: string;
  slipUrl?: string;
  approvedBy: string; // 'admin' or admin email
  notes?: string;
  status?: string;
}

export interface UserSubscription {
  planType: UserPlanType;
  monthlyFee: number;
  validUntil: string; // ISO date string
  qrCodeUrl: string;
  paymentStatus: UserPaymentStatus;
  freeUntilDate?: string; // Optional time-bound free trial date (e.g. YYYY-MM-DD or ISO)
  lastSubmittedSlip?: UserSubmittedSlip;
  paymentHistory?: PaymentHistoryItem[];
}

export interface SubscriptionLockStatus {
  isLocked: boolean;
  reason?: 'expired' | 'awaiting_approval';
  isFreeTrialExpired?: boolean;
}

/**
 * Strict Subscription Paywall Evaluator:
 * Determines if user must be completely blocked from app dashboard.
 */
export function checkSubscriptionLock(
  sub?: UserSubscription | null,
  isSuperAdmin = false
): SubscriptionLockStatus {
  if (isSuperAdmin || !sub) return { isLocked: false };

  const now = Date.now();

  // 1. Time-Bound Free Trial (Conditional Free)
  if (sub.planType === 'free') {
    if (sub.freeUntilDate && sub.freeUntilDate.trim().length > 0) {
      const freeUntilTime = sub.freeUntilDate.length === 10
        ? new Date(`${sub.freeUntilDate}T23:59:59.999Z`).getTime()
        : new Date(sub.freeUntilDate).getTime();

      if (!isNaN(freeUntilTime) && freeUntilTime < now) {
        // Free trial period has passed: hard lock out
        return { isLocked: true, reason: 'expired', isFreeTrialExpired: true };
      }
    }
    // Free plan without expiry or still within free trial
    return { isLocked: false };
  }

  // 2. Paid Plan - Mandatory Admin Approval Lock
  if (sub.paymentStatus === 'awaiting_approval' || sub.paymentStatus === 'verification_pending') {
    return { isLocked: true, reason: 'awaiting_approval' };
  }

  // 3. Paid Plan - Check validUntil Expiry
  let isExpired = false;
  if (sub.validUntil) {
    const validTime = new Date(sub.validUntil).getTime();
    isExpired = isNaN(validTime) || validTime <= now;
  } else {
    isExpired = true;
  }

  if (isExpired || sub.paymentStatus === 'expired') {
    return { isLocked: true, reason: 'expired' };
  }

  return { isLocked: false };
}

export interface DefaultSubscriptionConfig {
  planType: UserPlanType;
  monthlyFee: number;
  trialDays: number;
  qrCodeUrl: string;
  paymentStatus: UserPaymentStatus;
}

export const DEFAULT_SUBSCRIPTION_CONFIG: DefaultSubscriptionConfig = {
  planType: 'paid',
  monthlyFee: 499,
  trialDays: 0,
  qrCodeUrl: '',
  paymentStatus: 'expired',
};

export function createDefaultUserSubscription(
  config?: Partial<DefaultSubscriptionConfig & { validUntil?: string; freeUntilDate?: string }>
): UserSubscription {
  const merged = { ...DEFAULT_SUBSCRIPTION_CONFIG, ...config };
  let validUntilStr = merged.validUntil;
  if (!validUntilStr) {
    if (merged.trialDays && merged.trialDays > 0) {
      validUntilStr = new Date(Date.now() + merged.trialDays * 24 * 60 * 60 * 1000).toISOString();
    } else {
      validUntilStr = new Date().toISOString(); // Expired by default so initial payment is required
    }
  }

  return {
    planType: merged.planType || 'paid',
    monthlyFee: typeof merged.monthlyFee === 'number' ? merged.monthlyFee : 499,
    validUntil: validUntilStr,
    qrCodeUrl: merged.qrCodeUrl || '',
    paymentStatus: merged.paymentStatus || 'expired',
    freeUntilDate: config?.freeUntilDate || '',
  };
}

export const DEFAULT_USER_SUBSCRIPTION: UserSubscription = createDefaultUserSubscription();

export interface AppUser {
  uid: string;
  email: string;
  name?: string;
  displayName: string;
  photoURL?: string;
  createdAt: string;
  lastLoginAt: string;
  status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked' | 'rejected';
  validUntil?: string; // timestamp or ISO date string (e.g. "2026-10-26T23:59:59")
  role?: 'admin' | 'user';
  totalRiders?: number;
  totalEntries?: number;
  permissions?: UserPermissions;
  rateConfig?: UserRateConfig;
  hubSignature?: string;
  subscription?: UserSubscription;
  paymentHistory?: PaymentHistoryItem[];
}

export interface UserProfileData {
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
}

export interface DateRange {
  startDate: string;
  endDate: string;
}
