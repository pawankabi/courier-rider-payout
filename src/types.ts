export interface RiderAdvanceEntry {
  id: string;
  riderId: string;
  riderName?: string;
  riderPhone?: string;
  amount: number;
  remainingAmount?: number;
  date?: string; // Optional date (YYYY-MM-DD or empty)
  reason?: string; // e.g. "Bike repair", "Fuel", "Festival emergency"
  runningBalance?: number; // previousAdvanceTotal + newAdvanceAmount = currentTotalAdvance
  createdAt: string; // ISO string
  updatedAt?: string; // Optional update timestamp
  createdBy?: string;
  settlementId?: string;
  isSettled?: boolean;
  isDeducted?: boolean;
  settledPayoutId?: string;
  settledInPayoutId?: string;
  status?: 'PAID' | 'UNPAID' | string;
  isRecovery?: boolean; // Cash received from rider / advance recovery (Credit)
  type?: 'advance' | 'recovery';
}

export interface RiderIncentiveEntry {
  id: string;
  riderId: string;
  riderName?: string;
  riderPhone?: string;
  amount: number;
  date: string; // YYYY-MM-DD
  reason: string; // e.g. "त्यौहार बोनस", "बढ़िया परफॉर्मेंस", "अतिरिक्त माइलेज", "अतिरिक्त जमा: Cash"
  createdAt: string; // ISO string
  createdBy?: string;
  settlementId?: string;
  isSettled?: boolean;
  isPaid?: boolean;
  settledPayoutId?: string;
  settledInPayoutId?: string;
  status?: 'PAID' | 'UNPAID' | string;
  source?: 'manual' | 'surplus';
}

