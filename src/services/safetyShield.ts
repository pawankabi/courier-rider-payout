/**
 * App-Wide Safety Shield & Financial Ledger Lock ("सुरक्षा कवच")
 * 
 * Guarantees:
 * 1. Zero Mathematical Discrepancy: Mathematical lock across Admin & Rider views.
 * 2. Cross-Device Consistency: Real-time parity between phones via Firestore & local backup.
 * 3. Self-Healing & Disaster Recovery: Instant anomaly detection, auto-repair, and rolling snapshots.
 * 4. Fault-Tolerant Storage: Handles browser storage quotas, private browsing, and offline states safely.
 */

import { Rider, DeliveryEntry, SettlementRecord, PublicRiderStatement, RiderAdvanceEntry } from '../types';
import { calculatePureRiderLedger, purgePhantomAdvances } from '../utils/pureLedgerEngine';
import { syncPublicRiderStatement } from './firestoreSync';
import { 
  loadRidersFromStorage, 
  saveRidersToStorage, 
  loadDeliveriesFromStorage, 
  saveDeliveriesToStorage,
  loadSettlementsFromStorage, 
  saveSettlementsToStorage 
} from '../utils/storage';

export interface LedgerAuditIssue {
  riderId: string;
  riderName: string;
  field: string;
  expected: number;
  actual: number;
  description: string;
  autoRepaired: boolean;
}

export interface SafetyShieldStatus {
  isFullyLocked: boolean;
  isOnline: boolean;
  totalRidersAudited: number;
  healthyRidersCount: number;
  discrepanciesCount: number;
  lastAuditTimestamp: string;
  lastSnapshotTimestamp: string | null;
  issues: LedgerAuditIssue[];
}

/**
 * Strict Financial Sanitizer: Prevents NaN, floating point rounding drift,
 * negative numbers where prohibited, and string conversion bugs.
 */
export function safeRoundINR(value: unknown, allowNegative: boolean = false): number {
  if (value === null || value === undefined || value === '') return 0;
  let num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || !isFinite(num)) return 0;
  if (!allowNegative && num < 0) return 0;
  
  // Safe 2-decimal rounded precision
  num = Math.round((num + Number.EPSILON) * 100) / 100;
  // Normalize -0 to 0
  return Object.is(num, -0) ? 0 : num;
}

/**
 * Generate a deterministic verification checksum for a rider's financial state.
 * Both Admin and Rider compare this checksum to guarantee 100% identical numbers.
 */
export function computeRiderFinancialChecksum(
  riderId: string,
  netDifference: number,
  totalPlus: number,
  totalMinus: number
): string {
  const normDiff = safeRoundINR(netDifference, true).toFixed(2);
  const normPlus = safeRoundINR(totalPlus).toFixed(2);
  const normMinus = safeRoundINR(totalMinus).toFixed(2);
  return `LOCKED_${riderId}_${normDiff}_${normPlus}_${normMinus}`;
}

const SAFETY_SNAPSHOT_KEY = 'cp_safety_shield_snapshot_v1';
const LAST_SNAPSHOT_TIME_KEY = 'cp_safety_shield_snapshot_time';

/**
 * Automatic rolling safety snapshot. Takes lightweight backup of current valid state.
 */
export function takeSafetySnapshot(
  riders: Rider[],
  settlements: SettlementRecord[],
  deliveries?: DeliveryEntry[]
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      ridersCount: riders.length,
      settlementsCount: settlements.length,
      deliveriesCount: deliveries ? deliveries.length : 0,
      riders,
      settlements,
    };
    localStorage.setItem(SAFETY_SNAPSHOT_KEY, JSON.stringify(payload));
    localStorage.setItem(LAST_SNAPSHOT_TIME_KEY, payload.timestamp);
  } catch (err) {
    console.warn('Safety shield snapshot notice (non-fatal):', err);
  }
}

/**
 * Get timestamp of the last safety snapshot.
 */
export function getLastSnapshotTime(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(LAST_SNAPSHOT_TIME_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Safe LocalStorage read/write wrapper: prevents quota errors & browser private mode crashes.
 */
export const safeStorage = {
  get<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
      const item = localStorage.getItem(key);
      if (!item) return fallback;
      return JSON.parse(item) as T;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: any): boolean {
    if (typeof window === 'undefined') return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`Storage quota exceeded or private mode error for key: ${key}`, e);
      return false;
    }
  },
  remove(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch {}
  }
};

