import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { AppUser, DeliveryEntry, Rider, SettlementRecord } from '../types';

export interface FirebaseRechargeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  amountINR: number;
  method: 'Bank Account' | 'UPI' | 'Debit/Credit Card' | 'NetBanking';
  note?: string;
  createdAt: string;
}

export interface FirebaseStoragePolicy {
  autoCleanupEnabled: boolean;
  freeLimitMB: number;
  cleanupThresholdPercent: number;
  targetAfterCleanupPercent: number;
  retentionDays: number;
  manualConsoleUsageMB: number | null;
  manualConsoleUpdatedAt: string | null;
  lastScannedTotalMB: number;
  lastScannedAt: string | null;
  lastCleanupRunAt: string | null;
  lastCleanupDeletedCount: number;
  lastCleanupFreedKB: number;
  // Firebase Billing & Recharge Balance Ledger (Admin-managed alongside official Google Cloud Billing links)
  billingPlan: 'Spark (Free 1 GB)' | 'Blaze (Pay-as-you-go)';
  totalRechargedINR: number;
  totalSpentINR: number;
  remainingBalanceINR: number;
  lastBillingSyncedAt: string | null;
  rechargeHistory: FirebaseRechargeEntry[];
  updatedAt: string;
}

export interface UserStorageFootprint {
  uid: string;
  email: string;
  name: string;
  totalBytes: number;
  totalKB: number;
  totalMB: number;
  ridersCount: number;
  deliveriesCount: number;
  unpaidDeliveriesCount: number;
  paidDeliveriesOver2YearsCount: number;
  settlementsCount: number;
  advancesCount: number;
  incentivesCount: number;
  codLogsCount: number;
  scannedAt: string;
}

export const DEFAULT_FIREBASE_STORAGE_POLICY: FirebaseStoragePolicy = {
  autoCleanupEnabled: false, // Safe by default: Admin explicitly enables in Admin Dashboard when ready
  freeLimitMB: 1024, // 1 GB Free Tier
  cleanupThresholdPercent: 85, // Only prune >2yr Paid records if Firebase crosses 85% (~870 MB)
  targetAfterCleanupPercent: 75,
  retentionDays: 730, // 2 Years (minimum enforced floor: 365 days)
  manualConsoleUsageMB: null,
  manualConsoleUpdatedAt: null,
  lastScannedTotalMB: 0,
  lastScannedAt: null,
  lastCleanupRunAt: null,
  lastCleanupDeletedCount: 0,
  lastCleanupFreedKB: 0,
  billingPlan: 'Spark (Free 1 GB)',
  totalRechargedINR: 0,
  totalSpentINR: 0,
  remainingBalanceINR: 0,
  lastBillingSyncedAt: null,
  rechargeHistory: [],
  updatedAt: new Date().toISOString(),
};

const POLICY_DOC_REF = () => doc(db, 'system_settings', 'firebase_storage_policy');
const DOC_OVERHEAD_BYTES = 160; // Firestore document path + field metadata overhead
const INDEX_MULTIPLIER = 1.35; // Typical Firestore single-field index overhead

export function getOfficialFirebaseConsoleUrls() {
  const projectId = firebaseConfig.projectId || 'gen-lang-client-0455690392';
  const databaseId =
    firebaseConfig.firestoreDatabaseId ||
    'ai-studio-courierriderpayo-41843168-17ea-4603-a026-a68d04853b7c';

  return {
    projectId,
    databaseId,
    // Direct Google Cloud Billing & Bank Account / UPI Payment portal for this exact project
    addBalanceUrl: `https://console.cloud.google.com/billing/linkedaccount?project=${encodeURIComponent(projectId)}`,
    billingOverviewUrl: `https://console.cloud.google.com/billing?project=${encodeURIComponent(projectId)}`,
    firebaseUsageUrl: `https://console.firebase.google.com/project/${encodeURIComponent(projectId)}/usage/details`,
    firestoreStorageUrl: `https://console.firebase.google.com/project/${encodeURIComponent(projectId)}/firestore/databases/${encodeURIComponent(databaseId)}/usage`,
  };
}

