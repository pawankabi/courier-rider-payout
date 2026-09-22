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
  baseAmount: number; // parcels * baseRate
  incentiveAmount: number; // parcels * (hasIncentive ? incentiveRate : 0)
  totalEarnings: number; // baseAmount + incentiveAmount
  status: 'Unpaid' | 'Paid';
  paidAt?: string;
  advanceAmount?: number;
  advanceDate?: string;
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

export interface AppUser {
  uid: string;
  email: string;
  name?: string;
  displayName: string;
  photoURL?: string;
  createdAt: string;
  lastLoginAt: string;
  status: 'pending' | 'active' | 'approved' | 'deactivated' | 'blocked';
  role?: 'admin' | 'user';
  totalRiders?: number;
  totalEntries?: number;
  permissions?: UserPermissions;
  rateConfig?: UserRateConfig;
  hubSignature?: string;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}