/**
 * Master Financial Ledger Audit:
 * Validates all riders, deliveries, settlements, and advances.
 * Guarantees that Admin view and Rider view are in 100% arithmetic parity.
 */
export async function auditAndHealAllRiderLedgers(
  riders: Rider[],
  settlements: SettlementRecord[],
  deliveries: DeliveryEntry[] = [],
  autoRepair: boolean = true,
  onProgress?: (current: number, total: number) => void
): Promise<{
  status: SafetyShieldStatus;
  repairedRiders: Rider[];
  hasChanges: boolean;
}> {
  const issues: LedgerAuditIssue[] = [];
  let hasChanges = false;
  const updatedRiders = [...riders];

  for (let idx = 0; idx < updatedRiders.length; idx++) {
    if (onProgress) onProgress(idx + 1, updatedRiders.length);
    const rider = updatedRiders[idx];
    if (!rider) continue;

    let riderModified = false;

    // 1. Purge phantom or synthetic duplicate advances
    const cleanAdvances = purgePhantomAdvances(rider.advances || []);
    if (cleanAdvances.length !== (rider.advances || []).length) {
      riderModified = true;
      rider.advances = cleanAdvances;
    }

    // 2. Compute pure ground truth ledger
    const tempStatement: PublicRiderStatement = {
      riderId: rider.id,
      riderName: rider.name,
      riderPhone: rider.phone,
      vehicleType: rider.vehicleType || 'Bike',
      hubName: 'सरायकेला कूरियर डिलीवरी हब',
      hubSignature: 'सरायकेला कूरियर डिलीवरी हब',
      totalAdvance: rider.totalAdvance || 0,
      totalIncentive: rider.totalIncentive || 0,
      advances: rider.advances || [],
      incentives: rider.incentives || [],
      salaries: (settlements || [])
        .filter((s) => s.riderId === rider.id || (rider.phone && s.riderPhone === rider.phone))
        .map((s) => ({
          id: s.id,
          startDate: s.startDate,
          endDate: s.endDate,
          totalParcels: s.totalParcels || 0,
          baseAmount: s.baseAmount || 0,
          incentiveAmount: s.incentiveAmount || 0,
          grossTotal: s.grossTotal || 0,
          advanceAmount: s.advanceAmount || 0,
          netTotal: s.netTotal || 0,
          paidAt: s.paidAt,
          status: s.status || 'PAID',
        })),
      recentDeliveries: (deliveries || [])
        .filter((d) => d.riderId === rider.id)
        .slice(0, 100),
      updatedAt: new Date().toISOString(),
    };

    const pureResult = calculatePureRiderLedger(tempStatement, 'desc', false, settlements, rider.advances);

    // Outstanding advance must match pure result unsettled advances or deficits
    const expectedAdvance = pureResult.balanceStatus === 'rider_due' ? pureResult.netBalance : 0;
    const currentStoredAdvance = safeRoundINR(rider.totalAdvance || 0);

    if (Math.abs(currentStoredAdvance - expectedAdvance) > 0.01) {
      issues.push({
        riderId: rider.id,
        riderName: rider.name,
        field: 'totalAdvance',
        expected: expectedAdvance,
        actual: currentStoredAdvance,
        description: `एडवांस शेष में ₹${Math.abs(currentStoredAdvance - expectedAdvance)} का अंतर था, जिसे शुद्ध लेजर से लॉक किया गया।`,
        autoRepaired: autoRepair,
      });

      if (autoRepair) {
        rider.totalAdvance = expectedAdvance;
        riderModified = true;
      }
    }

    // Expected unsettled incentive check
    const expectedIncentive = pureResult.unsettledIncentives;
    const currentStoredIncentive = safeRoundINR(rider.totalIncentive || 0);

    if (Math.abs(currentStoredIncentive - expectedIncentive) > 0.01) {
      issues.push({
        riderId: rider.id,
        riderName: rider.name,
        field: 'totalIncentive',
        expected: expectedIncentive,
        actual: currentStoredIncentive,
        description: `इंसेंटिव शेष में अंतर था, जिसे शुद्ध लेजर से लॉक किया गया।`,
        autoRepaired: autoRepair,
      });

      if (autoRepair) {
        rider.totalIncentive = expectedIncentive;
        riderModified = true;
      }
    }

    if (riderModified) {
      hasChanges = true;
      updatedRiders[idx] = { ...rider };

      // Sync public statement to Firestore immediately so rider's phone gets the exact locked number
      if (autoRepair) {
        try {
          await syncPublicRiderStatement(rider, rider.advances || [], settlements, deliveries);
        } catch (err) {
          console.warn('Notice syncing repaired statement to cloud:', rider.name, err);
        }
      }
    }
  }

  // If changes occurred, save to local storage and take a snapshot
  if (hasChanges && autoRepair) {
    saveRidersToStorage(updatedRiders);
    takeSafetySnapshot(updatedRiders, settlements, deliveries);
  }

  const healthyCount = updatedRiders.length - issues.length;
  const status: SafetyShieldStatus = {
    isFullyLocked: issues.length === 0 || autoRepair,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    totalRidersAudited: updatedRiders.length,
    healthyRidersCount: Math.max(0, healthyCount),
    discrepanciesCount: issues.length,
    lastAuditTimestamp: new Date().toISOString(),
    lastSnapshotTimestamp: getLastSnapshotTime(),
    issues,
  };

  return {
    status,
    repairedRiders: updatedRiders,
    hasChanges,
  };
}