export function getCutoffDateString(retentionDays: number = 730): string {
  const days = Math.max(365, Number(retentionDays) || 730);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const yyyy = cutoff.getFullYear();
  const mm = String(cutoff.getMonth() + 1).padStart(2, '0');
  const dd = String(cutoff.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const STRICT_ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_PAID_COOLDOWN_MS = 180 * 24 * 60 * 60 * 1000; // Never delete a delivery settled within the last 6 months

/**
 * 6-LOCK ACCOUNTING SAFETY GUARD:
 * Returns true ONLY if a delivery entry is 100% safe to prune from Firebase without affecting
 * even ₹0.01 of active balances, unpaid totals, advances, incentives, or rider passbooks:
 *   Lock 1: Not deleted / not in trash
 *   Lock 2: Exact status === 'Paid' (NEVER 'Unpaid', 'Pending', or blank)
 *   Lock 3: Strict YYYY-MM-DD date format (blocks DD/MM/YYYY string-comparison false positives!)
 *   Lock 4: Exact UTC timestamp is strictly older than retentionDays (min 365 days, default 730 days = 2 years)
 *   Lock 5: If paidAt timestamp is present, it must also be older than 180 days (recent settlements protected)
 *   Lock 6: Must be a DeliveryEntry only (Riders, Settlements, Advances, Incentives are NEVER passed here)
 */
export function isStrictlyEligibleOldPaidDelivery(
  d: Partial<DeliveryEntry> | null | undefined,
  retentionDays: number = 730
): boolean {
  if (!d || typeof d !== 'object') return false;
  if (d.isDeleted === true) return false;
  if (d.status !== 'Paid') return false;
  if (typeof d.date !== 'string' || !STRICT_ISO_DATE_RE.test(d.date.trim())) return false;

  const entryMs = Date.parse(`${d.date.trim()}T00:00:00Z`);
  if (isNaN(entryMs)) return false;

  const safeDays = Math.max(365, Number(retentionDays) || 730);
  const cutoffMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  if (entryMs >= cutoffMs) return false;

  if (d.paidAt) {
    const paidMs = Date.parse(String(d.paidAt));
    if (!isNaN(paidMs) && Date.now() - paidMs < MIN_PAID_COOLDOWN_MS) {
      return false;
    }
  }

  return true;
}

function estimateCollectionBytes(items: unknown[]): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  let bytes = 0;
  for (const item of items) {
    try {
      const jsonLen = JSON.stringify(item).length;
      bytes += Math.round((jsonLen + DOC_OVERHEAD_BYTES) * INDEX_MULTIPLIER);
    } catch {
      bytes += 512;
    }
  }
  return bytes;
}

export function formatStorageSize(bytes: number): string {
  const safe = Math.max(0, Number(bytes) || 0);
  if (safe < 1024) return `${safe} B`;
  const kb = safe / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function normalizeFirebaseStoragePolicy(raw?: any): FirebaseStoragePolicy {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_FIREBASE_STORAGE_POLICY };
  }
  const rechargeHistory: FirebaseRechargeEntry[] = Array.isArray(raw.rechargeHistory)
    ? raw.rechargeHistory.filter((r: any) => r && typeof r === 'object' && Number(r.amountINR) > 0)
    : [];

  const totalRechargedINR =
    typeof raw.totalRechargedINR === 'number'
      ? raw.totalRechargedINR
      : rechargeHistory.reduce((sum, r) => sum + (Number(r.amountINR) || 0), 0);
  const totalSpentINR = typeof raw.totalSpentINR === 'number' ? raw.totalSpentINR : 0;
  const remainingBalanceINR =
    typeof raw.remainingBalanceINR === 'number'
      ? raw.remainingBalanceINR
      : Math.max(0, totalRechargedINR - totalSpentINR);

  return {
    ...DEFAULT_FIREBASE_STORAGE_POLICY,
    ...raw,
    autoCleanupEnabled: raw.autoCleanupEnabled === true,
    freeLimitMB: Number(raw.freeLimitMB) > 0 ? Number(raw.freeLimitMB) : 1024,
    cleanupThresholdPercent:
      Number(raw.cleanupThresholdPercent) >= 50 && Number(raw.cleanupThresholdPercent) <= 98
        ? Number(raw.cleanupThresholdPercent)
        : 85,
    targetAfterCleanupPercent:
      Number(raw.targetAfterCleanupPercent) >= 40 && Number(raw.targetAfterCleanupPercent) <= 90
        ? Number(raw.targetAfterCleanupPercent)
        : 75,
    retentionDays: Number(raw.retentionDays) >= 365 ? Number(raw.retentionDays) : 730,
    manualConsoleUsageMB:
      raw.manualConsoleUsageMB !== null &&
      raw.manualConsoleUsageMB !== undefined &&
      !isNaN(Number(raw.manualConsoleUsageMB))
        ? Number(raw.manualConsoleUsageMB)
        : null,
    lastScannedTotalMB: Number(raw.lastScannedTotalMB) || 0,
    lastCleanupDeletedCount: Number(raw.lastCleanupDeletedCount) || 0,
    lastCleanupFreedKB: Number(raw.lastCleanupFreedKB) || 0,
    billingPlan:
      raw.billingPlan === 'Blaze (Pay-as-you-go)'
        ? 'Blaze (Pay-as-you-go)'
        : 'Spark (Free 1 GB)',
    totalRechargedINR,
    totalSpentINR,
    remainingBalanceINR,
    rechargeHistory,
  };
}