export interface Rider {
  id: string;
  name: string;
  phone: string; // 10-digit WhatsApp number
  vehicleType?: string;
  joinedDate: string;
  active: boolean;
  status?: 'active' | 'inactive';
  order?: number; // custom display sequence order index
  baseRate?: number; // custom base payout per parcel (e.g. ₹13 or admin-configured)
  incentiveRate?: number; // custom incentive rate per parcel (e.g. ₹2 or admin-configured)
  incentiveEnabled?: boolean; // toggle whether incentive is enabled for this specific rider
  createdBy?: string; // UID or email of user who registered the rider
  createdByEmail?: string; // Email of user who registered the rider
  workspaceId?: string; // Workspace UID isolation tag
  userId?: string; // Associated User UID
  hubId?: string; // Associated Hub isolation tag
  ownerUid?: string; // Associated Owner UID tag
  totalAdvance?: number; // Running advance balance
  advances?: RiderAdvanceEntry[]; // Detailed advance payment records
  totalIncentive?: number; // Running incentive & bonus earnings
  incentives?: RiderIncentiveEntry[]; // Detailed incentive & bonus records
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
  totalIncentive?: number;
  incentives?: RiderIncentiveEntry[];
  salaries: {
    id: string;
    startDate: string;
    endDate: string;
    totalParcels: number;
    baseAmount: number;
    incentiveAmount: number;
    grossTotal: number;
    advanceAmount: number;
    advanceDate?: string;
    advanceReason?: string;
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
  openingBalance?: number;
  openingBalanceType?: 'payable' | 'rider_debt' | 'zero';
  settledIncentiveIds?: string[];
  settledAdvanceIds?: string[];
}

export type TabType = 'entry' | 'riders' | 'advance' | 'incentive' | 'reports' | 'settlement' | 'festivals' | 'admin';

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
  codCompanionAccess?: boolean; // Super Admin access toggle for COD Entry Companion App
  isCodAccessEnabled?: boolean; // Strict tenant/admin permission flag for COD Access
  hasCodPermission?: boolean; // Strict tenant/admin permission flag for COD Access
  codShareLinkVisibility?: boolean; // Allow COD Share Link Visibility (शेयर लिंक अनुमति)
  allowRiderDeliveryCountInput?: boolean; // Rider App: Allow Delivery Count Input (डिलीवरी पार्सल इनपुट दिखाएं)
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
  codCompanionAccess: false, // Default State: OFF for all existing and newly created hub accounts (only Master Super Admin has it active by default)
  isCodAccessEnabled: false, // Default State: OFF (false)
  hasCodPermission: false, // Default State: OFF (false)
  codShareLinkVisibility: false, // Default State: OFF (false)
  allowRiderDeliveryCountInput: false, // Default State: OFF (false)
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
  isPro?: boolean;
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
  codCompanies?: string[]; // Dynamic courier companies configured for this hub
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
  codCompanies?: string[]; // Dynamic courier companies configured for this hub
  rawDoc?: any;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

// ==========================================
// COD हिसाब-किताब Sub-Module Types & RBAC
// ==========================================

export type CodStaffRole = 'rider' | 'team_leader' | 'supervisor' | 'hub_incharge';

export interface CodStaffUser {
  id: string; // riderId or unique staffId
  riderId?: string; // linked rider id if role === 'rider'
  name: string;
  phone?: string;
  role: CodStaffRole;
  pin: string; // 4-digit numeric PIN
  isActive: boolean;
  canVerifyCod?: boolean; // Permission: Can verify Company 1 & 2 COD
  canVerifyCash?: boolean; // Permission: Can verify Cash Deposit
  canVerifyOnline?: boolean; // Permission: Can verify Online UPI / QR Deposit
  canEditEntries?: boolean; // Permission: Can edit rider rows & amounts (Strictly false by default for all staff)
  createdAt: string;
  updatedAt?: string;
  hubId?: string; // Parent Hub / Owner account UID for multi-tenant isolation
  ownerUid?: string; // Owner UID
  workspaceId?: string; // Workspace UID
  userId?: string; // Associated User UID
  createdBy?: string; // Creator UID
}

export interface CodAuditLog {
  id: string;
  timestamp: string; // ISO string
  changedBy: string; // Name or ID of user who edited
  role: CodStaffRole | 'owner';
  riderId: string;
  riderName: string;
  date: string; // YYYY-MM-DD
  field: string;
  previousValue: string | number;
  newValue: string | number;
  notes?: string;
}

export interface CodCompanyConfig {
  id: string;
  name: string; // e.g. "Valmo COD" or "Xpressbees COD"
  code: string; // e.g. "company1", "company2"
  isActive: boolean;
}

export const DEFAULT_COD_COMPANIES: string[] = ['Valmo', 'Xpressbees'];

export type DenominationValue = 2000 | 500 | 200 | 100 | 50 | 20 | 10 | 5 | 2 | 1;

export const STANDARD_DENOMINATIONS: DenominationValue[] = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

export interface CashDenomination {
  2000?: number;
  500?: number;
  200?: number;
  100?: number;
  50?: number;
  20?: number;
  10?: number;
  5?: number;
  2?: number;
  1?: number;
  totalNotes?: number; // Total count of physical notes
  total: number; // Grand total amount in ₹
  notes?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface CodDailyEntry {
  id: string; // unique key, e.g. `cod_${date}_${riderId}`
  date: string; // YYYY-MM-DD
  riderId: string;
  riderName: string;
  riderPhone?: string;
  company1Amount: number; // e.g., Valmo COD
  company1Verified?: boolean;
  company1VerifiedBy?: string;
  company1VerifiedAt?: string;
  company2Amount: number; // e.g., Xpressbees COD
  company2Verified?: boolean;
  company2VerifiedBy?: string;
  company2VerifiedAt?: string;
  companyAmounts?: Record<string, number>; // Dynamic per-company COD collection amounts
  deliveryCount?: number; // Daily delivery parcel count
  totalCod: number; // Auto-calculated: sum of all company amounts
  cashDeposit: number; // Rider physical cash handed in
  cashDenomination?: CashDenomination; // Structured breakdown of cash notes
  isCashLocked?: boolean; // Automatic submission lock & Admin manual override
  cashLockedAt?: string;
  cashLockedBy?: string;
  cashVerified?: boolean;
  cashVerifiedBy?: string;
  cashVerifiedAt?: string;
  onlineDeposit: number; // UPI / QR payments
  onlineVerified?: boolean;
  onlineVerifiedBy?: string;
  onlineVerifiedAt?: string;
  totalDeposit: number; // Auto-calculated: cashDeposit + onlineDeposit
  balance: number; // Total COD - Total Deposit (positive = shortage/due, 0 = settled, negative = surplus)
  
  // COD Shortage Auto-Calculation & 1-Click Advance Conversion
  shortageAmount?: number;
  shortageStatus?: 'PENDING' | 'CLEARED' | 'CONVERTED_TO_ADVANCE' | string;
  shortageConvertedAt?: string;
  shortageConvertedBy?: string;
  shortageAdvanceId?: string;
  balanceSyncedToAdvance?: boolean;
  balanceSyncedToIncentive?: boolean;
  syncedAdvanceId?: string;
  syncedIncentiveId?: string;

  // Per-Field Discrepancy & Shortage Tracking
  company1Shortage?: number; // Short amount
  company1ActualReceived?: number; // Actual amount collected/received
  company1ShortageNotes?: string;
  company1ShortageFlaggedBy?: string;
  company1ShortageFlaggedAt?: string;
  company1SyncedToAdvance?: boolean;

  company2Shortage?: number;
  company2ActualReceived?: number;
  company2ShortageNotes?: string;
  company2ShortageFlaggedBy?: string;
  company2ShortageFlaggedAt?: string;
  company2SyncedToAdvance?: boolean;

  cashShortage?: number;
  cashActualReceived?: number;
  cashShortageNotes?: string;
  cashShortageFlaggedBy?: string;
  cashShortageFlaggedAt?: string;
  cashSyncedToAdvance?: boolean;

  onlineShortage?: number;
  onlineActualReceived?: number;
  onlineShortageNotes?: string;
  onlineShortageFlaggedBy?: string;
  onlineShortageFlaggedAt?: string;
  onlineSyncedToAdvance?: boolean;

  status: 'draft' | 'submitted' | 'verified' | 'locked';
  submittedAt?: string;
  submittedBy?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  lockedAt?: string;
  notes?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface CodSettings {
  isEnabled: boolean; // Feature flag for standard users
  company1Name: string; // Default: 'Valmo COD'
  company2Name: string; // Default: 'Xpressbees COD'
  defaultLockTime?: string; // e.g. "23:00"
  updatedAt: string;
}

export interface CashWithdrawalRecord {
  id: string; // unique id e.g. wth_1712345678_abcd
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  dateTime: string; // Display date & time string e.g. "2026-10-18 14:30"
  recipientOrPurpose: string; // e.g. "Bank Deposit (SBI)", "Hub Fuel", "Vendor Payment"
  withdrawnBy?: string; // Admin / Staff name
  notesBreakdown: Partial<Record<DenominationValue, number>>; // e.g. { 500: 100, 200: 50 }
  totalNotes: number; // Sum of withdrawn notes
  totalAmount: number; // Total cash withdrawn in ₹
  notes?: string;
  createdAt: string; // ISO string
}

export interface DailyCodSheetData {
  date: string;
  entries: CodDailyEntry[];
  isLocked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  company1Name?: string;
  company2Name?: string;
  hubName?: string;
  hubId?: string; // Hub / Owner account UID for multi-tenant isolation
  ownerUid?: string; // Owner UID
  consolidatedDenominations?: CashDenomination; // Aggregated daily cash note denomination summary
  cashWithdrawals?: CashWithdrawalRecord[]; // Cash Outward & Vault Withdrawal logs
  updatedAt?: string;
}