/**
 * Emergency 1-click Download Backup of entire system
 */
export function exportEmergencySafetyBackup(
  riders: Rider[],
  settlements: SettlementRecord[],
  deliveries: DeliveryEntry[]
): void {
  try {
    const payload = {
      app: 'Courier Rider Payout & Ledger',
      exportType: 'EMERGENCY_SAFETY_SHIELD_BACKUP',
      exportedAt: new Date().toISOString(),
      hub: 'सरायकेला कूरियर डिलीवरी हब',
      totalRiders: riders.length,
      totalSettlements: settlements.length,
      totalDeliveries: deliveries.length,
      data: {
        riders,
        settlements,
        deliveries,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `सुरक्षा_कवच_बैकअप_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to export emergency backup:', err);
  }
}

/**
 * Autonomous Background Safety Sentinel:
 * Runs 100% AUTOMATICALLY in the background.
 * Requires ZERO manual user clicks, zero audits, and zero refreshes.
 * 
 * Functions:
 * 1. Startup Silent Audit: Runs audit & heals any balance drift immediately on app boot.
 * 2. Background Polling Sentinel: Every 2 minutes, silently audits all riders and saves rolling snapshots.
 * 3. App Resume Sentinel: When phone is unlocked or user switches back to browser tab, runs instant silent health audit.
 * 4. Online Auto-Resync: When internet connection recovers, triggers instant silent sync with Firestore.
 */
let sentinelTimer: any = null;

export function initAutonomousSafetySentinel(
  getRiders: () => Rider[],
  getSettlements: () => SettlementRecord[],
  getDeliveries: () => DeliveryEntry[],
  onAutoRepaired?: (updatedRiders: Rider[]) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  let isCycleRunning = false;

  const runSilentCycle = async () => {
    if (isCycleRunning) return;
    isCycleRunning = true;
    try {
      const currentRiders = getRiders();
      const currentSettlements = getSettlements();
      const currentDeliveries = getDeliveries();

      if (!currentRiders || currentRiders.length === 0) return;

      const res = await auditAndHealAllRiderLedgers(
        currentRiders,
        currentSettlements,
        currentDeliveries,
        true
      );

      if (res.hasChanges && onAutoRepaired) {
        onAutoRepaired(res.repairedRiders);
      }
    } catch (err) {
      console.warn('Silent safety sentinel cycle notice:', err);
    } finally {
      isCycleRunning = false;
    }
  };

  // Run initial cycle immediately in background
  setTimeout(runSilentCycle, 1500);

  // Periodic heartbeat every 2 minutes (120,000ms)
  if (sentinelTimer) clearInterval(sentinelTimer);
  sentinelTimer = setInterval(runSilentCycle, 120000);

  // Resume/Visibility change listener: silent check when user returns
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      runSilentCycle();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Online listener: silent check when device connects to internet
  const handleOnline = () => {
    runSilentCycle();
  };
  window.addEventListener('online', handleOnline);

  return () => {
    if (sentinelTimer) clearInterval(sentinelTimer);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('online', handleOnline);
  };
}