export function subscribeToFirebaseStoragePolicy(
  onUpdate: (policy: FirebaseStoragePolicy) => void
): () => void {
  return onSnapshot(
    POLICY_DOC_REF(),
    (snap) => {
      onUpdate(normalizeFirebaseStoragePolicy(snap.exists() ? snap.data() : null));
    },
    (err) => {
      console.warn('Notice subscribing to Firebase storage policy:', err);
      onUpdate({ ...DEFAULT_FIREBASE_STORAGE_POLICY });
    }
  );
}

export async function getFirebaseStoragePolicy(): Promise<FirebaseStoragePolicy> {
  try {
    const snap = await getDoc(POLICY_DOC_REF());
    return normalizeFirebaseStoragePolicy(snap.exists() ? snap.data() : null);
  } catch {
    return { ...DEFAULT_FIREBASE_STORAGE_POLICY };
  }
}

export async function saveFirebaseStoragePolicy(
  partial: Partial<FirebaseStoragePolicy>
): Promise<FirebaseStoragePolicy> {
  const existing = await getFirebaseStoragePolicy();
  const merged = normalizeFirebaseStoragePolicy({
    ...existing,
    ...partial,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(POLICY_DOC_REF(), merged, { merge: true });
  return merged;
}

/**
 * Estimates a user's workspace Firestore storage footprint from already-loaded in-memory data
 * (ZERO extra Firestore reads!).
 */
export function buildUserStorageFootprintFromMemory(
  uid: string,
  email: string,
  name: string,
  riders: Rider[],
  deliveries: DeliveryEntry[],
  settlements: SettlementRecord[],
  retentionDays: number = 730
): UserStorageFootprint {
  const advancesCount = riders.reduce((sum, r) => sum + (Array.isArray(r.advances) ? r.advances.length : 0), 0);
  const incentivesCount = riders.reduce(
    (sum, r) => sum + (Array.isArray(r.incentives) ? r.incentives.length : 0),
    0
  );
  const unpaidDeliveriesCount = deliveries.filter((d) => !d.isDeleted && d.status !== 'Paid').length;
  const paidDeliveriesOver2YearsCount = deliveries.filter((d) =>
    isStrictlyEligibleOldPaidDelivery(d, retentionDays)
  ).length;

  const ridersBytes = estimateCollectionBytes(riders);
  const deliveriesBytes = estimateCollectionBytes(deliveries);
  const settlementsBytes = estimateCollectionBytes(settlements);
  const totalBytes = ridersBytes + deliveriesBytes + settlementsBytes;

  return {
    uid,
    email,
    name,
    totalBytes,
    totalKB: Number((totalBytes / 1024).toFixed(2)),
    totalMB: Number((totalBytes / (1024 * 1024)).toFixed(4)),
    ridersCount: riders.length,
    deliveriesCount: deliveries.length,
    unpaidDeliveriesCount,
    paidDeliveriesOver2YearsCount,
    settlementsCount: settlements.length,
    advancesCount,
    incentivesCount,
    codLogsCount: 0,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Reports the logged-in user's workspace storage footprint into `all_users/{uid}.storageStats`
 * at most ONCE every 12 hours (costs only 1 lightweight write per user per 12h!).
 */
export async function reportCurrentUserStorageFootprintOncePerDay(
  uid: string,
  email: string,
  name: string,
  riders: Rider[],
  deliveries: DeliveryEntry[],
  settlements: SettlementRecord[]
): Promise<void> {
  if (!uid || uid === 'guest') return;
  const throttleKey = `cp_fb_storage_reported_${uid}`;
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  try {
    const lastTs = Number(localStorage.getItem(throttleKey) || '0');
    if (lastTs > 0 && Date.now() - lastTs < TWELVE_HOURS_MS) {
      return;
    }
  } catch {}

  try {
    const footprint = buildUserStorageFootprintFromMemory(uid, email, name, riders, deliveries, settlements, 730);
    await setDoc(
      doc(db, 'all_users', uid),
      {
        storageStats: footprint,
      },
      { merge: true }
    );
    try {
      localStorage.setItem(throttleKey, String(Date.now()));
    } catch {}
  } catch (err) {
    console.warn('Notice reporting user storage footprint:', err);
  }
}

/**
 * STRICT TWO-CONDITION FIREBASE ROLLING RETENTION ENGINE:
 * Runs at most once per 24 hours per user AFTER full server sync.
 *
 * CONDITION 1: Global Firebase usage MUST be >= cleanupThresholdPercent (default 85% of 1 GB).
 *              If space is available (< 85%), ZERO documents are deleted — even >2-year-old data stays forever!
 * CONDITION 2: Only deletes strictly >2-year-old (730+ days) FULLY PAID delivery entries (oldest first, max 40/day).
 *
 * PERMANENTLY PROTECTED (NEVER DELETED):
 * - All Riders
 * - All Settlements
 * - All Unpaid Deliveries (regardless of age)
 * - All Advances & Incentives
 * - All data from the last 2 years (730 days)
 */
export async function runSafeFirebaseRollingRetentionCheck(
  uid: string,
  deliveries: DeliveryEntry[]
): Promise<{ deletedCount: number; freedKB: number }> {
  if (!uid || uid === 'guest' || !Array.isArray(deliveries) || deliveries.length === 0) {
    return { deletedCount: 0, freedKB: 0 };
  }

  const dailyKey = `cp_fb_retention_check_${uid}`;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  try {
    const lastCheck = Number(localStorage.getItem(dailyKey) || '0');
    if (lastCheck > 0 && Date.now() - lastCheck < ONE_DAY_MS) {
      return { deletedCount: 0, freedKB: 0 };
    }
  } catch {}

  try {
    const policy = await getFirebaseStoragePolicy();
    try {
      localStorage.setItem(dailyKey, String(Date.now()));
    } catch {}

    if (!policy.autoCleanupEnabled) {
      return { deletedCount: 0, freedKB: 0 };
    }

    const effectiveUsageMB =
      policy.manualConsoleUsageMB !== null && policy.manualConsoleUsageMB >= 0
        ? policy.manualConsoleUsageMB
        : policy.lastScannedTotalMB;

    const usagePercent = policy.freeLimitMB > 0 ? (effectiveUsageMB / policy.freeLimitMB) * 100 : 0;

    // CONDITION 1 LOCK: If Firebase still has plenty of space (< 85%), keep >2-year data intact!
    if (usagePercent < policy.cleanupThresholdPercent) {
      return { deletedCount: 0, freedKB: 0 };
    }

    // CONDITION 2 LOCK: Strictly >2-year-old AND Paid deliveries ONLY (verified via 6-lock guard)
    const eligibleOldPaid = deliveries
      .filter((d) => isStrictlyEligibleOldPaidDelivery(d, policy.retentionDays))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '')); // oldest date first

    if (eligibleOldPaid.length === 0) {
      return { deletedCount: 0, freedKB: 0 };
    }

    // Prune small safe rolling batch (max 40 oldest Paid docs per 24h cycle)
    const batch = eligibleOldPaid.slice(0, 40);
    let freedBytes = 0;
    let deletedCount = 0;

    for (const entry of batch) {
      try {
        freedBytes += estimateCollectionBytes([entry]);
        await Promise.all([
          deleteDoc(doc(db, 'workspaces', uid, 'entries', entry.id)).catch(() => {}),
          deleteDoc(doc(db, 'users', uid, 'deliveries', entry.id)).catch(() => {}),
          deleteDoc(doc(db, 'deliveries', entry.id)).catch(() => {}),
        ]);
        deletedCount++;
      } catch {
        // Non-blocking per-doc safeguard
      }
    }

    return {
      deletedCount,
      freedKB: Number((freedBytes / 1024).toFixed(1)),
    };
  } catch (err) {
    console.warn('Notice running Firebase rolling retention check:', err);
    return { deletedCount: 0, freedKB: 0 };
  }
}

/**
 * Admin On-Demand Deep Scanner:
 * Scans all users' Firestore workspaces in safe parallel batches to measure exact per-user
 * memory usage and rank who uses the most Firebase storage.
 */
export async function scanAllUsersFirebaseStorage(
  users: AppUser[],
  retentionDays: number = 730,
  onProgress?: (scanned: number, total: number) => void
): Promise<{
  footprints: UserStorageFootprint[];
  totalBytes: number;
  totalMB: number;
  totalEligibleOldPaidCount: number;
}> {
  const footprints: UserStorageFootprint[] = [];
  const batchSize = 4;
  let completed = 0;

  for (let i = 0; i < users.length; i += batchSize) {
    const chunk = users.slice(i, i + batchSize);
    const results = await Promise.all(
      chunk.map(async (u): Promise<UserStorageFootprint> => {
        try {
          const [ridersSnap, entriesSnap, settlementsSnap, advancesSnap, incentivesSnap, codLogsSnap] =
            await Promise.all([
              getDocs(collection(db, 'workspaces', u.uid, 'riders')).catch(() => null),
              getDocs(collection(db, 'workspaces', u.uid, 'entries')).catch(() => null),
              getDocs(collection(db, 'workspaces', u.uid, 'settlements')).catch(() => null),
              getDocs(collection(db, 'workspaces', u.uid, 'advances')).catch(() => null),
              getDocs(collection(db, 'workspaces', u.uid, 'incentives')).catch(() => null),
              getDocs(collection(db, 'workspaces', u.uid, 'cod_audit_logs')).catch(() => null),
            ]);

          const ridersDocs = ridersSnap ? ridersSnap.docs.map((d) => d.data()) : [];
          const entriesDocs = entriesSnap ? entriesSnap.docs.map((d) => d.data() as DeliveryEntry) : [];
          const settlementsDocs = settlementsSnap ? settlementsSnap.docs.map((d) => d.data()) : [];
          const advancesDocs = advancesSnap ? advancesSnap.docs.map((d) => d.data()) : [];
          const incentivesDocs = incentivesSnap ? incentivesSnap.docs.map((d) => d.data()) : [];
          const codLogsDocs = codLogsSnap ? codLogsSnap.docs.map((d) => d.data()) : [];

          const unpaidDeliveriesCount = entriesDocs.filter(
            (d) => !d.isDeleted && d.status !== 'Paid'
          ).length;
          const paidDeliveriesOver2YearsCount = entriesDocs.filter((d) =>
            isStrictlyEligibleOldPaidDelivery(d, retentionDays)
          ).length;

          const totalBytes =
            estimateCollectionBytes(ridersDocs) +
            estimateCollectionBytes(entriesDocs) +
            estimateCollectionBytes(settlementsDocs) +
            estimateCollectionBytes(advancesDocs) +
            estimateCollectionBytes(incentivesDocs) +
            estimateCollectionBytes(codLogsDocs);

          const footprint: UserStorageFootprint = {
            uid: u.uid,
            email: u.email || '',
            name: u.displayName || u.email || 'Unknown User',
            totalBytes,
            totalKB: Number((totalBytes / 1024).toFixed(2)),
            totalMB: Number((totalBytes / (1024 * 1024)).toFixed(4)),
            ridersCount: ridersDocs.length,
            deliveriesCount: entriesDocs.length,
            unpaidDeliveriesCount,
            paidDeliveriesOver2YearsCount,
            settlementsCount: settlementsDocs.length,
            advancesCount: advancesDocs.length,
            incentivesCount: incentivesDocs.length,
            codLogsCount: codLogsDocs.length,
            scannedAt: new Date().toISOString(),
          };

          // Persist fresh per-user footprint so future Admin opens load instantly
          setDoc(doc(db, 'all_users', u.uid), { storageStats: footprint }, { merge: true }).catch(() => {});
          return footprint;
        } catch {
          const existingStats = (u as any).storageStats as UserStorageFootprint | undefined;
          return (
            existingStats || {
              uid: u.uid,
              email: u.email || '',
              name: u.displayName || u.email || 'Unknown User',
              totalBytes: 0,
              totalKB: 0,
              totalMB: 0,
              ridersCount: Number(u.totalRiders) || 0,
              deliveriesCount: Number(u.totalEntries) || 0,
              unpaidDeliveriesCount: 0,
              paidDeliveriesOver2YearsCount: 0,
              settlementsCount: 0,
              advancesCount: 0,
              incentivesCount: 0,
              codLogsCount: 0,
              scannedAt: new Date().toISOString(),
            }
          );
        }
      })
    );

    footprints.push(...results);
    completed += chunk.length;
    onProgress?.(completed, users.length);
  }

  footprints.sort((a, b) => b.totalBytes - a.totalBytes);
  const totalBytes = footprints.reduce((sum, f) => sum + f.totalBytes, 0);
  const totalMB = Number((totalBytes / (1024 * 1024)).toFixed(3));
  const totalEligibleOldPaidCount = footprints.reduce((sum, f) => sum + f.paidDeliveriesOver2YearsCount, 0);

  // Save scanned total into central storage policy so all clients know real DB utilization
  await saveFirebaseStoragePolicy({
    lastScannedTotalMB: totalMB,
    lastScannedAt: new Date().toISOString(),
  }).catch(() => {});

  return {
    footprints,
    totalBytes,
    totalMB,
    totalEligibleOldPaidCount,
  };
}

/**
 * Admin Manual Safe Cleanup (>2-Year-Old PAID Deliveries ONLY):
 * Never deletes Riders, Settlements, Unpaid Deliveries, Advances, Incentives, or recent 2-year data.
 */
export async function runAdminOldPaidDeliveriesCleanup(
  users: AppUser[],
  retentionDays: number = 730
): Promise<{ deletedCount: number; freedKB: number; affectedUsers: number }> {
  const safeDays = Math.max(365, Number(retentionDays) || 730);
  const cutoffMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  let deletedCount = 0;
  let freedBytes = 0;
  let affectedUsers = 0;

  for (const u of users) {
    try {
      let userCleaned = false;

      // Priority 1 (0% accounting impact): Prune >2-year-old automated backup snapshots in workspace
      const backupsSnap = await getDocs(collection(db, 'workspaces', u.uid, 'auto_backups')).catch(() => null);
      if (backupsSnap && !backupsSnap.empty) {
        for (const bDoc of backupsSnap.docs) {
          const bData = bDoc.data() as any;
          const bDateStr = typeof bData?.date === 'string' ? bData.date.trim() : '';
          const bTime = STRICT_ISO_DATE_RE.test(bDateStr)
            ? Date.parse(`${bDateStr}T00:00:00Z`)
            : Date.parse(String(bData?.createdAt || ''));
          if (!isNaN(bTime) && bTime < cutoffMs) {
            freedBytes += estimateCollectionBytes([bData]);
            await deleteDoc(doc(db, 'workspaces', u.uid, 'auto_backups', bDoc.id)).catch(() => {});
            deletedCount++;
            userCleaned = true;
          }
        }
      }

      // Priority 2 (6-lock guarded): Strictly >2-year-old PAID daily delivery entries ONLY
      const entriesSnap = await getDocs(collection(db, 'workspaces', u.uid, 'entries'));
      const oldPaidDocs = entriesSnap.docs.filter((docSnap) => {
        const d = docSnap.data() as DeliveryEntry;
        return isStrictlyEligibleOldPaidDelivery(d, safeDays);
      });

      for (const docSnap of oldPaidDocs) {
        const data = docSnap.data();
        freedBytes += estimateCollectionBytes([data]);
        await Promise.all([
          deleteDoc(doc(db, 'workspaces', u.uid, 'entries', docSnap.id)).catch(() => {}),
          deleteDoc(doc(db, 'users', u.uid, 'deliveries', docSnap.id)).catch(() => {}),
          deleteDoc(doc(db, 'deliveries', docSnap.id)).catch(() => {}),
        ]);
        deletedCount++;
        userCleaned = true;
      }

      if (userCleaned) {
        affectedUsers++;
      }
    } catch {
      // Continue safely with remaining users
    }
  }

  const freedKB = Number((freedBytes / 1024).toFixed(1));
  await saveFirebaseStoragePolicy({
    lastCleanupRunAt: new Date().toISOString(),
    lastCleanupDeletedCount: deletedCount,
    lastCleanupFreedKB: freedKB,
  }).catch(() => {});

  return { deletedCount, freedKB, affectedUsers };
}
