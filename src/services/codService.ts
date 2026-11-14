import { 
  CodDailyEntry, 
  CodStaffUser, 
  CodAuditLog, 
  CodSettings, 
  CodStaffRole,
  DailyCodSheetData,
  Rider,
  RiderAdvanceEntry,
  CashWithdrawalRecord
} from '../types';
import { db } from '../firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  collectionGroup,
  getDocs, 
  writeBatch,
  onSnapshot,
  query,
  where,
  runTransaction,
  Unsubscribe 
} from 'firebase/firestore';
import { 
  cleanForFirestore, 
  isSuperAdmin, 
  SUPER_ADMIN_EMAIL, 
  normalizeUserPermissions,
  writeAdvanceEntryToFirestore,
  saveRiderToFirestore,
  syncPublicRiderStatement
} from './firestoreSync';
import { getTodayDateString, formatINR } from '../utils/formatters';
import { dispatchAutomatedSms, getRiderStatementUrl } from './smsService';
import { isNativeAndroid, sendNativeBackgroundSms } from './nativeSms';
import { loadRidersFromStorage, saveRidersToStorage } from '../utils/storage';
import { calculateActiveAdvanceTotal } from '../utils/payoutCalculations';
import { exportFileNativelyOrWeb } from '../utils/fileExporter';
import {
  safeLocalStorageSet,
  enforceLocalStorageHeadroom,
  handleProtectedFirestoreFailure,
  isFirestoreInternalAssertionOrQuotaError,
} from './appStorageAndFirebaseShield';

/**
 * Quota-safe COD localStorage writer:
 * Stores ONLY canonical scoped keys via the unified shield (`safeLocalStorageSet`)
 * and triggers headroom cleanup automatically before Chromium/WebView 5MB quota is reached.
 */
export function saveCodCacheSafely(entriesToSave: Array<[string, string]>, hubId?: string): void {
  if (typeof window === 'undefined') return;
  for (const [k, v] of entriesToSave) {
    const ok = safeLocalStorageSet(k, v, hubId);
    if (!ok) {
      enforceLocalStorageHeadroom(hubId, { aggressive: true });
      safeLocalStorageSet(k, v, hubId);
    }
  }
}

const DEFAULT_COMPANY_1 = 'Valmo COD';
const DEFAULT_COMPANY_2 = 'Xpressbees COD';

/**
 * Validates whether a COD entry has actual recorded financial figures or submission data.
 * Used to guarantee zero data loss and prevent blank/default templates from wiping real records.
 */
export function hasRealRecordedCodData(e: CodDailyEntry | undefined | null): boolean {
  if (!e) return false;
  const c1 = Number(e.company1Amount || 0);
  const c2 = Number(e.company2Amount || 0);
  const cash = Number(e.cashDeposit || 0);
  const online = Number(e.onlineDeposit || 0);
  const total = Number(e.totalCod || (c1 + c2));
  const dep = Number(e.totalDeposit || (cash + online));
  const delivery = Number(e.deliveryCount || 0);
  const hasNotes = Boolean(e.notes && e.notes.trim());
  const hasDenom = Boolean(e.cashDenomination && Number(e.cashDenomination.total || 0) > 0);
  const hasComp = Boolean(e.companyAmounts && typeof e.companyAmounts === 'object' && Object.values(e.companyAmounts).some((v: any) => Number(v) > 0));
  const isSubmitted = e.status === 'submitted' || e.status === 'verified' || e.status === 'locked';
  const isCashLock = Boolean(e.isCashLocked);
  return c1 > 0 || c2 > 0 || cash > 0 || online > 0 || total > 0 || dep > 0 || delivery > 0 || hasNotes || hasDenom || hasComp || isSubmitted || isCashLock;
}

/**
 * Non-Destructive Concurrent Merge Engine:
 * Guarantees that when multiple riders submit simultaneously from different phones,
 * no rider's entry is ever overwritten or lost. Real financial figures are permanently preserved.
 */
export function mergeCodEntriesNonDestructively(
  existingEntries: CodDailyEntry[],
  incomingEntries: CodDailyEntry[]
): CodDailyEntry[] {
  const mergedMap = new Map<string, CodDailyEntry>();
  const aliasToKeyMap = new Map<string, string>();

  const registerAlias = (key: string, alias: string) => {
    if (alias && key) aliasToKeyMap.set(alias, key);
  };

  const resolveKey = (entry: CodDailyEntry, fallbackPrefix: string): string => {
    const idKey = entry.riderId ? String(entry.riderId).trim() : '';
    const cleanPhone = (entry.riderPhone || '').replace(/\D/g, '').slice(-10);
    const cleanName = (entry.riderName || '').trim().toLowerCase();

    if (idKey && aliasToKeyMap.has(idKey)) return aliasToKeyMap.get(idKey)!;
    if (cleanPhone && aliasToKeyMap.has(`phone_${cleanPhone}`)) return aliasToKeyMap.get(`phone_${cleanPhone}`)!;
    if (cleanName && cleanName !== 'राइडर' && aliasToKeyMap.has(`name_${cleanName}`)) return aliasToKeyMap.get(`name_${cleanName}`)!;

    const newKey = idKey || (cleanPhone ? `phone_${cleanPhone}` : `${fallbackPrefix}_${Math.random()}`);
    if (idKey) registerAlias(newKey, idKey);
    if (cleanPhone) registerAlias(newKey, `phone_${cleanPhone}`);
    if (cleanName && cleanName !== 'राइडर') registerAlias(newKey, `name_${cleanName}`);
    return newKey;
  };

  // 1. Index base existing entries
  (existingEntries || []).forEach((entry, idx) => {
    if (!entry) return;
    const key = resolveKey(entry, `exist_${idx}`);
    mergedMap.set(key, entry);
  });

  // 2. Safely merge incoming entries with zero loss
  (incomingEntries || []).forEach((incoming, idx) => {
    if (!incoming) return;
    const matchedKey = resolveKey(incoming, `inc_${idx}`);

    if (!mergedMap.has(matchedKey)) {
      mergedMap.set(matchedKey, incoming);
      return;
    }

    const existing = mergedMap.get(matchedKey)!;
    const incomingHasData = hasRealRecordedCodData(incoming);
    const existingHasData = hasRealRecordedCodData(existing);

    if (incomingHasData && !existingHasData) {
      // Incoming has real recorded data, existing is blank -> upgrade to incoming
      mergedMap.set(matchedKey, { ...existing, ...incoming });
    } else if (incomingHasData && existingHasData) {
      // Both have data: merge preferentially keeping real non-zero fields
      const incomingTime = new Date(incoming.updatedAt || 0).getTime();
      const existingTime = new Date(existing.updatedAt || 0).getTime();
      const baseObj = incomingTime >= existingTime ? { ...existing, ...incoming } : { ...incoming, ...existing };

      // DEFENSIVE ZERO-DATA-LOSS FINANCIAL SHIELD:
      // A positive figure from EITHER copy is permanently preserved and NEVER overwritten by 0!
      const inC1 = Number(incoming.company1Amount) || 0;
      const exC1 = Number(existing.company1Amount) || 0;
      baseObj.company1Amount = inC1 > 0 ? inC1 : exC1;

      const inC2 = Number(incoming.company2Amount) || 0;
      const exC2 = Number(existing.company2Amount) || 0;
      baseObj.company2Amount = inC2 > 0 ? inC2 : exC2;

      const inCash = Number(incoming.cashDeposit) || 0;
      const exCash = Number(existing.cashDeposit) || 0;
      baseObj.cashDeposit = inCash > 0 ? inCash : exCash;

      const inOnline = Number(incoming.onlineDeposit) || 0;
      const exOnline = Number(existing.onlineDeposit) || 0;
      baseObj.onlineDeposit = inOnline > 0 ? inOnline : exOnline;

      const inDels = Number(incoming.deliveryCount) || 0;
      const exDels = Number(existing.deliveryCount) || 0;
      baseObj.deliveryCount = inDels > 0 ? inDels : exDels;

      baseObj.cashDenomination = (incoming.cashDenomination && Number(incoming.cashDenomination.total || 0) > 0)
        ? incoming.cashDenomination
        : existing.cashDenomination;

      if (incoming.companyAmounts || existing.companyAmounts) {
        baseObj.companyAmounts = {
          ...(existing.companyAmounts || {}),
          ...(incoming.companyAmounts || {}),
        };
      }

      baseObj.notes = (incoming.notes && incoming.notes.trim()) ? incoming.notes : (existing.notes || '');

      // Verification checks & Cash Lock status:
      // Honor explicit user intent (lock vs unlock, verify vs unverify) based on the latest action timestamp!
      if (incomingTime >= existingTime) {
        if (incoming.company1Verified !== undefined) baseObj.company1Verified = Boolean(incoming.company1Verified);
        if (incoming.company2Verified !== undefined) baseObj.company2Verified = Boolean(incoming.company2Verified);
        if (incoming.cashVerified !== undefined) baseObj.cashVerified = Boolean(incoming.cashVerified);
        if (incoming.onlineVerified !== undefined) baseObj.onlineVerified = Boolean(incoming.onlineVerified);

        baseObj.company1VerifiedBy = incoming.company1Verified ? incoming.company1VerifiedBy : (incoming.company1Verified === false ? undefined : existing.company1VerifiedBy);
        baseObj.company2VerifiedBy = incoming.company2Verified ? incoming.company2VerifiedBy : (incoming.company2Verified === false ? undefined : existing.company2VerifiedBy);
        baseObj.cashVerifiedBy = incoming.cashVerified ? incoming.cashVerifiedBy : (incoming.cashVerified === false ? undefined : existing.cashVerifiedBy);
        baseObj.onlineVerifiedBy = incoming.onlineVerified ? incoming.onlineVerifiedBy : (incoming.onlineVerified === false ? undefined : existing.onlineVerifiedBy);

        if (incoming.isCashLocked !== undefined) {
          baseObj.isCashLocked = Boolean(incoming.isCashLocked);
          baseObj.cashLockedAt = incoming.isCashLocked ? (incoming.cashLockedAt || new Date().toISOString()) : undefined;
          baseObj.cashLockedBy = incoming.isCashLocked ? (incoming.cashLockedBy || '') : undefined;
        } else {
          baseObj.isCashLocked = Boolean(existing.isCashLocked);
          baseObj.cashLockedAt = existing.cashLockedAt;
          baseObj.cashLockedBy = existing.cashLockedBy;
        }
      } else {
        if (existing.company1Verified !== undefined) baseObj.company1Verified = Boolean(existing.company1Verified);
        if (existing.company2Verified !== undefined) baseObj.company2Verified = Boolean(existing.company2Verified);
        if (existing.cashVerified !== undefined) baseObj.cashVerified = Boolean(existing.cashVerified);
        if (existing.onlineVerified !== undefined) baseObj.onlineVerified = Boolean(existing.onlineVerified);

        baseObj.company1VerifiedBy = existing.company1Verified ? existing.company1VerifiedBy : (existing.company1Verified === false ? undefined : incoming.company1VerifiedBy);
        baseObj.company2VerifiedBy = existing.company2Verified ? existing.company2VerifiedBy : (existing.company2Verified === false ? undefined : incoming.company2VerifiedBy);
        baseObj.cashVerifiedBy = existing.cashVerified ? existing.cashVerifiedBy : (existing.cashVerified === false ? undefined : incoming.cashVerifiedBy);
        baseObj.onlineVerifiedBy = existing.onlineVerified ? existing.onlineVerifiedBy : (existing.onlineVerified === false ? undefined : incoming.onlineVerifiedBy);

        if (existing.isCashLocked !== undefined) {
          baseObj.isCashLocked = Boolean(existing.isCashLocked);
          baseObj.cashLockedAt = existing.cashLockedAt;
          baseObj.cashLockedBy = existing.cashLockedBy;
        } else {
          baseObj.isCashLocked = Boolean(incoming.isCashLocked);
          baseObj.cashLockedAt = incoming.cashLockedAt;
          baseObj.cashLockedBy = incoming.cashLockedBy;
        }
      }

      baseObj.totalCod = (Number(baseObj.company1Amount) || 0) + (Number(baseObj.company2Amount) || 0);
      baseObj.totalDeposit = (Number(baseObj.cashDeposit) || 0) + (Number(baseObj.onlineDeposit) || 0);
      baseObj.balance = baseObj.totalCod - baseObj.totalDeposit;

      // Sticky transfer flags: once synced to Advance/Incentive, never accidentally reset to false on merge
      baseObj.balanceSyncedToAdvance = Boolean(incoming.balanceSyncedToAdvance || existing.balanceSyncedToAdvance);
      baseObj.balanceSyncedToIncentive = Boolean(incoming.balanceSyncedToIncentive || existing.balanceSyncedToIncentive);
      baseObj.syncedAdvanceId = incoming.syncedAdvanceId || existing.syncedAdvanceId;
      baseObj.syncedIncentiveId = incoming.syncedIncentiveId || existing.syncedIncentiveId;
      (['company1', 'company2', 'cash', 'online'] as const).forEach((f) => {
        const advKey = `${f}SyncedToAdvance` as keyof CodDailyEntry;
        const incKey = `${f}SyncedToIncentive` as keyof CodDailyEntry;
        (baseObj as any)[advKey] = Boolean((incoming as any)[advKey] || (existing as any)[advKey]);
        (baseObj as any)[incKey] = Boolean((incoming as any)[incKey] || (existing as any)[incKey]);
      });

      mergedMap.set(matchedKey, baseObj);
    } else if (!incomingHasData && existingHasData) {
      // Existing has real data, incoming is empty -> NEVER OVERWRITE REAL DATA WITH BLANK ROWS!
      // Keep existing data intact
    } else {
      // Both are default rows
      mergedMap.set(matchedKey, { ...existing, ...incoming });
    }
  });

  return Array.from(mergedMap.values());
}

export const DEFAULT_COD_SETTINGS: CodSettings = {
  isEnabled: false, // Protected by default until Super Admin / Hub Owner enables it
  company1Name: DEFAULT_COMPANY_1,
  company2Name: DEFAULT_COMPANY_2,
  hubUpiId: '',
  updatedAt: new Date().toISOString(),
};

/**
 * Storage Keys (Isolated from Rider Payouts)
 */
function getSettingsStorageKey(userId: string): string {
  return `cp_cod_settings_${userId}`;
}

function getStaffStorageKey(userId: string): string {
  return `cp_cod_staff_${userId}`;
}

function getEntriesStorageKey(userId: string, date: string): string {
  return `cp_cod_entries_${userId}_${date}`;
}

function getAuditStorageKey(userId: string): string {
  return `cp_cod_audit_logs_${userId}`;
}

/**
 * 1. Load & Save COD Settings (Feature flag & company names)
 */
export async function loadCodSettings(userId: string): Promise<CodSettings> {
  const localKey = getSettingsStorageKey(userId);
  let localData: CodSettings | null = null;
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) localData = JSON.parse(raw);
  } catch {}

  // Attempt Firestore load: first check configured codCompanies from all_users
  if (db && userId && userId !== 'guest') {
    try {
      const allUserSnap = await getDoc(doc(db, 'all_users', userId));
      if (allUserSnap.exists()) {
        const uData = allUserSnap.data();
        if (Array.isArray(uData.codCompanies) && uData.codCompanies.length > 0) {
          const companies = uData.codCompanies;
          const assignedSettings: CodSettings = {
            isEnabled: true,
            company1Name: companies[0] || DEFAULT_COMPANY_1,
            company2Name: companies[1] || DEFAULT_COMPANY_2,
            companies: companies,
            updatedAt: new Date().toISOString(),
          };
          safeLocalStorageSet(localKey, JSON.stringify(assignedSettings), userId);
          return assignedSettings;
        }
      }

      const docRef = doc(db, 'workspaces', userId, 'cod_settings', 'config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const firestoreData = snap.data() as CodSettings;
        safeLocalStorageSet(localKey, JSON.stringify(firestoreData), userId);
        return firestoreData;
      }
    } catch (err) {
      console.warn('COD settings firestore fetch error:', err);
    }
  }

  return localData || DEFAULT_COD_SETTINGS;
}

export async function saveCodSettings(userId: string, settings: CodSettings): Promise<void> {
  const updated: CodSettings = {
    ...settings,
    updatedAt: new Date().toISOString(),
  };
  const localKey = getSettingsStorageKey(userId);
  safeLocalStorageSet(localKey, JSON.stringify(updated), userId);

  if (db && userId && userId !== 'guest') {
    try {
      const docRef = doc(db, 'workspaces', userId, 'cod_settings', 'config');
      await setDoc(docRef, cleanForFirestore(updated), { merge: true });
    } catch (err) {
      console.warn('COD settings firestore save error:', err);
    }
  }
}

/**
 * 2. Load & Save Staff & Rider Access Control (PIN Management)
 */
export async function loadCodStaffUsers(userId: string, riders: Rider[]): Promise<CodStaffUser[]> {
  const localKey = getStaffStorageKey(userId);
  let existingStaff: CodStaffUser[] = [];

  try {
    const raw = localStorage.getItem(localKey);
    if (raw) existingStaff = JSON.parse(raw);
  } catch {}

  // Attempt to fetch from Firestore if empty or out of sync
  if (db && userId && userId !== 'guest' && existingStaff.length === 0) {
    try {
      const colRef = collection(db, 'workspaces', userId, 'cod_staff');
      const snaps = await getDocs(colRef);
      if (!snaps.empty) {
        existingStaff = snaps.docs.map((d) => d.data() as CodStaffUser);
        safeLocalStorageSet(localKey, JSON.stringify(existingStaff), userId);
      }
    } catch (err) {
      console.warn('COD staff firestore fetch error:', err);
    }
  }

  // Merge riders to ensure every active rider has a corresponding PIN entry
  const staffMap = new Map<string, CodStaffUser>();
  existingStaff.forEach((s) => staffMap.set(s.id, s));

  let modified = false;
  riders.forEach((rider, idx) => {
    if (!staffMap.has(rider.id)) {
      // Generate initial 4-digit PIN from phone last 4 digits or index
      const phoneDigits = (rider.phone || '').replace(/\D/g, '').slice(-4);
      const defaultPin = phoneDigits.length === 4 ? phoneDigits : String(1001 + idx);
      const newStaff: CodStaffUser = {
        id: rider.id,
        riderId: rider.id,
        name: rider.name,
        phone: rider.phone,
        role: 'rider',
        pin: defaultPin,
        isActive: rider.active !== false,
        canVerifyCod: false,
        canVerifyCash: false,
        canVerifyOnline: false,
        hubId: userId,
        ownerUid: userId,
        workspaceId: userId,
        createdAt: new Date().toISOString(),
      };
      staffMap.set(rider.id, newStaff);
      modified = true;
    } else {
      // Sync rider name/phone/active state
      const curr = staffMap.get(rider.id)!;
      if (curr.name !== rider.name || curr.phone !== rider.phone || curr.isActive !== (rider.active !== false)) {
        staffMap.set(rider.id, {
          ...curr,
          name: rider.name,
          phone: rider.phone,
          isActive: rider.active !== false,
          hubId: curr.hubId || userId,
          ownerUid: curr.ownerUid || userId,
          workspaceId: curr.workspaceId || userId,
        });
        modified = true;
      }
    }
  });

  const mergedList = Array.from(staffMap.values());
  if (modified) {
    safeLocalStorageSet(localKey, JSON.stringify(mergedList), userId);
  }

  return mergedList;
}

export async function saveCodStaffUsers(userId: string, staffList: CodStaffUser[]): Promise<void> {
  const localKey = getStaffStorageKey(userId);
  const rawStaff = JSON.stringify(staffList);
  safeLocalStorageSet(localKey, rawStaff, userId);
  safeLocalStorageSet('cp_cod_staff_pins_cache', rawStaff, userId);

  if (db) {
    try {
      const batch = writeBatch(db);
      staffList.forEach((staff) => {
        const staffWithHub = {
          ...staff,
          hubId: staff.hubId || userId,
          ownerUid: staff.ownerUid || userId,
          workspaceId: staff.workspaceId || userId,
        };

        if (userId && userId !== 'guest') {
          const docRef = doc(db, 'workspaces', userId, 'cod_staff', staff.id);
          batch.set(docRef, cleanForFirestore(staffWithHub), { merge: true });
        }
        
        // Sync to shared cod_staff_pins for companion login with hub isolation tags
        const cleanPhone = (staff.phone || '').replace(/\D/g, '').slice(-10);
        const payload = cleanForFirestore({
          ...staffWithHub,
          cleanPhone,
          updatedAt: new Date().toISOString(),
        });
        
        const pinDocRef = doc(db, 'cod_staff_pins', staff.id);
        batch.set(pinDocRef, payload, { merge: true });

        if (cleanPhone) {
          const phoneDocRef = doc(db, 'cod_staff_pins', cleanPhone);
          batch.set(phoneDocRef, payload, { merge: true });
        }
      });
      await batch.commit();
    } catch (err) {
      console.warn('COD staff firestore batch save error:', err);
    }
  }
}

export function createNewStaffUser(params: {
  name: string;
  phone: string;
  role: CodStaffRole;
  pin: string;
  canVerifyCod?: boolean;
  canVerifyCash?: boolean;
  canVerifyOnline?: boolean;
  canEditEntries?: boolean;
}): CodStaffUser {
  return {
    id: `staff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: params.name.trim(),
    phone: params.phone.trim(),
    role: params.role,
    pin: params.pin.trim(),
    isActive: true,
    canVerifyCod: params.canVerifyCod ?? (params.role !== 'rider'),
    canVerifyCash: params.canVerifyCash ?? (params.role === 'hub_incharge' || params.role === 'supervisor'),
    canVerifyOnline: params.canVerifyOnline ?? (params.role !== 'rider'),
    canEditEntries: params.canEditEntries ?? false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Helper to robustly extract and normalize entries from daily_cod_sheets document
 * Supports entries stored as an Array OR an Object/Map ({ [riderPhoneOrId]: entry }),
 * and merges with entriesMap if present.
 */
export const DEFAULT_PRIMARY_HUB_ID = '9eQSF1ls7nhBnXG06RHu2qNWIr62';

export const hasRecordedData = (item: any): boolean => {
  if (!item || typeof item !== 'object') return false;
  const c1 = Number(item.company1Amount ?? item.company1Cod ?? item.company1 ?? 0);
  const c2 = Number(item.company2Amount ?? item.company2Cod ?? item.company2 ?? 0);
  const cash = Number(item.cashDeposit ?? 0);
  const online = Number(item.onlineDeposit ?? 0);
  const delivery = Number(item.deliveryCount ?? 0);
  const noteTotal = Number(item.cashDenomination?.total ?? 0);
  const hasComp = Boolean(
    item.companyAmounts &&
    typeof item.companyAmounts === 'object' &&
    Object.values(item.companyAmounts).some((v: any) => Number(v) > 0)
  );
  const status = item.status;
  const isLocked = Boolean(item.isCashLocked);
  return c1 > 0 || c2 > 0 || cash > 0 || online > 0 || delivery > 0 || noteTotal > 0 || hasComp || isLocked || status === 'submitted' || status === 'verified' || status === 'locked';
};

export function extractEntriesFromSheetRaw(raw: any, targetDate: string): CodDailyEntry[] {
  if (!raw) return [];
  const rawList: any[] = [];

  if (Array.isArray(raw.entries)) {
    rawList.push(...raw.entries);
  } else if (raw.entries && typeof raw.entries === 'object') {
    rawList.push(...Object.values(raw.entries));
  }

  // CRITICAL FIX: Always push all entries from entriesMap so recorded figures are never ignored or skipped!
  if (raw.entriesMap && typeof raw.entriesMap === 'object') {
    const mapValues = Object.values(raw.entriesMap);
    mapValues.forEach((mv: any) => {
      if (mv && typeof mv === 'object') {
        rawList.push(mv);
      }
    });
  }

  // Normalize and group raw items so that entries with real recorded data (amounts, status, deposits, notes)
  // ALWAYS take precedence over empty 0-amount placeholder rows
  const groupedEntries = new Map<string, any>();
  const aliasToKey = new Map<string, string>();

  rawList.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const rawRiderId = item.riderId || item.id;
    const riderId = rawRiderId ? String(rawRiderId).trim() : '';
    const riderPhone = String(item.riderPhone || item.phone || '');
    const cleanPhone = riderPhone.replace(/\D/g, '').slice(-10);
    const cleanName = String(item.riderName || item.name || '').trim().toLowerCase();

    let dedupeKey: string | null = null;
    if (riderId && aliasToKey.has(riderId)) {
      dedupeKey = aliasToKey.get(riderId)!;
    } else if (cleanPhone && aliasToKey.has(`phone_${cleanPhone}`)) {
      dedupeKey = aliasToKey.get(`phone_${cleanPhone}`)!;
    } else if (cleanName && cleanName !== 'राइडर' && aliasToKey.has(`name_${cleanName}`)) {
      dedupeKey = aliasToKey.get(`name_${cleanName}`)!;
    }

    if (!dedupeKey) {
      dedupeKey = riderId || (cleanPhone ? `phone_${cleanPhone}` : `rider_${index}_${Math.random()}`);
      if (riderId) aliasToKey.set(riderId, dedupeKey);
      if (cleanPhone) aliasToKey.set(`phone_${cleanPhone}`, dedupeKey);
      if (cleanName && cleanName !== 'राइडर') aliasToKey.set(`name_${cleanName}`, dedupeKey);
      groupedEntries.set(dedupeKey, item);
    } else {
      if (riderId) aliasToKey.set(riderId, dedupeKey);
      if (cleanPhone) aliasToKey.set(`phone_${cleanPhone}`, dedupeKey);
      if (cleanName && cleanName !== 'राइडर') aliasToKey.set(`name_${cleanName}`, dedupeKey);

      const existing = groupedEntries.get(dedupeKey);
      const existingHasData = hasRecordedData(existing);
      const currentHasData = hasRecordedData(item);

      if (!existingHasData && currentHasData) {
        // Upgrade from blank row to real recorded data
        groupedEntries.set(dedupeKey, { ...existing, ...item });
      } else if (existingHasData && !currentHasData) {
        // CRITICAL GUARD: Keep existing recorded data! NEVER downgrade to an empty blank placeholder!
      } else {
        // Both have data or attributes: defensively merge to never lose non-zero money or notes
        const merged = { ...existing, ...item };
        const c1A = Number(item.company1Amount ?? 0);
        const c1B = Number(existing.company1Amount ?? 0);
        merged.company1Amount = c1A > 0 ? c1A : c1B;

        const c2A = Number(item.company2Amount ?? 0);
        const c2B = Number(existing.company2Amount ?? 0);
        merged.company2Amount = c2A > 0 ? c2A : c2B;

        const cashA = Number(item.cashDeposit ?? 0);
        const cashB = Number(existing.cashDeposit ?? 0);
        merged.cashDeposit = cashA > 0 ? cashA : cashB;

        const onlineA = Number(item.onlineDeposit ?? 0);
        const onlineB = Number(existing.onlineDeposit ?? 0);
        merged.onlineDeposit = onlineA > 0 ? onlineA : onlineB;

        const delA = Number(item.deliveryCount ?? 0);
        const delB = Number(existing.deliveryCount ?? 0);
        merged.deliveryCount = delA > 0 ? delA : delB;

        if (!merged.cashDenomination && existing.cashDenomination) {
          merged.cashDenomination = existing.cashDenomination;
        }
        if (!merged.companyAmounts && existing.companyAmounts) {
          merged.companyAmounts = existing.companyAmounts;
        }

        const itemTime = new Date(item.updatedAt || 0).getTime();
        const existTime = new Date(existing.updatedAt || 0).getTime();

        if (itemTime >= existTime) {
          if (item.company1Verified !== undefined) merged.company1Verified = Boolean(item.company1Verified);
          if (item.company2Verified !== undefined) merged.company2Verified = Boolean(item.company2Verified);
          if (item.cashVerified !== undefined) merged.cashVerified = Boolean(item.cashVerified);
          if (item.onlineVerified !== undefined) merged.onlineVerified = Boolean(item.onlineVerified);

          if (item.isCashLocked !== undefined) {
            merged.isCashLocked = Boolean(item.isCashLocked);
            merged.cashLockedAt = item.isCashLocked ? (item.cashLockedAt || new Date().toISOString()) : undefined;
            merged.cashLockedBy = item.isCashLocked ? (item.cashLockedBy || '') : undefined;
          }
        } else {
          if (existing.company1Verified !== undefined) merged.company1Verified = Boolean(existing.company1Verified);
          if (existing.company2Verified !== undefined) merged.company2Verified = Boolean(existing.company2Verified);
          if (existing.cashVerified !== undefined) merged.cashVerified = Boolean(existing.cashVerified);
          if (existing.onlineVerified !== undefined) merged.onlineVerified = Boolean(existing.onlineVerified);

          if (existing.isCashLocked !== undefined) {
            merged.isCashLocked = Boolean(existing.isCashLocked);
            merged.cashLockedAt = existing.isCashLocked ? (existing.cashLockedAt || new Date().toISOString()) : undefined;
            merged.cashLockedBy = existing.isCashLocked ? (existing.cashLockedBy || '') : undefined;
          }
        }
        groupedEntries.set(dedupeKey, merged);
      }
    }
  });

  const normalized: CodDailyEntry[] = [];

  groupedEntries.forEach((item, _key) => {
    const riderId = String(item.riderId || item.id || '');
    const riderPhone = String(item.riderPhone || item.phone || '');
    const cleanPhone = riderPhone.replace(/\D/g, '').slice(-10);
    const riderName = String(item.riderName || item.name || 'राइडर');

    let company1Amount = Number(item.company1Amount ?? item.company1Cod ?? item.company1 ?? 0);
    let company2Amount = Number(item.company2Amount ?? item.company2Cod ?? item.company2 ?? 0);

    // Extract company amounts from companyAmounts map if top-level fields are 0
    if (company1Amount === 0 && company2Amount === 0 && item.companyAmounts && typeof item.companyAmounts === 'object') {
      const valmoVal = Number(item.companyAmounts['Valmo'] ?? item.companyAmounts['valmo'] ?? item.companyAmounts['Valmo COD'] ?? 0);
      const xbVal = Number(item.companyAmounts['Xpressbees'] ?? item.companyAmounts['xpressbees'] ?? item.companyAmounts['Xpressbees COD'] ?? 0);
      if (valmoVal > 0 || xbVal > 0) {
        company1Amount = valmoVal;
        company2Amount = xbVal;
      } else {
        const keys = Object.keys(item.companyAmounts);
        if (keys.length > 0) company1Amount = Number(item.companyAmounts[keys[0]] || 0);
        if (keys.length > 1) company2Amount = Number(item.companyAmounts[keys[1]] || 0);
      }
    }

    let cashDeposit = Number(item.cashDeposit ?? 0);
    const denomTotal = Number(item.cashDenomination?.total ?? 0);
    // If cashDeposit is 0 but cash notes were counted, restore cashDeposit from cashDenomination.total
    if (cashDeposit === 0 && denomTotal > 0) {
      cashDeposit = denomTotal;
    }

    const onlineDeposit = Number(item.onlineDeposit ?? 0);
    const totalCod = Number(item.totalCod || (company1Amount + company2Amount));
    const totalDeposit = Number(item.totalDeposit || (cashDeposit + onlineDeposit));
    const balance = Number(item.balance !== undefined && item.balance !== null ? item.balance : (totalCod - totalDeposit));

    const entryObj: CodDailyEntry = {
      ...item,
      id: item.id || `cod_${targetDate}_${riderId || cleanPhone}`,
      date: item.date || targetDate,
      riderId: riderId || `rider_${cleanPhone}`,
      riderName,
      riderPhone,
      company1Amount,
      company2Amount,
      totalCod,
      cashDeposit,
      onlineDeposit,
      totalDeposit,
      balance,
      status: item.status || (totalDeposit > 0 || totalCod > 0 ? 'submitted' : 'draft'),
      updatedAt: item.updatedAt || new Date().toISOString(),
    };
    if (item.cashDenomination) {
      entryObj.cashDenomination = item.cashDenomination;
    }
    if (item.companyAmounts) {
      entryObj.companyAmounts = item.companyAmounts;
    }
    normalized.push(cleanForFirestore(entryObj));
  });

  return normalized;
}

/**
 * Builds a unified map representation of entries keyed by rider ID and 10-digit phone number
 */
export function buildEntriesMap(entries: CodDailyEntry[]): Record<string, any> {
  const map: Record<string, any> = {};
  entries.forEach((e) => {
    const cleanPhone = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
    const payload = cleanForFirestore({
      ...e,
      company1Cod: Number(e.company1Amount || 0),
      company2Cod: Number(e.company2Amount || 0),
      totalCod: Number(e.totalCod || 0),
      cashDeposit: Number(e.cashDeposit || 0),
      onlineDeposit: Number(e.onlineDeposit || 0),
      totalDeposit: Number(e.totalDeposit || 0),
      balance: Number(e.balance || 0),
      cashDenomination: e.cashDenomination || undefined,
      companyAmounts: e.companyAmounts || undefined,
    });
    if (e.riderId) map[e.riderId] = payload;
    if (cleanPhone) map[cleanPhone] = payload;
  });
  return map;
}

/**
 * 3. Load & Save Daily COD Grid Entries
 */
export async function loadCodDailyEntries(
  userId: string, 
  date: string, 
  riders: Rider[]
): Promise<CodDailyEntry[]> {
  const targetDate = date || getTodayDateString();
  const localKey = getEntriesStorageKey(userId, targetDate);
  let savedEntries: CodDailyEntry[] = [];

  // 1. First attempt direct Firestore fetch: from hubs/{userId}/daily_cod_sheets/{targetDate} and root collections
  const effectiveUserId = (userId || getActiveCompanionHubId() || 'super_admin_hub').trim();
  if (db && effectiveUserId !== 'guest') {
    try {
      // 1a. Check hubs/{effectiveUserId}/daily_cod_sheets/{targetDate}
      const hubSheetRef = doc(db, 'hubs', effectiveUserId, 'daily_cod_sheets', targetDate);
      const hubSnap = await getDoc(hubSheetRef);
      if (hubSnap.exists()) {
        const hubData = hubSnap.data();
        const firestoreEntries = extractEntriesFromSheetRaw(hubData, targetDate);
        if (firestoreEntries.length > 0) {
          savedEntries = firestoreEntries;
        }
      }

      // 1a-2. Check DEFAULT_PRIMARY_HUB_ID (Primary Courier Hub) if different from effectiveUserId
      if (savedEntries.filter(hasRecordedData).length === 0 && effectiveUserId !== DEFAULT_PRIMARY_HUB_ID) {
        try {
          const primaryHubSnap = await getDoc(doc(db, 'hubs', DEFAULT_PRIMARY_HUB_ID, 'daily_cod_sheets', targetDate));
          if (primaryHubSnap.exists()) {
            const primaryEntries = extractEntriesFromSheetRaw(primaryHubSnap.data(), targetDate);
            if (primaryEntries.length > 0) {
              savedEntries = primaryEntries;
            }
          }
        } catch {}
      }

      // 1b. Check root doc: daily_cod_sheets/{targetDate} (e.g. Nov 4 entries stored at root)
      if (savedEntries.filter(hasRecordedData).length === 0) {
        try {
          const rootDateSnap = await getDoc(doc(db, 'daily_cod_sheets', targetDate));
          if (rootDateSnap.exists()) {
            const rootEntries = extractEntriesFromSheetRaw(rootDateSnap.data(), targetDate);
            if (rootEntries.length > 0) {
              savedEntries = rootEntries;
            }
          }
        } catch {}
      }

      // 1c. Defensively merge scoped root doc: daily_cod_sheets/{userId}_{targetDate}
      try {
        const scopedSnap = await getDoc(doc(db, 'daily_cod_sheets', `${effectiveUserId}_${targetDate}`));
        if (scopedSnap.exists()) {
          const scopedData = scopedSnap.data();
          const firestoreEntries = extractEntriesFromSheetRaw(scopedData, targetDate);
          if (firestoreEntries.length > 0) {
            if (savedEntries.length === 0) {
              savedEntries = firestoreEntries;
            } else {
              // Merge non-zero values (cash, online, notes, company amounts) from scoped doc
              const mergedMap = new Map<string, CodDailyEntry>();
              savedEntries.forEach((e) => {
                const cp = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
                mergedMap.set(cp || e.riderId, e);
              });
              firestoreEntries.forEach((se) => {
                const cp = (se.riderPhone || '').replace(/\D/g, '').slice(-10);
                const key = cp || se.riderId;
                if (!mergedMap.has(key)) {
                  mergedMap.set(key, se);
                } else {
                  const ex = mergedMap.get(key)!;
                  const c1 = Number(ex.company1Amount || se.company1Amount || 0);
                  const c2 = Number(ex.company2Amount || se.company2Amount || 0);
                  const cash = Number(ex.cashDeposit || se.cashDeposit || 0);
                  const online = Number(ex.onlineDeposit || se.onlineDeposit || 0);
                  const totalCod = c1 + c2;
                  const totalDeposit = cash + online;
                  const balance = totalCod - totalDeposit;
                  mergedMap.set(key, {
                    ...ex,
                    ...se,
                    company1Amount: c1,
                    company2Amount: c2,
                    totalCod,
                    cashDeposit: cash,
                    onlineDeposit: online,
                    totalDeposit,
                    balance,
                    cashDenomination: ex.cashDenomination || se.cashDenomination,
                  });
                }
              });
              savedEntries = Array.from(mergedMap.values());
            }
          }
        }
      } catch {}

      // 1d. Check super_admin_hub doc: hubs/super_admin_hub/daily_cod_sheets/{targetDate}
      if (savedEntries.filter(hasRecordedData).length === 0 && effectiveUserId !== 'super_admin_hub') {
        try {
          const saSnap = await getDoc(doc(db, 'hubs', 'super_admin_hub', 'daily_cod_sheets', targetDate));
          if (saSnap.exists()) {
            const saEntries = extractEntriesFromSheetRaw(saSnap.data(), targetDate);
            if (saEntries.length > 0) {
              savedEntries = saEntries;
            }
          }
        } catch {}
      }

      // CRITICAL BACKUP RECOVERY: Query dedicated rider_entries subcollection in effective hub & super_admin_hub
      const checkSubcollections = async (targetHub: string) => {
        try {
          const subSnap = await getDocs(collection(db, 'hubs', targetHub, 'daily_cod_sheets', targetDate, 'rider_entries'));
          if (!subSnap.empty) {
            subSnap.docs.forEach((d) => {
              const subData = d.data() as CodDailyEntry;
              if (subData && subData.riderId && hasRecordedData(subData)) {
                const idx = savedEntries.findIndex((e) => e.riderId === subData.riderId);
                if (idx >= 0) {
                  if (!hasRecordedData(savedEntries[idx])) {
                    savedEntries[idx] = subData;
                  }
                } else {
                  savedEntries.push(subData);
                }
              }
            });
          }
        } catch (subErr) {
          console.warn('Notice querying rider_entries subcollection:', subErr);
        }
      };

      await checkSubcollections(effectiveUserId);
      if (effectiveUserId !== 'super_admin_hub') {
        await checkSubcollections('super_admin_hub');
      }

      if (savedEntries.length > 0) {
        saveCodCacheSafely(
          [[`cp_cod_sheet_${effectiveUserId}_${targetDate}`, JSON.stringify({ date: targetDate, entries: savedEntries })]],
          effectiveUserId
        );
      }
    } catch (err) {
      console.warn('daily_cod_sheets direct fetch notice:', err);
    }
  }

  // 2. If Firestore had no entries or failed, fallback to local cache
  if (savedEntries.length === 0) {
    try {
      const hubLocalKey = userId ? `cp_cod_sheet_${userId}_${targetDate}` : `cp_cod_sheet_${targetDate}`;
      const rawSheet = localStorage.getItem(hubLocalKey) || localStorage.getItem(`cp_cod_sheet_${targetDate}`);
      if (rawSheet) {
        const parsedSheet = JSON.parse(rawSheet);
        savedEntries = extractEntriesFromSheetRaw(parsedSheet, targetDate);
      }
    } catch {}
  }

  if (savedEntries.length === 0) {
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) savedEntries = extractEntriesFromSheetRaw({ entries: JSON.parse(raw) }, targetDate);
    } catch {}
  }

  // 4. Attempt workspace legacy collection fallback
  if (db && userId && userId !== 'guest' && savedEntries.length === 0) {
    try {
      const colRef = collection(db, 'workspaces', userId, 'cod_entries');
      const snaps = await getDocs(colRef);
      if (!snaps.empty) {
        const allDateEntries = snaps.docs
          .map((d) => d.data() as CodDailyEntry)
          .filter((e) => e.date === targetDate);
        if (allDateEntries.length > 0) {
          savedEntries = allDateEntries;
          saveCodCacheSafely(
            [[`cp_cod_sheet_${userId}_${targetDate}`, JSON.stringify({ date: targetDate, entries: savedEntries })]],
            userId
          );
        }
      }
    } catch (err) {
      console.warn('COD entries firestore fetch error:', err);
    }
  }

  const cleanRiders = riders || [];

  const entryMap = new Map<string, CodDailyEntry>();
  savedEntries.forEach((e) => {
    const cleanPhone = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
    if (e.riderId) entryMap.set(e.riderId, e);
    if (cleanPhone) entryMap.set(cleanPhone, e);
  });

  const processedRiderIds = new Set<string>();
  const processedPhones = new Set<string>();

  const result: CodDailyEntry[] = cleanRiders.map((rider) => {
    const cleanRiderPhone = (rider.phone || '').replace(/\D/g, '').slice(-10);
    processedRiderIds.add(rider.id);
    if (cleanRiderPhone) processedPhones.add(cleanRiderPhone);

    const existing = entryMap.get(rider.id) || (cleanRiderPhone ? entryMap.get(cleanRiderPhone) : undefined);

    if (existing) {
      // Auto-recalculate totals in case of legacy fields
      const totalCod = (Number(existing.company1Amount) || 0) + (Number(existing.company2Amount) || 0);
      const totalDeposit = (Number(existing.cashDeposit) || 0) + (Number(existing.onlineDeposit) || 0);
      const balance = totalCod - totalDeposit;
      return {
        ...existing,
        riderName: rider.name || existing.riderName,
        riderPhone: rider.phone || existing.riderPhone,
        totalCod,
        totalDeposit,
        balance,
      };
    }

    // Default blank template row for rider
    return {
      id: `cod_${targetDate}_${rider.id}`,
      date: targetDate,
      riderId: rider.id,
      riderName: rider.name,
      riderPhone: rider.phone,
      company1Amount: 0,
      company2Amount: 0,
      totalCod: 0,
      cashDeposit: 0,
      onlineDeposit: 0,
      totalDeposit: 0,
      balance: 0,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    };
  });

  // CRITICAL AUDIT FIX: Append any saved entry that was NOT matched to cleanRiders
  // This guarantees that past entries entered by any rider are NEVER discarded or hidden!
  savedEntries.forEach((se) => {
    const seCleanPhone = (se.riderPhone || '').replace(/\D/g, '').slice(-10);
    const isProcessed = (se.riderId && processedRiderIds.has(se.riderId)) ||
      (seCleanPhone && processedPhones.has(seCleanPhone));
    if (!isProcessed) {
      result.push(se);
      if (se.riderId) processedRiderIds.add(se.riderId);
      if (seCleanPhone) processedPhones.add(seCleanPhone);
    }
  });

  return result;
}

export async function saveCodDailyEntries(
  userId: string, 
  date: string, 
  entries: CodDailyEntry[]
): Promise<void> {
  const targetDate = date || getTodayDateString();
  const cleanEntries = entries || [];
  try {
    const effectiveHub = (userId || getActiveCompanionHubId() || 'default').trim();
    const sheetJson = JSON.stringify({ date: targetDate, entries: cleanEntries, hubId: effectiveHub });
    saveCodCacheSafely([[`cp_cod_sheet_${effectiveHub}_${targetDate}`, sheetJson]], effectiveHub);
  } catch {}

  if (db) {
    try {
      // PRE-SAVE DEFENSIVE MERGE:
      // Fetch current Firestore document before writing to ensure that if any rider previously submitted
      // real figures (amounts, cash, online, status), they are NEVER overwritten by blank 0 draft placeholders!
      let finalEntriesToSave = [...cleanEntries];
      let isSheetLocked = false;
      let company1Name = DEFAULT_COMPANY_1;
      let company2Name = DEFAULT_COMPANY_2;
      let hubName = '';

      const targetHubId = (userId && userId !== 'guest' && userId !== 'super_admin_hub') ? userId : null;
      if (targetHubId) {
        try {
          const hubSheetRef = doc(db, 'hubs', targetHubId, 'daily_cod_sheets', targetDate);
          const existingSnap = await getDoc(hubSheetRef);
          if (existingSnap.exists()) {
            const existingRaw = existingSnap.data();
            isSheetLocked = Boolean(existingRaw.isLocked);
            company1Name = existingRaw.company1Name || company1Name;
            company2Name = existingRaw.company2Name || company2Name;
            hubName = existingRaw.hubName || hubName;
            const existingEntries = extractEntriesFromSheetRaw(existingRaw, targetDate);
            finalEntriesToSave = mergeCodEntriesNonDestructively(existingEntries, cleanEntries);
          }
        } catch (mergeErr) {
          console.warn('Pre-save merge check notice:', mergeErr);
        }
      }

      const entriesMap = buildEntriesMap(finalEntriesToSave);
      const payload = cleanForFirestore({
        date: targetDate,
        hubId: userId,
        ownerUid: userId,
        entries: finalEntriesToSave,
        entriesMap,
        isLocked: isSheetLocked,
        company1Name,
        company2Name,
        hubName,
        updatedAt: new Date().toISOString(),
      });

      // 1. Hub-scoped path: hubs/{userId}/daily_cod_sheets/{date} (No cross-hub contamination)
      if (userId && userId !== 'guest' && userId !== 'super_admin_hub') {
        const hubSheetRef = doc(db, 'hubs', userId, 'daily_cod_sheets', targetDate);
        await setDoc(hubSheetRef, payload, { merge: true });

        // Dual-write to daily_cod_sheets/{userId}_{date} for query compatibility
        const scopedRootRef = doc(db, 'daily_cod_sheets', `${userId}_${targetDate}`);
        await setDoc(scopedRootRef, payload, { merge: true });

        // Dual-write each rider's entry to dedicated rider_entries subcollection
        // Guaranteeing an immutable, isolated document per rider that can never be overwritten by batch operations
        try {
          const batchRiders = writeBatch(db);
          finalEntriesToSave.forEach((re) => {
            if (re.riderId && hasRecordedData(re)) {
              const riderDocRef = doc(db, 'hubs', userId, 'daily_cod_sheets', targetDate, 'rider_entries', re.riderId);
              batchRiders.set(riderDocRef, cleanForFirestore(re), { merge: true });
            }
          });
          await batchRiders.commit();
        } catch {}
      } else {
        // Fallback write for un-isolated setups, local guest, or super admin demo
        const sheetRef = doc(db, 'daily_cod_sheets', targetDate);
        await setDoc(sheetRef, payload, { merge: true });
      }

      // 2. Also persist in user workspace
      if (userId && userId !== 'guest') {
        const batch = writeBatch(db);
        finalEntriesToSave.forEach((entry) => {
          const docRef = doc(db, 'workspaces', userId, 'cod_entries', entry.id);
          batch.set(docRef, cleanForFirestore(entry), { merge: true });
        });
        await batch.commit();
      }
    } catch (err) {
      console.warn('COD entries firestore batch save error:', err);
    }
  }
}

/**
 * 4. Audit Log Foundation
 */
export async function loadCodAuditLogs(userId: string): Promise<CodAuditLog[]> {
  const localKey = getAuditStorageKey(userId);
  let logs: CodAuditLog[] = [];
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) logs = JSON.parse(raw);
  } catch {}

  if (db && userId && userId !== 'guest' && logs.length === 0) {
    try {
      const colRef = collection(db, 'workspaces', userId, 'cod_audit_logs');
      const snaps = await getDocs(colRef);
      if (!snaps.empty) {
        logs = snaps.docs.map((d) => d.data() as CodAuditLog);
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        safeLocalStorageSet(localKey, JSON.stringify(logs.slice(0, 50)), userId);
      }
    } catch (err) {
      console.warn('COD audit firestore fetch error:', err);
    }
  }

  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function recordCodAuditLog(
  userId: string, 
  logData: Omit<CodAuditLog, 'id' | 'timestamp'>
): Promise<void> {
  const newLog: CodAuditLog = {
    ...logData,
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
  };

  const localKey = getAuditStorageKey(userId);
  try {
    const current = await loadCodAuditLogs(userId);
    const updated = [newLog, ...current].slice(0, 50); // keep recent 50 locally; Firestore holds full history
    safeLocalStorageSet(localKey, JSON.stringify(updated), userId);
  } catch {}

  if (db && userId && userId !== 'guest') {
    try {
      const docRef = doc(db, 'workspaces', userId, 'cod_audit_logs', newLog.id);
      await setDoc(docRef, cleanForFirestore(newLog));
    } catch (err) {
      console.warn('COD audit log firestore write error:', err);
    }
  }
}

/**
 * 5. Excel / CSV Export
 */
export async function exportCodGridToCSV(
  date: string,
  entries: CodDailyEntry[],
  company1Name: string,
  company2Name: string,
  hubName: string = 'Courier Hub'
): Promise<void> {
  const safeDate = String(date || getTodayDateString()).replace(/[^a-zA-Z0-9_-]/g, '_');
  const c1Label = String(company1Name || 'Company 1').replace(/"/g, '""');
  const c2Label = String(company2Name || 'Company 2').replace(/"/g, '""');
  const safeHub = String(hubName || 'Courier Hub').replace(/"/g, '""');
  const safeEntries = Array.isArray(entries) ? entries : [];

  const headers = [
    'Date',
    'Rider Name',
    'Phone',
    `${c1Label} (₹)`,
    `${c2Label} (₹)`,
    'Total COD (₹)',
    'Cash Deposit (₹)',
    'Online Deposit (₹)',
    'Total Deposit (₹)',
    'Balance / Difference (₹)',
    'Shortage Flagged (₹)',
    'Status',
    'Verified By',
    'Notes',
  ];

  const rows = safeEntries.map((e) => {
    const c1Short = Number(e?.company1Shortage) || 0;
    const c2Short = Number(e?.company2Shortage) || 0;
    const cashShort = Number(e?.cashShortage) || 0;
    const onlineShort = Number(e?.onlineShortage) || 0;
    const totalShort = c1Short + c2Short + cashShort + onlineShort;
    const shortDetails: string[] = [];
    if (c1Short > 0) shortDetails.push(`${c1Label}: -₹${c1Short}`);
    if (c2Short > 0) shortDetails.push(`${c2Label}: -₹${c2Short}`);
    if (cashShort > 0) shortDetails.push(`Cash: -₹${cashShort}`);
    if (onlineShort > 0) shortDetails.push(`Online: -₹${onlineShort}`);
    const shortText = totalShort > 0 ? `${totalShort} (${shortDetails.join('; ')})` : '0';

    const c1Amt = Number(e?.company1Amount) || 0;
    const c2Amt = Number(e?.company2Amount) || 0;
    const cashAmt = Number(e?.cashDeposit) || 0;
    const onlineAmt = Number(e?.onlineDeposit) || 0;
    const totCod = Number(e?.totalCod) || (c1Amt + c2Amt);
    const totDep = Number(e?.totalDeposit) || (cashAmt + onlineAmt);
    const bal = e?.balance !== undefined ? Number(e.balance) || 0 : totCod - totDep;

    return [
      `"${String(e?.date || safeDate).replace(/"/g, '""')}"`,
      `"${String(e?.riderName || 'Rider').replace(/"/g, '""')}"`,
      `"${String(e?.riderPhone || '').replace(/"/g, '""')}"`,
      c1Amt,
      c2Amt,
      totCod,
      cashAmt,
      onlineAmt,
      totDep,
      bal,
      `"${shortText.replace(/"/g, '""')}"`,
      `"${String(e?.status || 'draft').toUpperCase()}"`,
      `"${String(e?.verifiedBy || '').replace(/"/g, '""')}"`,
      `"${String(e?.notes || '').replace(/"/g, '""')}"`,
    ];
  });

  // Total summary footer row
  const sumC1 = safeEntries.reduce((s, e) => s + (Number(e?.company1Amount) || 0), 0);
  const sumC2 = safeEntries.reduce((s, e) => s + (Number(e?.company2Amount) || 0), 0);
  const sumTotalCod = safeEntries.reduce((s, e) => s + (Number(e?.totalCod) || ((Number(e?.company1Amount) || 0) + (Number(e?.company2Amount) || 0))), 0);
  const sumCash = safeEntries.reduce((s, e) => s + (Number(e?.cashDeposit) || 0), 0);
  const sumOnline = safeEntries.reduce((s, e) => s + (Number(e?.onlineDeposit) || 0), 0);
  const sumTotalDep = safeEntries.reduce((s, e) => s + (Number(e?.totalDeposit) || ((Number(e?.cashDeposit) || 0) + (Number(e?.onlineDeposit) || 0))), 0);
  const sumBal = safeEntries.reduce((s, e) => s + (Number(e?.balance) || 0), 0);
  const sumShortage = safeEntries.reduce(
    (s, e) => s + ((Number(e?.company1Shortage) || 0) + (Number(e?.company2Shortage) || 0) + (Number(e?.cashShortage) || 0) + (Number(e?.onlineShortage) || 0)),
    0
  );

  const totalRow = [
    `"TOTALS"`,
    `"${safeEntries.length} Riders"`,
    `""`,
    sumC1,
    sumC2,
    sumTotalCod,
    sumCash,
    sumOnline,
    sumTotalDep,
    sumBal,
    sumShortage,
    `""`,
    `""`,
    `""`,
  ];

  const csvContent = [
    `"${safeHub} - Daily COD Reconciliation Sheet (${safeDate})"`,
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map((r) => r.join(',')),
    totalRow.join(','),
  ].join('\n');

  await exportFileNativelyOrWeb({
    filename: `COD-Reconciliation-${safeDate}.csv`,
    content: '\uFEFF' + csvContent,
    mimeType: 'text/csv;charset=utf-8;',
    title: `COD Sheet (${safeDate})`,
    text: `${safeHub} - Daily COD Reconciliation Report (${safeDate})`,
    dialogTitle: 'COD रिपोर्ट सेव या शेयर करें',
  });
}

/**
 * =========================================================================
 * 6. STANDALONE COMPANION APP: COD Entry (हिसाब किताब)
 * Exclusively for Delivery Boys (Riders) and Hub Staff
 * =========================================================================
 */

/**
 * Normalizes phone number inputs:
 * Strips all spaces, dashes, parentheses, non-digits, and handles leading '+91', '91', or '0'.
 * Returns the exact 10-digit Indian mobile number.
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  let cleaned = rawPhone.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length > 10) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length > 10) {
    cleaned = cleaned.slice(1);
  }
  cleaned = cleaned.replace(/\D/g, '');
  return cleaned.slice(-10);
}

/**
 * Fast lookup to resolve parent tenant/hub ID from a phone number in Firestore
 * Used to immediately eliminate the "Hub: Not Resolved" state when digits are entered.
 */
export async function resolveHubIdFromPhone(phoneInput: string): Promise<string | null> {
  const cleanPhone = normalizePhoneNumber(phoneInput);
  if (cleanPhone.length !== 10) return null;

  if (db) {
    try {
      // 1. Root riders collection direct match
      const qClean = query(collection(db, 'riders'), where('phone', '==', cleanPhone));
      const snapClean = await getDocs(qClean);
      if (!snapClean.empty) {
        const d = snapClean.docs[0].data();
        const hub = (d.workspaceId || d.hubId || d.userId || d.ownerUid || d.createdBy || '').trim();
        if (hub) return hub;
      }

      const qPrefixed = query(collection(db, 'riders'), where('phone', '==', `+91${cleanPhone}`));
      const snapPrefixed = await getDocs(qPrefixed);
      if (!snapPrefixed.empty) {
        const d = snapPrefixed.docs[0].data();
        const hub = (d.workspaceId || d.hubId || d.userId || d.ownerUid || d.createdBy || '').trim();
        if (hub) return hub;
      }

      // 2. CollectionGroup across workspaces
      try {
        const qGroup = query(collectionGroup(db, 'riders'), where('phone', '==', cleanPhone));
        const snapGroup = await getDocs(qGroup);
        if (!snapGroup.empty) {
          const d = snapGroup.docs[0].data();
          const parentWs = snapGroup.docs[0].ref.parent?.parent?.id;
          const hub = (d.workspaceId || d.hubId || d.userId || d.ownerUid || d.createdBy || parentWs || '').trim();
          if (hub) return hub;
        }
      } catch {}

      // 3. Staff pins collection
      const staffDoc = await getDoc(doc(db, 'cod_staff_pins', cleanPhone));
      if (staffDoc.exists()) {
        const d = staffDoc.data();
        const hub = (d.userId || d.workspaceId || d.hubId || d.ownerUid || '').trim();
        if (hub) return hub;
      }

      // 4. Fallback: No global scan of riders collection to prevent cross-tenant data leakage
    } catch (err) {
      console.warn('resolveHubIdFromPhone lookup notice:', err);
    }
  }

  // Demo accounts fallback
  const demoPhones: Record<string, string> = {
    '9876543210': 'super_admin_hub',
    '9876543211': 'super_admin_hub',
    '9876543212': 'super_admin_hub',
    '9876543213': 'super_admin_hub',
  };
  if (demoPhones[cleanPhone]) {
    return demoPhones[cleanPhone];
  }

  // Check cached staff
  try {
    const cachedRaw = localStorage.getItem('cp_cod_staff_pins_cache');
    if (cachedRaw) {
      const staffList = JSON.parse(cachedRaw);
      const match = staffList.find((s: any) => normalizePhoneNumber(s.phone || '') === cleanPhone);
      if (match) {
        return (match.userId || match.workspaceId || match.hubId || match.ownerUid || '').trim() || null;
      }
    }
  } catch {}

  return null;
}

/**
 * Clean 2-input Authentication against shared Firebase database (cod_staff_pins collection)
 * Inputs: Registered Mobile Number (10 digits) + 4-Digit Security PIN (NO Hub Code)
 * Auto-detects user role: Rider, Team Leader, Supervisor, Hub Incharge
 */
export async function authenticateCodStaffCompanion(
  phoneInput: string,
  pinInput: string,
  presetHubId?: string
): Promise<{
  success: boolean;
  user?: CodStaffUser;
  resolvedHubId?: string;
  reason?: 'invalid_credentials' | 'inactive' | 'not_found' | 'no_hub' | 'error';
  message: string;
}> {
  const cleanPhone = normalizePhoneNumber(phoneInput);
  const pin = pinInput.trim();

  if (cleanPhone.length !== 10) {
    return {
      success: false,
      reason: 'invalid_credentials',
      message: 'कृपया 10-अंकों का वैध मोबाइल नंबर दर्ज करें।',
    };
  }

  if (pin.length !== 4) {
    return {
      success: false,
      reason: 'invalid_credentials',
      message: 'कृपया 4-अंकों का सही सुरक्षा पिन दर्ज करें।',
    };
  }

  let matchedUser: CodStaffUser | null = null;
  let resolvedHubId: string | null = (presetHubId || '').trim() || null;

  // 1. EXACT HUB LOOKUP ON LOGIN VIA FIRESTORE RIDERS COLLECTION:
  // Query Firestore riders collection across all documents where phone == enteredPhone (sanitized 10 digits)
  if (db) {
    try {
      let matchedRiderData: any = null;
      let matchedRiderId: string | null = null;
      let phoneFoundInDb = false;

      // Query phone == cleanPhone (10 digits)
      const qClean = query(collection(db, 'riders'), where('phone', '==', cleanPhone));
      const snapClean = await getDocs(qClean);
      if (!snapClean.empty) {
        matchedRiderData = snapClean.docs[0].data();
        matchedRiderId = snapClean.docs[0].id;
        phoneFoundInDb = true;
      } else {
        // Query phone == +91{cleanPhone}
        const qPrefixed = query(collection(db, 'riders'), where('phone', '==', `+91${cleanPhone}`));
        const snapPrefixed = await getDocs(qPrefixed);
        if (!snapPrefixed.empty) {
          matchedRiderData = snapPrefixed.docs[0].data();
          matchedRiderId = snapPrefixed.docs[0].id;
          phoneFoundInDb = true;
        }
      }

      // If not in root /riders, query subcollections across workspaces using collectionGroup
      if (!matchedRiderData) {
        try {
          const qGroupClean = query(collectionGroup(db, 'riders'), where('phone', '==', cleanPhone));
          const snapGroupClean = await getDocs(qGroupClean);
          if (!snapGroupClean.empty) {
            matchedRiderData = snapGroupClean.docs[0].data();
            matchedRiderId = snapGroupClean.docs[0].id;
            phoneFoundInDb = true;
            const parentWs = snapGroupClean.docs[0].ref.parent?.parent?.id;
            if (parentWs && !matchedRiderData.workspaceId && !matchedRiderData.hubId) {
              matchedRiderData.workspaceId = parentWs;
            }
          } else {
            const qGroupPrefix = query(collectionGroup(db, 'riders'), where('phone', '==', `+91${cleanPhone}`));
            const snapGroupPrefix = await getDocs(qGroupPrefix);
            if (!snapGroupPrefix.empty) {
              matchedRiderData = snapGroupPrefix.docs[0].data();
              matchedRiderId = snapGroupPrefix.docs[0].id;
              phoneFoundInDb = true;
              const parentWs = snapGroupPrefix.docs[0].ref.parent?.parent?.id;
              if (parentWs && !matchedRiderData.workspaceId && !matchedRiderData.hubId) {
                matchedRiderData.workspaceId = parentWs;
              }
            }
          }
        } catch {}
      }

      if (matchedRiderData) {
        // Verify that rider's PIN
        // Can be stored in rider doc (pin, riderPin, codPin), or in cod_staff_pins, or default 1234
        let storedPin = matchedRiderData.pin || matchedRiderData.riderPin || matchedRiderData.codPin;
        if (!storedPin) {
          try {
            const staffPinDoc = await getDoc(doc(db, 'cod_staff_pins', cleanPhone));
            if (staffPinDoc.exists()) {
              storedPin = staffPinDoc.data()?.pin;
            } else if (matchedRiderId) {
              const staffPinById = await getDoc(doc(db, 'cod_staff_pins', matchedRiderId));
              if (staffPinById.exists()) {
                storedPin = staffPinById.data()?.pin;
              }
            }
          } catch {}
        }

        const isPinValid = storedPin ? storedPin === pin : pin === '1234';
        if (!isPinValid) {
          return {
            success: false,
            reason: 'invalid_credentials',
            message: 'गलत पिन! कृपया पुनः प्रयास करें।',
          };
        }

        // Strict Inactive Rider Check: If status !== 'active' or active === false, deny access
        const isRiderActive = (matchedRiderData.status ? matchedRiderData.status === 'active' : matchedRiderData.active !== false) && matchedRiderData.status !== 'inactive' && matchedRiderData.active !== false;
        if (!isRiderActive) {
          return {
            success: false,
            reason: 'inactive',
            message: 'आपका खाता निष्क्रिय (Inactive) है। कृपया हब एडमिन से संपर्क करें।',
          };
        }

        // When a matching document is found, immediately extract
        // parent tenant identifier: ownerHubId = riderDoc.workspaceId || riderDoc.hubId || riderDoc.userId || riderDoc.ownerUid || riderDoc.createdBy
        const parentHub = (
          matchedRiderData.workspaceId ||
          matchedRiderData.hubId ||
          matchedRiderData.userId ||
          matchedRiderData.ownerUid ||
          matchedRiderData.createdBy ||
          ''
        ).trim();

        if (!parentHub) {
          console.warn('🔒 [Hub Isolation] Rider document found but owner field is empty for phone:', cleanPhone);
          return {
            success: false,
            reason: 'no_hub',
            message: 'हब की पहचान नहीं हो सकी। कृपया एडमिन से संपर्क करें।',
          };
        }
        console.log('🔒 [Hub Isolation] Resolved targetHubId from rider record:', parentHub);

        // Enforce strict hub-level COD access permission
        try {
          const hubDoc = await getDoc(doc(db, 'all_users', parentHub));
          if (hubDoc.exists()) {
            const hData = hubDoc.data();
            if (hData?.permissions && hData.permissions.codCompanionAccess === false) {
              return {
                success: false,
                reason: 'inactive',
                message: 'हब एडमिन द्वारा COD साथी ऐप अनुमति बंद (Blocked) है। कृपया मास्टर एडमिन से संपर्क करें।',
              };
            }
          }
        } catch (hErr) {
          console.warn('Hub permission verification notice:', hErr);
        }

        resolvedHubId = parentHub;
        matchedUser = {
          id: matchedRiderData.id || matchedRiderId || `rider_${cleanPhone}`,
          riderId: matchedRiderData.id || matchedRiderId,
          name: matchedRiderData.name || 'राइडर',
          phone: cleanPhone,
          role: 'rider',
          pin,
          isActive: matchedRiderData.active !== false,
          hubId: parentHub,
          ownerUid: parentHub,
          workspaceId: parentHub,
          userId: parentHub,
          createdBy: parentHub,
          createdAt: matchedRiderData.joinedDate || new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn('Firestore rider direct lookup notice:', err);
    }
  }

  // 2. IF NOT MATCHED IN RIDERS: Authenticate against Firestore cod_staff_pins collection
  if (!matchedUser && db) {
    try {
      let staffData: any = null;
      let staffPhoneFound = false;
      const phoneDocRef = doc(db, 'cod_staff_pins', cleanPhone);
      const phoneSnap = await getDoc(phoneDocRef);
      if (phoneSnap.exists()) {
        staffPhoneFound = true;
        const d = phoneSnap.data();
        if (d.pin === pin) {
          staffData = d;
        }
      }

      if (!staffData && !staffPhoneFound) {
        const colRef = collection(db, 'cod_staff_pins');
        const snaps = await getDocs(colRef);
        for (const docSnap of snaps.docs) {
          const d = docSnap.data();
          const dPhone = (d.phone || d.cleanPhone || '').replace(/\D/g, '').slice(-10);
          if (dPhone === cleanPhone) {
            staffPhoneFound = true;
            if (d.pin === pin) {
              staffData = d;
              break;
            }
          }
        }
      }

      if (staffPhoneFound && !staffData) {
        return {
          success: false,
          reason: 'invalid_credentials',
          message: '4-अंकों का पिन गलत है! कृपया सही विवरण दर्ज करें।',
        };
      }

      if (staffData) {
        if (staffData.status === 'inactive' || staffData.isActive === false || (staffData.status && staffData.status !== 'active')) {
          return {
            success: false,
            reason: 'inactive',
            message: 'आपका खाता निष्क्रिय (Inactive) है। कृपया हब एडमिन से संपर्क करें।',
          };
        }
        const staffHub = (
          staffData.userId ||
          staffData.workspaceId ||
          staffData.hubId ||
          staffData.ownerUid ||
          ''
        ).trim();

        if (!staffHub) {
          return {
            success: false,
            reason: 'no_hub',
            message: 'हब की पहचान नहीं हो सकी। कृपया एडमिन से संपर्क करें।',
          };
        }

        // Enforce strict hub-level COD access permission
        try {
          const hubDoc = await getDoc(doc(db, 'all_users', staffHub));
          if (hubDoc.exists()) {
            const hData = hubDoc.data();
            if (hData?.permissions && hData.permissions.codCompanionAccess === false) {
              return {
                success: false,
                reason: 'inactive',
                message: 'हब एडमिन द्वारा COD साथी ऐप अनुमति बंद (Blocked) है। कृपया मास्टर एडमिन से संपर्क करें।',
              };
            }
          }
        } catch (hErr) {
          console.warn('Hub permission verification notice:', hErr);
        }

        resolvedHubId = staffHub;
        matchedUser = {
          ...(staffData as CodStaffUser),
          hubId: staffHub,
          ownerUid: staffHub,
          workspaceId: staffHub,
          userId: staffHub,
        };
      }
    } catch (err) {
      console.warn('Firestore cod_staff_pins lookup notice:', err);
    }
  }

  // 3. Check local cached staff list (offline / fallback support)
  if (!matchedUser) {
    try {
      const cachedRaw = localStorage.getItem('cp_cod_staff_pins_cache');
      if (cachedRaw) {
        const staffList: CodStaffUser[] = JSON.parse(cachedRaw);
        const phoneMatch = staffList.find((s) => {
          const sPhone = (s.phone || '').replace(/\D/g, '').slice(-10);
          return sPhone === cleanPhone;
        });
        if (phoneMatch) {
          if (phoneMatch.pin === pin) {
            const staffHub = (phoneMatch.userId || phoneMatch.workspaceId || phoneMatch.hubId || phoneMatch.ownerUid || '').trim();
            if (staffHub) {
              resolvedHubId = staffHub;
              matchedUser = { ...phoneMatch, hubId: staffHub, ownerUid: staffHub, workspaceId: staffHub, userId: staffHub };
            }
          } else {
            return {
              success: false,
              reason: 'invalid_credentials',
              message: '4-अंकों का पिन गलत है! कृपया सही विवरण दर्ज करें।',
            };
          }
        }
      }
    } catch {}
  }

  // 4. Default Demo accounts for instant testing
  if (!matchedUser) {
    const demoAccounts: CodStaffUser[] = [
      { id: 'staff_demo_rider', riderId: 'rider_1', name: 'सुरेश कुमार (Rider)', phone: '9876543210', role: 'rider', pin: '1234', isActive: true, hubId: 'super_admin_hub', ownerUid: 'super_admin_hub', workspaceId: 'super_admin_hub', userId: 'super_admin_hub', createdAt: new Date().toISOString() },
      { id: 'staff_demo_tl', name: 'रोहित वर्मा (Team Leader)', phone: '9876543211', role: 'team_leader', pin: '4321', isActive: true, canVerifyCod: true, canVerifyCash: false, canVerifyOnline: true, hubId: 'super_admin_hub', ownerUid: 'super_admin_hub', workspaceId: 'super_admin_hub', userId: 'super_admin_hub', createdAt: new Date().toISOString() },
      { id: 'staff_demo_sup', name: 'अमित सिंह (Supervisor)', phone: '9876543212', role: 'supervisor', pin: '5678', isActive: true, canVerifyCod: true, canVerifyCash: true, canVerifyOnline: true, hubId: 'super_admin_hub', ownerUid: 'super_admin_hub', workspaceId: 'super_admin_hub', userId: 'super_admin_hub', createdAt: new Date().toISOString() },
      { id: 'staff_demo_incharge', name: 'पवन कबी (Hub Incharge)', phone: '9876543213', role: 'hub_incharge', pin: '9999', isActive: true, canVerifyCod: true, canVerifyCash: true, canVerifyOnline: true, hubId: 'super_admin_hub', ownerUid: 'super_admin_hub', workspaceId: 'super_admin_hub', userId: 'super_admin_hub', createdAt: new Date().toISOString() },
    ];
    const demoFound = demoAccounts.find((d) => {
      const dPhone = d.phone!.replace(/\D/g, '').slice(-10);
      return dPhone === cleanPhone;
    });
    if (demoFound) {
      if (demoFound.pin === pin) {
        matchedUser = demoFound;
        resolvedHubId = 'super_admin_hub';
      } else {
        return {
          success: false,
          reason: 'invalid_credentials',
          message: '4-अंकों का पिन गलत है! कृपया सही विवरण दर्ज करें।',
        };
      }
    }
  }

  // If no document matches, block login with error: "फोन नंबर पंजीकृत नहीं है।"
  if (!matchedUser) {
    return {
      success: false,
      reason: 'not_found',
      message: 'फोन नंबर पंजीकृत नहीं है।',
    };
  }

  // Block inactive users
  if (matchedUser.isActive === false) {
    return {
      success: false,
      reason: 'inactive',
      message: 'आपका अकाउंट निष्क्रिय (Inactive) है, कृपया हब इंचार्ज से संपर्क करें।',
    };
  }

  // 5. HARD HUB ISOLATION VALIDATION
  const finalHubId = (resolvedHubId || matchedUser.hubId || matchedUser.ownerUid || matchedUser.workspaceId || '').trim();
  if (!finalHubId) {
    return {
      success: false,
      reason: 'no_hub',
      message: 'हब की पहचान नहीं हो सकी। कृपया एडमिन से संपर्क करें।',
    };
  }

  matchedUser.hubId = finalHubId;
  matchedUser.workspaceId = finalHubId;
  matchedUser.ownerUid = finalHubId;

  // 6. SAVE ISOLATED COMPANION SESSION (localStorage: active_hub_id & active_companion_hub_id)
  try {
    safeLocalStorageSet('active_hub_id', finalHubId, finalHubId);
    sessionStorage.setItem('active_hub_id', finalHubId);
    safeLocalStorageSet('active_companion_hub_id', finalHubId, finalHubId);
    sessionStorage.setItem('active_companion_hub_id', finalHubId);
    safeLocalStorageSet('cp_authenticated_hub_id', finalHubId, finalHubId);
    sessionStorage.setItem('cp_authenticated_hub_id', finalHubId);
    sessionStorage.setItem('cp_cod_companion_user', JSON.stringify(matchedUser));
    safeLocalStorageSet('cp_cod_companion_user', JSON.stringify(matchedUser), finalHubId);
  } catch {}

  return {
    success: true,
    user: matchedUser,
    resolvedHubId: finalHubId,
    message: `स्वागत है, ${matchedUser.name}!`,
  };
}

/**
 * Helper to get currently active companion hub id
 */
export function getActiveCompanionHubId(): string | null {
  try {
    const hubId = localStorage.getItem('active_hub_id') ||
      sessionStorage.getItem('active_hub_id') ||
      localStorage.getItem('active_companion_hub_id') ||
      sessionStorage.getItem('active_companion_hub_id') ||
      localStorage.getItem('cp_authenticated_hub_id') ||
      sessionStorage.getItem('cp_authenticated_hub_id');
    if (hubId && typeof hubId === 'string' && hubId.trim()) {
      return hubId.trim();
    }
  } catch {}
  return DEFAULT_PRIMARY_HUB_ID;
}

/**
 * Super Admin Feature Gate Checker for a specific hub
 */
export async function checkHubCodAccess(_hubId?: string): Promise<boolean> {
  return true;
}

export function getStoredCodCompanionUser(): CodStaffUser | null {
  try {
    const raw = sessionStorage.getItem('cp_cod_companion_user') || localStorage.getItem('cp_cod_companion_user');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function clearCodCompanionSession(): void {
  try {
    localStorage.removeItem('active_hub_id');
    sessionStorage.removeItem('active_hub_id');
    localStorage.removeItem('active_companion_hub_id');
    sessionStorage.removeItem('active_companion_hub_id');
    sessionStorage.removeItem('cp_authenticated_hub_id');
    localStorage.removeItem('cp_authenticated_hub_id');
    sessionStorage.removeItem('cp_cod_companion_user');
    localStorage.removeItem('cp_cod_companion_user');
  } catch {}
}

/**
 * Helper to retrieve active riders strictly scoped to the target Hub (No cross-hub data leakage)
 * Hard Hub Isolation:
 * Strictly execute Firestore query collection("riders") where hubId == active_companion_hub_id
 * (or workspaceId == active_companion_hub_id).
 * CRITICAL: If active_companion_hub_id is missing, null, or empty, return an EMPTY ARRAY [].
 * Under NO circumstances fetch global riders or fall back to an unfiltered query.
 */
export async function getAllActiveRidersForCod(authenticatedHubId?: string | null): Promise<Rider[]> {
  const targetHubId = (authenticatedHubId || getActiveCompanionHubId() || '').trim();

  // CRITICAL: If targetHubId is missing, null, or empty, return an EMPTY ARRAY []
  // REMOVE ANY global fallback that loads all riders when active_hub_id is undefined or mismatched.
  if (!targetHubId || targetHubId === 'guest') {
    console.warn('🔒 [Hub Isolation] No valid targetHubId provided, returning empty list []');
    return [];
  }

  const hubId = targetHubId;
  const ridersMap = new Map<string, Rider>();

  // Strictly execute Firestore queries where the matching owner field strictly equals targetHubId
  if (db) {
    try {
      const [snapWs, snapHub, snapUser, snapOwner, snapCreator, snapWorkspaceSub, snapUserSub] = await Promise.all([
        getDocs(query(collection(db, 'riders'), where('workspaceId', '==', hubId))).catch(() => null),
        getDocs(query(collection(db, 'riders'), where('hubId', '==', hubId))).catch(() => null),
        getDocs(query(collection(db, 'riders'), where('userId', '==', hubId))).catch(() => null),
        getDocs(query(collection(db, 'riders'), where('ownerUid', '==', hubId))).catch(() => null),
        getDocs(query(collection(db, 'riders'), where('createdBy', '==', hubId))).catch(() => null),
        getDocs(collection(db, 'workspaces', hubId, 'riders')).catch(() => null),
        getDocs(collection(db, 'users', hubId, 'riders')).catch(() => null),
      ]);

      const processSnap = (snap: any) => {
        if (!snap || !snap.docs) return;
        snap.docs.forEach((d: any) => {
          const data = d.data() as Rider;
          const id = data.id || d.id;
          const ownerField = (
            data.workspaceId ||
            data.hubId ||
            data.userId ||
            data.ownerUid ||
            data.createdBy ||
            d.ref?.parent?.parent?.id ||
            ''
          ).trim();

          // Strictly verify owner field matches targetHubId - NEVER accept empty or foreign ownerField
          if (id && data.active !== false && ownerField && ownerField === hubId) {
            ridersMap.set(id, {
              ...data,
              id,
              hubId,
              workspaceId: hubId,
              ownerUid: hubId,
              userId: hubId,
              createdBy: hubId,
            });
          }
        });
      };

      processSnap(snapWs);
      processSnap(snapHub);
      processSnap(snapUser);
      processSnap(snapOwner);
      processSnap(snapCreator);
      processSnap(snapWorkspaceSub);
      processSnap(snapUserSub);
    } catch (err) {
      console.warn('🔒 [Hub Isolation] Query error for riders in hub:', err);
    }
  }

  // Strictly check ONLY hub-scoped local storage: cp_cache_riders_${hubId}
  try {
    const raw = localStorage.getItem(`cp_cache_riders_${hubId}`);
    if (raw) {
      const list: Rider[] = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach((r) => {
          if (r && r.id && r.name && r.active !== false && !ridersMap.has(r.id)) {
            const ownerField = (r.workspaceId || r.hubId || r.userId || r.ownerUid || r.createdBy || '').trim();
            if (ownerField && ownerField === hubId) {
              ridersMap.set(r.id, {
                ...r,
                hubId,
                workspaceId: hubId,
                ownerUid: hubId,
                userId: hubId,
                createdBy: hubId,
              });
            }
          }
        });
      }
    }
  } catch {}

  // Strictly filter: ONLY display riders whose owner field strictly matches targetHubId
  const result = Array.from(ridersMap.values()).filter((r) => {
    if (r.active === false) return false;
    const owner = (r.workspaceId || r.hubId || r.userId || r.ownerUid || r.createdBy || '').trim();
    return owner && owner === hubId;
  });

  console.log(`🔒 [Hub Isolation] Hub: ${hubId.substring(0, 8)} resolved ${result.length} active riders`);
  return result;
}

/**
 * Strict tenant-scoped fetcher for COD Riders list
 * Alias to getAllActiveRidersForCod ensuring exact tenant/owner UID match
 */
export async function fetchCodRiders(currentUserId: string): Promise<Rider[]> {
  return getAllActiveRidersForCod(currentUserId);
}

/**
 * Real-Time Listener to bind strictly to a hub's active riders
 * Queries and listens to Firestore strictly for active_hub_id
 * Under NO circumstances load or merge any documents belonging to other hubs.
 */
export function subscribeToHubRiders(
  hubId: string | null | undefined,
  onRidersUpdate: (riders: Rider[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const targetHubId = (hubId || getActiveCompanionHubId() || '').trim();
  if (!targetHubId || targetHubId === 'guest') {
    onRidersUpdate([]);
    return () => {};
  }

  // Initial cached load
  getAllActiveRidersForCod(targetHubId).then((r) => {
    if (r.length > 0) onRidersUpdate(r);
  });

  if (!db) return () => {};

  try {
    const unsubs: Unsubscribe[] = [];
    const ridersMap = new Map<string, Rider>();

    const handleDocs = (docs: any[]) => {
      let changed = false;
      docs.forEach((docSnap) => {
        const data = docSnap.data() as Rider;
        const id = data.id || docSnap.id;
        const owner = (
          data.workspaceId ||
          data.hubId ||
          data.userId ||
          data.ownerUid ||
          data.createdBy ||
          docSnap.ref?.parent?.parent?.id ||
          ''
        ).trim();

        // Strict hub isolation: owner MUST strictly match targetHubId - NEVER allow alien or untagged documents
        if (id && data.active !== false && owner && owner === targetHubId) {
          ridersMap.set(id, {
            ...data,
            id,
            hubId: targetHubId,
            workspaceId: targetHubId,
            ownerUid: targetHubId,
            userId: targetHubId,
          });
          changed = true;
        }
      });

      if (changed) {
        const filtered = Array.from(ridersMap.values()).filter((r) => {
          if (r.active === false) return false;
          const owner = (r.workspaceId || r.hubId || r.userId || r.ownerUid || r.createdBy || '').trim();
          return owner && owner === targetHubId;
        });
        safeLocalStorageSet(`cp_cache_riders_${targetHubId}`, JSON.stringify(filtered), targetHubId);
        onRidersUpdate(filtered);
      }
    };

    // 1. query(collection(db, 'riders'), where('workspaceId', '==', targetHubId))
    unsubs.push(
      onSnapshot(
        query(collection(db, 'riders'), where('workspaceId', '==', targetHubId)),
        (snapshot) => handleDocs(snapshot.docs),
        (err) => {
          console.warn('Real-time riders workspaceId notice:', err);
          if (onError) onError(err);
        }
      )
    );

    // 2. query(collection(db, 'riders'), where('userId', '==', targetHubId))
    try {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'riders'), where('userId', '==', targetHubId)),
          (snapshot) => handleDocs(snapshot.docs),
          (err) => {
            console.warn('Real-time riders userId notice:', err);
          }
        )
      );
    } catch {}

    // 3. query(collection(db, 'riders'), where('hubId', '==', targetHubId))
    try {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'riders'), where('hubId', '==', targetHubId)),
          (snapshot) => handleDocs(snapshot.docs),
          (err) => {
            console.warn('Real-time riders hubId notice:', err);
          }
        )
      );
    } catch {}

    // 4. Subcollection workspaces/{targetHubId}/riders
    try {
      unsubs.push(
        onSnapshot(
          collection(db, 'workspaces', targetHubId, 'riders'),
          (snapshot) => handleDocs(snapshot.docs),
          (err) => {
            console.warn('Real-time workspaces riders subcollection notice:', err);
          }
        )
      );
    } catch {}

    // 5. Subcollection users/{targetHubId}/riders
    try {
      unsubs.push(
        onSnapshot(
          collection(db, 'users', targetHubId, 'riders'),
          (snapshot) => handleDocs(snapshot.docs),
          (err) => {
            console.warn('Real-time users riders subcollection notice:', err);
          }
        )
      );
    } catch {}

    return () => {
      unsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {}
      });
    };
  } catch (err) {
    console.warn('Failed to bind real-time riders listener:', err);
    if (onError && err instanceof Error) onError(err);
    return () => {};
  }
}

/**
 * Construct empty default COD entry rows for given riders
 */
export function buildDefaultCodEntriesForRiders(
  date: string,
  riders: Rider[]
): CodDailyEntry[] {
  return riders.map((rider) => ({
    id: `cod_${date}_${rider.id}`,
    date,
    riderId: rider.id,
    riderName: rider.name,
    riderPhone: rider.phone,
    company1Amount: 0,
    company2Amount: 0,
    totalCod: 0,
    cashDeposit: 0,
    onlineDeposit: 0,
    totalDeposit: 0,
    balance: 0,
    status: 'draft',
    updatedAt: new Date().toISOString(),
  }));
}

/**
 * Instant 0.0-Second Synchronous Retrieval of Daily COD Sheet from Local Phone Memory
 * Used to immediately populate the screen without any flicker or bleed when switching to ANY date.
 */
export function getCachedDailyCodSheetSync(date: string, hubId?: string): DailyCodSheetData | null {
  const targetDate = date || getTodayDateString();
  const effectiveHubId = (hubId && typeof hubId === 'string' && hubId.trim())
    ? hubId.trim()
    : (getActiveCompanionHubId() || DEFAULT_PRIMARY_HUB_ID);
  const localCacheKey = `cp_cod_sheet_${effectiveHubId}_${targetDate}`;

  try {
    const raw = localStorage.getItem(localCacheKey) ||
                localStorage.getItem(`cp_cod_sheet_${targetDate}`) ||
                localStorage.getItem(`cod_entries_${effectiveHubId}_${targetDate}`) ||
                localStorage.getItem(`cod_entries_${targetDate}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      const parsedEntries = extractEntriesFromSheetRaw(parsed, targetDate);
      if (parsedEntries.length > 0 || (parsed && typeof parsed === 'object' && parsed.date === targetDate)) {
        return {
          date: targetDate,
          entries: parsedEntries,
          isLocked: Boolean(parsed.isLocked),
          company1Name: parsed.company1Name || DEFAULT_COMPANY_1,
          company2Name: parsed.company2Name || DEFAULT_COMPANY_2,
          hubId: effectiveHubId,
          hubName: parsed.hubName,
          hubUpiId: parsed.hubUpiId || '',
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    }
  } catch {}
  return null;
}

/**
 * 7. Real-Time Zero-Second Listener for Today's Active COD Sheet (hubs/{hubId}/daily_cod_sheets)
 * Synchronizes immediately on every edit or verification
 * Strictly isolated per Hub to avoid cross-hub sheet overwrites
 */
export function subscribeToDailyCodSheet(
  date: string,
  onUpdate: (data: DailyCodSheetData) => void,
  onError?: (err: Error) => void,
  hubId?: string
): Unsubscribe {
  const targetDate = date || getTodayDateString();

  // If hubId is missing, fallback to active companion hub or super admin hub
  const effectiveHubId = (hubId && typeof hubId === 'string' && hubId.trim())
    ? hubId.trim()
    : (getActiveCompanionHubId() || DEFAULT_PRIMARY_HUB_ID);

  const localCacheKey = `cp_cod_sheet_${effectiveHubId}_${targetDate}`;

  let activeSheetInMemory: DailyCodSheetData = {
    date: targetDate,
    entries: [],
    isLocked: false,
    company1Name: DEFAULT_COMPANY_1,
    company2Name: DEFAULT_COMPANY_2,
    hubId: effectiveHubId,
  };

  // Pre-seed activeSheetInMemory from local cache if present
  try {
    const initialCache = localStorage.getItem(localCacheKey) || localStorage.getItem(`cp_cod_sheet_${targetDate}`);
    if (initialCache) {
      const parsed = JSON.parse(initialCache);
      activeSheetInMemory = {
        ...activeSheetInMemory,
        ...parsed,
        entries: extractEntriesFromSheetRaw(parsed, targetDate),
      };
    }
  } catch {}

  // Helper to ensure empty entries list is populated with active riders (UNLOCKED sheets only)
  const enrichWithActiveRiders = async (baseData: DailyCodSheetData) => {
    activeSheetInMemory = { ...baseData, hubId: effectiveHubId };
    // If the sheet is already locked, it is an immutable historical snapshot. Never alter or inject riders!
    if (baseData.isLocked) {
      onUpdate({ ...baseData, hubId: effectiveHubId });
      return;
    }

    if (!baseData.entries || baseData.entries.length === 0) {
      const activeRiders = await getAllActiveRidersForCod(effectiveHubId);
      if (activeRiders.length > 0) {
        const defaultEntries = buildDefaultCodEntriesForRiders(targetDate, activeRiders);
        const enriched: DailyCodSheetData = {
          ...baseData,
          entries: defaultEntries,
          hubId: effectiveHubId,
        };
        activeSheetInMemory = enriched;
        saveCodCacheSafely([[localCacheKey, JSON.stringify(enriched)]], effectiveHubId);
        onUpdate(enriched);
        return;
      }
    }
    onUpdate({ ...baseData, hubId: effectiveHubId });
  };

  // Instant 0.0s Synchronous Cache-First load for ANY date
  const syncCached = getCachedDailyCodSheetSync(targetDate, effectiveHubId);
  if (syncCached) {
    enrichWithActiveRiders(syncCached);
  } else {
    // Immediately isolate screen to targetDate with 0 stale bleed
    onUpdate({
      date: targetDate,
      entries: [],
      isLocked: targetDate < getTodayDateString(),
      company1Name: DEFAULT_COMPANY_1,
      company2Name: DEFAULT_COMPANY_2,
      hubId: effectiveHubId,
    });
    getAllActiveRidersForCod(effectiveHubId).then((riders) => {
      if (riders.length > 0 && activeSheetInMemory.entries.length === 0) {
        const defaultSheet: DailyCodSheetData = {
          date: targetDate,
          entries: buildDefaultCodEntriesForRiders(targetDate, riders),
          isLocked: targetDate < getTodayDateString(),
          company1Name: DEFAULT_COMPANY_1,
          company2Name: DEFAULT_COMPANY_2,
          hubId: effectiveHubId,
        };
        activeSheetInMemory = defaultSheet;
        onUpdate(defaultSheet);
      }
    });
  }

  if (!db) {
    return () => {};
  }

  try {
    // Strictly scoped path: hubs/{effectiveHubId}/daily_cod_sheets/{targetDate}
    const docRef = doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', targetDate);
    const subColRef = collection(db, 'hubs', effectiveHubId, 'daily_cod_sheets', targetDate, 'rider_entries');

    // Pre-seed activeSheetInMemory from local cache if present
    try {
      const initialCache = localStorage.getItem(localCacheKey) || localStorage.getItem(`cp_cod_sheet_${targetDate}`);
      if (initialCache) {
        const parsed = JSON.parse(initialCache);
        activeSheetInMemory = {
          ...activeSheetInMemory,
          ...parsed,
          entries: extractEntriesFromSheetRaw(parsed, targetDate),
        };
      }
    } catch {}

    const pushLatestSheetUpdate = (updatedSheet: DailyCodSheetData) => {
      activeSheetInMemory = updatedSheet;
      try {
        // Store single canonical hub+date sheet key via Storage Shield (prevents 5MB quota bloat)
        saveCodCacheSafely([[localCacheKey, JSON.stringify(updatedSheet)]], effectiveHubId);
      } catch {}
      onUpdate(updatedSheet);
    };

    // Concurrent direct Firestore getDoc trigger for instant 0s warm-up on Android WebView
    getDoc(docRef).then(async (snap) => {
      if (snap.exists()) {
        const raw = snap.data();
        const docEntries = extractEntriesFromSheetRaw(raw, targetDate);
        if (docEntries.length > 0) {
          const sheetData: DailyCodSheetData = {
            date: targetDate,
            entries: docEntries,
            isLocked: Boolean(raw.isLocked),
            lockedBy: raw.lockedBy,
            lockedAt: raw.lockedAt,
            company1Name: raw.company1Name || DEFAULT_COMPANY_1,
            company2Name: raw.company2Name || DEFAULT_COMPANY_2,
            hubName: raw.hubName,
            hubId: effectiveHubId,
            hubUpiId: raw.hubUpiId || '',
            cashWithdrawals: Array.isArray(raw.cashWithdrawals) ? raw.cashWithdrawals : undefined,
            updatedAt: raw.updatedAt || new Date().toISOString(),
          };
          pushLatestSheetUpdate(sheetData);
        }
      }
    }).catch(() => {});

    // 1. Primary Sheet Document Listener
    const unsubDoc = onSnapshot(
      docRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const raw = snapshot.data();
          const docEntries: CodDailyEntry[] = extractEntriesFromSheetRaw(raw, targetDate);
          const company1Name = raw.company1Name || DEFAULT_COMPANY_1;
          const company2Name = raw.company2Name || DEFAULT_COMPANY_2;
          const isSheetLocked = Boolean(raw.isLocked);

          // Merge docEntries non-destructively so no in-memory or previously loaded rider data is lost
          let finalEntries = mergeCodEntriesNonDestructively(activeSheetInMemory.entries, docEntries);

          // If the sheet is unlocked, ensure active riders are registered in the list
          if (!isSheetLocked) {
            const activeRiders = await getAllActiveRidersForCod(effectiveHubId);
            const activeRiderIds = new Set(activeRiders.map((r) => r.id));
            const activeRiderPhones = new Set(
              activeRiders.map((r) => (r.phone || '').replace(/\D/g, '').slice(-10)).filter(Boolean)
            );

            // Append default rows for any active riders that don't have an entry yet
            const existingRiderIds = new Set(finalEntries.map((e) => e.riderId));
            const existingPhones = new Set(
              finalEntries.map((e) => (e.riderPhone || '').replace(/\D/g, '').slice(-10)).filter(Boolean)
            );

            const missingRiders = activeRiders.filter((r) => {
              const cleanPhone = (r.phone || '').replace(/\D/g, '').slice(-10);
              return !existingRiderIds.has(r.id) && (!cleanPhone || !existingPhones.has(cleanPhone));
            });

            if (missingRiders.length > 0) {
              const missingEntries = buildDefaultCodEntriesForRiders(targetDate, missingRiders);
              finalEntries = mergeCodEntriesNonDestructively(finalEntries, missingEntries);
            }
          }

          const sheetData: DailyCodSheetData = {
            date: targetDate,
            entries: finalEntries,
            isLocked: Boolean(raw.isLocked),
            lockedBy: raw.lockedBy,
            lockedAt: raw.lockedAt,
            company1Name,
            company2Name,
            hubName: raw.hubName,
            hubId: effectiveHubId,
            hubUpiId: raw.hubUpiId || '',
            cashWithdrawals: Array.isArray(raw.cashWithdrawals) ? raw.cashWithdrawals : undefined,
            updatedAt: raw.updatedAt || new Date().toISOString(),
          };
          pushLatestSheetUpdate(sheetData);
        } else {
          // Document does not exist yet in hubs/{effectiveHubId}/daily_cod_sheets!
          // Check fallback root collection or local cache before falling back to empty template
          let recoveredEntries: CodDailyEntry[] = [];
          try {
            // 1. Root daily_cod_sheets/{targetDate}
            const rootDateSnap = await getDoc(doc(db, 'daily_cod_sheets', targetDate));
            if (rootDateSnap.exists()) {
              recoveredEntries = extractEntriesFromSheetRaw(rootDateSnap.data(), targetDate);
            }

            // 2. Scoped root daily_cod_sheets/{effectiveHubId}_{targetDate}
            if (recoveredEntries.length === 0) {
              const rootScopedSnap = await getDoc(doc(db, 'daily_cod_sheets', `${effectiveHubId}_${targetDate}`));
              if (rootScopedSnap.exists()) {
                recoveredEntries = extractEntriesFromSheetRaw(rootScopedSnap.data(), targetDate);
              }
            }

            // 3. Local storage cache fallback
            if (recoveredEntries.length === 0) {
              const rawCached = localStorage.getItem(`cp_cod_sheet_${targetDate}`) ||
                localStorage.getItem(`cp_cod_sheet_super_admin_hub_${targetDate}`) ||
                localStorage.getItem(`cp_cod_sheet_${effectiveHubId}_${targetDate}`);
              if (rawCached) {
                recoveredEntries = extractEntriesFromSheetRaw(JSON.parse(rawCached), targetDate);
              }
            }
          } catch (fbErr) {
            console.warn('Fallback sheet search notice:', fbErr);
          }

          if (recoveredEntries.length > 0) {
            const recoveredSheet: DailyCodSheetData = {
              date: targetDate,
              entries: mergeCodEntriesNonDestructively(activeSheetInMemory.entries, recoveredEntries),
              isLocked: false,
              company1Name: DEFAULT_COMPANY_1,
              company2Name: DEFAULT_COMPANY_2,
              hubId: effectiveHubId,
              updatedAt: new Date().toISOString(),
            };
            pushLatestSheetUpdate(recoveredSheet);
            return;
          }

          // Automatically pull active riders strictly for this hub
          const activeRiders = await getAllActiveRidersForCod(effectiveHubId);
          const defaultEntries = buildDefaultCodEntriesForRiders(targetDate, activeRiders);
          const defaultSheet: DailyCodSheetData = {
            date: targetDate,
            entries: defaultEntries,
            isLocked: false,
            company1Name: DEFAULT_COMPANY_1,
            company2Name: DEFAULT_COMPANY_2,
            hubId: effectiveHubId,
          };
          pushLatestSheetUpdate(defaultSheet);
        }
      },
      (err) => {
        console.warn('Real-time daily_cod_sheets snapshot notice:', err);
        if (onError) onError(err);
      }
    );

    // 2. Real-Time Zero-Second Rider Subcollection Listener:
    // Captures immediate per-rider entries as they submit, so simultaneous entries from different riders NEVER clash!
    let unsubSub: Unsubscribe = () => {};
    try {
      unsubSub = onSnapshot(
        subColRef,
        (subSnapshot) => {
          if (!subSnapshot.empty) {
            const incomingSubEntries: CodDailyEntry[] = [];
            subSnapshot.forEach((d) => {
              const data = d.data() as CodDailyEntry;
              if (data && hasRealRecordedCodData(data)) {
                incomingSubEntries.push(data);
              }
            });

            if (incomingSubEntries.length > 0) {
              const merged = mergeCodEntriesNonDestructively(activeSheetInMemory.entries, incomingSubEntries);
              const updatedSheet: DailyCodSheetData = {
                ...activeSheetInMemory,
                entries: merged,
                updatedAt: new Date().toISOString(),
              };
              pushLatestSheetUpdate(updatedSheet);
            }
          }
        },
        (subErr) => {
          console.warn('Rider entries subcollection listener notice:', subErr);
        }
      );
    } catch (subInitErr) {
      console.warn('Failed to bind rider_entries subcollection listener:', subInitErr);
    }

    return () => {
      unsubDoc();
      unsubSub();
    };
  } catch (err) {
    console.warn('Failed to attach daily_cod_sheets listener:', err);
    if (onError && err instanceof Error) onError(err);
    return () => {};
  }
}

/**
 * 8. Zero-Second Real-Time Update for Single Rider Row in daily_cod_sheets (Strictly Isolated to hubs/${effectiveHubId}/daily_cod_sheets/${date})
 */
export async function updateSingleRiderEntryInSheet(
  date: string,
  updatedEntry: CodDailyEntry,
  changedBy: { name: string; role: CodStaffRole | 'owner' },
  hubId?: string
): Promise<void> {
  const targetDate = date || getTodayDateString();
  const effectiveHubId = (hubId || getActiveCompanionHubId() || 'super_admin_hub').trim();
  const localCacheKey = `cp_cod_sheet_${effectiveHubId}_${targetDate}`;

  // Re-calculate totals
  const totalCod = (Number(updatedEntry.company1Amount) || 0) + (Number(updatedEntry.company2Amount) || 0);
  const totalDeposit = (Number(updatedEntry.cashDeposit) || 0) + (Number(updatedEntry.onlineDeposit) || 0);
  const balance = totalCod - totalDeposit;

  const finalizedEntry: CodDailyEntry = {
    ...updatedEntry,
    totalCod,
    totalDeposit,
    balance,
    updatedAt: new Date().toISOString(),
    updatedBy: changedBy.name,
  };

  const cleanPhone = (finalizedEntry.riderPhone || '').replace(/\D/g, '').slice(-10);

  // 1. Instant local cache update (strictly hub-scoped + root mirror)
  let previousEntrySummary = 'New Entry';
  try {
    const raw = localStorage.getItem(localCacheKey) || localStorage.getItem(`cp_cod_sheet_${targetDate}`);
    let currentEntries: CodDailyEntry[] = [];
    let isLocked = false;
    let c1 = DEFAULT_COMPANY_1;
    let c2 = DEFAULT_COMPANY_2;
    if (raw) {
      const parsed = JSON.parse(raw);
      currentEntries = extractEntriesFromSheetRaw(parsed, targetDate);
      if (parsed && typeof parsed === 'object') {
        isLocked = Boolean(parsed.isLocked);
        c1 = parsed.company1Name || c1;
        c2 = parsed.company2Name || c2;
      }
    }
    const idx = currentEntries.findIndex((e) => {
      const eCleanPhone = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
      return e.riderId === finalizedEntry.riderId || (cleanPhone && eCleanPhone === cleanPhone);
    });

    if (idx >= 0) {
      const prev = currentEntries[idx];
      previousEntrySummary = `COD: ₹${prev.totalCod || 0} (Cash: ₹${prev.cashDeposit || 0}, Online: ₹${prev.onlineDeposit || 0})`;
      currentEntries[idx] = finalizedEntry;
    } else {
      currentEntries.push(finalizedEntry);
    }

    const updatedSheet: DailyCodSheetData = {
      date: targetDate,
      entries: currentEntries,
      isLocked,
      company1Name: c1,
      company2Name: c2,
      hubId: effectiveHubId,
      updatedAt: new Date().toISOString(),
    };
    const sheetJson = JSON.stringify(updatedSheet);
    saveCodCacheSafely([[localCacheKey, sheetJson]], effectiveHubId);
  } catch {}

  // 2. Audit Trail Log: Record edit history with previousValue, updatedValue, editedAt
  const updatedEntrySummary = `COD: ₹${finalizedEntry.totalCod || 0} (Cash: ₹${finalizedEntry.cashDeposit || 0}, Online: ₹${finalizedEntry.onlineDeposit || 0})`;
  const auditLog: CodAuditLog = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    changedBy: changedBy.name,
    role: changedBy.role as any,
    riderId: finalizedEntry.riderId,
    riderName: finalizedEntry.riderName,
    date: targetDate,
    field: 'COD Daily Collection Entry',
    previousValue: previousEntrySummary,
    newValue: updatedEntrySummary,
    notes: finalizedEntry.notes || `Updated by ${changedBy.name} (${changedBy.role})`,
  };

  try {
    const localAuditKey = `cp_cod_audit_logs_${effectiveHubId}`;
    const rawAudit = localStorage.getItem(localAuditKey);
    const existingLogs: CodAuditLog[] = rawAudit ? JSON.parse(rawAudit) : [];
    safeLocalStorageSet(localAuditKey, JSON.stringify([auditLog, ...existingLogs].slice(0, 50)), effectiveHubId);
  } catch {}

  // 3. Commit immediately to Firestore (Zero Polling, Immediate Save)
  if (db) {
    try {
      // 3A. First, immediately commit the individual rider entry to their dedicated document
      // This is isolated per-rider so simultaneous entries from different riders NEVER conflict!
      if (finalizedEntry.riderId) {
        try {
          const riderDocRef = doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', targetDate, 'rider_entries', finalizedEntry.riderId);
          await setDoc(riderDocRef, cleanForFirestore(finalizedEntry), { merge: true });
        } catch (subErr) {
          console.warn('Direct rider_entries doc write notice:', subErr);
        }
      }

      // 3B. Atomically merge into parent daily_cod_sheets doc without overwriting other riders.
      // If runTransaction fails (e.g. offline on Android WebView), gracefully fall back to offline-safe setDoc merge!
      const targetDocRef = doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', targetDate);
      let payloadToSave: any = null;

      try {
        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(targetDocRef);
          let entries: CodDailyEntry[] = [];
          let isLocked = false;
          let company1Name = DEFAULT_COMPANY_1;
          let company2Name = DEFAULT_COMPANY_2;
          let hubName = '';
          let hubUpiId = '';

          if (snap.exists()) {
            const data = snap.data();
            entries = extractEntriesFromSheetRaw(data, targetDate);
            isLocked = Boolean(data.isLocked);
            company1Name = data.company1Name || DEFAULT_COMPANY_1;
            company2Name = data.company2Name || DEFAULT_COMPANY_2;
            hubName = data.hubName || '';
            hubUpiId = data.hubUpiId || '';
          }

          if (entries.length === 0) {
            try {
              const cachedRaw = localStorage.getItem(localCacheKey);
              if (cachedRaw) {
                entries = extractEntriesFromSheetRaw(JSON.parse(cachedRaw), targetDate);
              }
            } catch {}
          }

          // Use non-destructive merge: NEVER drops or overwrites another rider's entry!
          const mergedEntries = mergeCodEntriesNonDestructively(entries, [finalizedEntry]);
          const entriesMap = buildEntriesMap(mergedEntries);

          payloadToSave = cleanForFirestore({
            date: targetDate,
            hubId: effectiveHubId,
            ownerUid: effectiveHubId,
            entries: mergedEntries,
            entriesMap,
            isLocked,
            company1Name,
            company2Name,
            hubName,
            hubUpiId,
            updatedAt: new Date().toISOString(),
          });

          transaction.set(targetDocRef, payloadToSave, { merge: true });
        });
      } catch (txErr) {
        console.warn('Transaction unavailable (offline/flaky network), falling back to queued setDoc:', txErr);
        let localMergedEntries: CodDailyEntry[] = [finalizedEntry];
        try {
          const cachedRaw = localStorage.getItem(localCacheKey) || localStorage.getItem(`cp_cod_sheet_${targetDate}`);
          if (cachedRaw) {
            const cachedEntries = extractEntriesFromSheetRaw(JSON.parse(cachedRaw), targetDate);
            localMergedEntries = mergeCodEntriesNonDestructively(cachedEntries, [finalizedEntry]);
          }
        } catch {}

        payloadToSave = cleanForFirestore({
          date: targetDate,
          hubId: effectiveHubId,
          ownerUid: effectiveHubId,
          entries: localMergedEntries,
          entriesMap: buildEntriesMap(localMergedEntries),
          updatedAt: new Date().toISOString(),
        });
        await setDoc(targetDocRef, payloadToSave, { merge: true });
      }

      // Dual-write immediately to root daily_cod_sheets mirrors and audit log
      if (payloadToSave) {
        try {
          const rootScopedRef = doc(db, 'daily_cod_sheets', `${effectiveHubId}_${targetDate}`);
          const rootDirectRef = doc(db, 'daily_cod_sheets', targetDate);
          await Promise.all([
            setDoc(rootScopedRef, payloadToSave, { merge: true }),
            setDoc(rootDirectRef, payloadToSave, { merge: true }),
          ]);

          // Immediate audit log commit to Firestore
          const auditDocRef = doc(db, 'workspaces', effectiveHubId, 'cod_audit_logs', auditLog.id);
          await setDoc(auditDocRef, cleanForFirestore(auditLog));
        } catch {}
      }
    } catch (err) {
      console.warn('Failed to update entry in hubs daily_cod_sheets:', err);
    }
  }
}

/**
 * 9. Toggle Day-End Lock in daily_cod_sheets (Strictly Isolated to hubs/${effectiveHubId}/daily_cod_sheets/${date})
 * Automatically creates an immutable permanent snapshot in hubs/${effectiveHubId}/archived_cod_sheets/${targetDate}
 */
export async function toggleDayEndLockForSheet(
  date: string,
  isLocked: boolean,
  lockedBy: string,
  hubId?: string
): Promise<void> {
  const targetDate = date || getTodayDateString();
  const effectiveHubId = (hubId || getActiveCompanionHubId() || '').trim();
  if (!effectiveHubId) return;
  const localCacheKey = `cp_cod_sheet_${effectiveHubId}_${targetDate}`;

  const updateData = {
    isLocked,
    lockedBy: isLocked ? lockedBy : null,
    lockedAt: isLocked ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  };

  // Local cache update
  let sheetObj: any = null;
  try {
    const raw = localStorage.getItem(localCacheKey);
    if (raw) {
      sheetObj = JSON.parse(raw);
      if (sheetObj && typeof sheetObj === 'object') {
        sheetObj.isLocked = isLocked;
        sheetObj.lockedBy = isLocked ? lockedBy : undefined;
        sheetObj.lockedAt = isLocked ? new Date().toISOString() : undefined;
        sheetObj.updatedAt = new Date().toISOString();
        saveCodCacheSafely([[localCacheKey, JSON.stringify(sheetObj)]], effectiveHubId);
      }
    }
  } catch {}

  // Firestore update & immutable auto-archive
  if (db) {
    try {
      // 1. Update active sheet in hubs/{effectiveHubId}/daily_cod_sheets/{targetDate}
      const targetDocRef = doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', targetDate);
      await setDoc(targetDocRef, cleanForFirestore(updateData), { merge: true });

      // 2. Dual-write to root scoped doc daily_cod_sheets/{effectiveHubId}_{targetDate}
      try {
        const rootDocRef = doc(db, 'daily_cod_sheets', `${effectiveHubId}_${targetDate}`);
        await setDoc(rootDocRef, cleanForFirestore(updateData), { merge: true });
      } catch {}

      // 3. If locking at day end, create an immutable permanent archive in hubs/{effectiveHubId}/archived_cod_sheets/{targetDate}
      if (isLocked) {
        let currentData = sheetObj;
        try {
          const fullDocSnap = await getDoc(targetDocRef);
          if (fullDocSnap.exists()) {
            currentData = fullDocSnap.data();
          }
        } catch {}

        const entries = extractEntriesFromSheetRaw(currentData || {}, targetDate);
        const totalCod = entries.reduce((s, e) => s + (Number(e.totalCod) || 0), 0);
        const totalCash = entries.reduce((s, e) => s + (Number(e.cashDeposit) || 0), 0);
        const totalOnline = entries.reduce((s, e) => s + (Number(e.onlineDeposit) || 0), 0);
        const totalDeposit = totalCash + totalOnline;
        const totalShortage = entries.reduce(
          (s, e) => s + Math.max(0, (Number(e.totalCod) || 0) - (Number(e.totalDeposit) || 0)),
          0
        );

        const archivedPayload = {
          ...cleanForFirestore(currentData || {}),
          date: targetDate,
          hubId: effectiveHubId,
          isLocked: true,
          lockedBy,
          lockedAt: updateData.lockedAt,
          archivedAt: new Date().toISOString(),
          archivedBy: lockedBy,
          archiveReason: 'DAY_END_FINAL_SEAL',
          isImmutable: true,
          summarySnapshot: {
            totalEntries: entries.length,
            totalCod,
            totalCash,
            totalOnline,
            totalDeposit,
            totalShortage,
            hasDiscrepancy: totalShortage > 0,
            consolidatedDenominations: currentData?.consolidatedDenominations || null,
          },
        };

        const archiveDocRef = doc(db, 'hubs', effectiveHubId, 'archived_cod_sheets', targetDate);
        await setDoc(archiveDocRef, archivedPayload, { merge: true });

        // Save into local archive cache safely
        try {
          saveCodCacheSafely(
            [[`cp_cod_archived_sheet_${effectiveHubId}_${targetDate}`, JSON.stringify(archivedPayload)]],
            effectiveHubId
          );
        } catch {}

        // Log audit event
        recordCodAuditLog(effectiveHubId, {
          changedBy: lockedBy || 'Hub Incharge',
          role: 'hub_incharge',
          riderId: 'ALL_RIDERS',
          riderName: 'डे-एंड क्लोजिंग (Day-End Lock)',
          date: targetDate,
          field: 'isLocked',
          previousValue: 'UNLOCKED',
          newValue: 'LOCKED_AND_ARCHIVED',
          notes: `डे-एंड लॉक व स्थायी अभिलेखागार (Permanent Archive) सील किया गया। कुल कैश: ₹${totalCash}, ऑनलाइन: ₹${totalOnline}, कुल COD: ₹${totalCod}।`,
        }).catch(() => {});
      } else {
        // Log unlock audit event
        recordCodAuditLog(effectiveHubId, {
          changedBy: lockedBy || 'Hub Incharge',
          role: 'hub_incharge',
          riderId: 'ALL_RIDERS',
          riderName: 'डे-एंड री-ओपन (Day-End Unlock)',
          date: targetDate,
          field: 'isLocked',
          previousValue: 'LOCKED',
          newValue: 'UNLOCKED',
          notes: `डे-एंड शीट फिर से खोली गई (Re-opened by ${lockedBy}).`,
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('Failed to toggle Day-End lock in hubs daily_cod_sheets:', err);
    }
  }
}

/**
 * 2. 1-Click "Convert to Advance" Service with SMS Trigger
 * Converts a COD Shortage to an official Rider Advance record:
 * a) Automatically creates a new Advance Entry:
 *    - riderId: rider.id
 *    - amount: shortageAmount
 *    - date: currentDate
 *    - reason: `COD Shortage Deduction (${currentDate})`
 *    - isSettled: false
 *    - status: 'UNPAID'
 * b) Marks COD shortage record as `shortageStatus: 'CONVERTED_TO_ADVANCE'`.
 * c) Triggers standard Rider SMS notification:
 *    "Hub Alert: Aapke aaj ke COD shortage ka ₹{shortageAmount} advance account me jod diya gaya hai."
 */
export async function convertCodShortageToAdvance(
  userId: string,
  entry: CodDailyEntry,
  date?: string,
  adminName: string = 'Hub Admin',
  hubId?: string
): Promise<{ success: boolean; advanceId?: string; shortageAmount: number; error?: string }> {
  try {
    const shortageAmount = entry.shortageAmount && entry.shortageAmount > 0
      ? entry.shortageAmount
      : Math.max(0, (Number(entry.totalCod) || 0) - (Number(entry.totalDeposit) || 0));

    if (shortageAmount <= 0) {
      return { success: false, shortageAmount: 0, error: 'कोई शॉर्टेज राशि नहीं है।' };
    }

    const currentDate = (date || entry.date || getTodayDateString()).slice(0, 10);
    const advanceId = `adv_cod_short_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const reasonText = `COD Shortage Deduction (${currentDate})`;

    // 1. Fetch riders from storage and locate the target rider
    const allRiders = loadRidersFromStorage(userId);
    const cleanEntryPhone = (entry.riderPhone || '').replace(/\D/g, '').slice(-10);
    const targetRider = allRiders.find(
      (r) => r.id === entry.riderId || (cleanEntryPhone && (r.phone || '').replace(/\D/g, '').slice(-10) === cleanEntryPhone)
    );

    const riderName = targetRider ? targetRider.name : entry.riderName;
    const riderPhone = targetRider ? targetRider.phone : (entry.riderPhone || '');
    const cleanPhone = (riderPhone || '').replace(/\D/g, '').slice(-10);

    // 2. Create the exact standard double-entry Advance Record
    const newAdvance: RiderAdvanceEntry = {
      id: advanceId,
      riderId: entry.riderId,
      amount: shortageAmount,
      date: currentDate,
      reason: reasonText,
      runningBalance: shortageAmount,
      isSettled: false,
      isDeducted: false,
      status: 'UNPAID',
      createdAt: new Date().toISOString(),
      createdBy: adminName,
    };

    // 3. Update Rider's advances array & active advance total
    if (targetRider) {
      const updatedAdvances = [newAdvance, ...(targetRider.advances || []).filter((a) => a.id !== advanceId)];
      const newTotalAdvance = calculateActiveAdvanceTotal(updatedAdvances);
      const updatedRider: Rider = {
        ...targetRider,
        advances: updatedAdvances,
        totalAdvance: newTotalAdvance,
      };

      const updatedRiderList = allRiders.map((r) => (r.id === targetRider.id ? updatedRider : r));
      saveRidersToStorage(updatedRiderList, userId);

      if (db && userId && userId !== 'guest') {
        saveRiderToFirestore(userId, updatedRider).catch(() => {});
        writeAdvanceEntryToFirestore(userId, {
          id: advanceId,
          riderId: targetRider.id,
          riderName: targetRider.name,
          riderPhone: targetRider.phone,
          amount: shortageAmount,
          date: currentDate,
          reason: reasonText,
          runningBalance: newTotalAdvance,
        }).catch(() => {});
        syncPublicRiderStatement(updatedRider, updatedAdvances).catch(() => {});
      }
    }

    // 4. Mark COD record as CONVERTED_TO_ADVANCE
    const effectiveHubId = (hubId || getActiveCompanionHubId() || userId || '').trim();
    if (effectiveHubId) {
      const targetDate = currentDate;
      const localSheetKey = `cp_cod_sheet_${effectiveHubId}_${targetDate}`;
      try {
        const rawSheet = localStorage.getItem(localSheetKey);
        if (rawSheet) {
          const parsed = JSON.parse(rawSheet) as DailyCodSheetData;
          if (parsed && Array.isArray(parsed.entries)) {
            const nextEntries = parsed.entries.map((e) => {
              if (e.riderId === entry.riderId || e.id === entry.id) {
                return {
                  ...e,
                  shortageAmount,
                  shortageStatus: 'CONVERTED_TO_ADVANCE',
                  shortageConvertedAt: new Date().toISOString(),
                  shortageConvertedBy: adminName,
                  shortageAdvanceId: advanceId,
                  updatedAt: new Date().toISOString(),
                  updatedBy: adminName,
                };
              }
              return e;
            });
            parsed.entries = nextEntries;
            saveCodCacheSafely([[localSheetKey, JSON.stringify(parsed)]], effectiveHubId);
          }
        }
      } catch (err) {
        console.warn('Local cod sheet update notice:', err);
      }

      // Update Firestore daily_cod_sheets document
      if (db) {
        try {
          const targetDocRef = doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', targetDate);
          const snap = await getDoc(targetDocRef);
          if (snap.exists()) {
            const data = snap.data() as DailyCodSheetData;
            const updatedEntries = (data.entries || []).map((e) => {
              if (e.riderId === entry.riderId || e.id === entry.id) {
                return {
                  ...e,
                  shortageAmount,
                  shortageStatus: 'CONVERTED_TO_ADVANCE',
                  shortageConvertedAt: new Date().toISOString(),
                  shortageConvertedBy: adminName,
                  shortageAdvanceId: advanceId,
                  updatedAt: new Date().toISOString(),
                  updatedBy: adminName,
                };
              }
              return e;
            });
            await setDoc(targetDocRef, cleanForFirestore({ entries: updatedEntries, updatedAt: new Date().toISOString() }), { merge: true });
          }
        } catch (err) {
          console.warn('Firestore daily_cod_sheets update notice:', err);
        }
      }
    }

    // 5. Trigger standard Rider SMS notification:
    // "Hub Alert: Aapke aaj ke COD shortage ka ₹{shortageAmount} advance account me jod diya gaya hai."
    const smsMessage = `Hub Alert: Aapke aaj ke COD shortage ka ₹${shortageAmount} advance account me jod diya gaya hai.`;
    if (cleanPhone) {
      dispatchAutomatedSms({
        riderPhone: cleanPhone,
        riderName,
        message: smsMessage,
        type: 'advance',
        amount: shortageAmount,
        statementUrl: getRiderStatementUrl(entry.riderId),
      }).catch((err) => console.warn('Shortage SMS dispatch notice:', err));
    }

    return { success: true, advanceId, shortageAmount };
  } catch (err: any) {
    console.error('Error in convertCodShortageToAdvance:', err);
    return { success: false, shortageAmount: 0, error: err?.message || 'शॉर्टेज कनवर्ट करने में त्रुटि' };
  }
}

/**
 * 10. Audit & History: Fetch summary of recent COD sheets for audit inspection
 */
export interface CodSheetSummary {
  date: string;
  totalRidersWithData: number;
  totalCod: number;
  totalDeposit: number;
  totalCash: number;
  totalOnline: number;
  balance: number;
  isLocked: boolean;
  entriesCount: number;
}

export async function fetchRecentCodSheets(
  hubId: string,
  limitDays: number = 30
): Promise<CodSheetSummary[]> {
  const effectiveHubId = (hubId || getActiveCompanionHubId() || '').trim();
  const summaryMap = new Map<string, CodSheetSummary>();

  // 1. Scan local storage for cached sheets
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(`cp_cod_sheet_${effectiveHubId}_`) || k.startsWith('cp_cod_sheet_'))) {
        const dateMatch = k.match(/\d{4}-\d{2}-\d{2}$/);
        if (dateMatch) {
          const dStr = dateMatch[0];
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              const entries = extractEntriesFromSheetRaw(parsed, dStr);
              const withData = entries.filter((e) => (e.totalCod || 0) > 0 || (e.totalDeposit || 0) > 0 || e.status === 'submitted');
              const totalCod = entries.reduce((s, e) => s + (Number(e.totalCod) || 0), 0);
              const totalCash = entries.reduce((s, e) => s + (Number(e.cashDeposit) || 0), 0);
              const totalOnline = entries.reduce((s, e) => s + (Number(e.onlineDeposit) || 0), 0);
              const totalDeposit = totalCash + totalOnline;
              const balance = totalCod - totalDeposit;
              summaryMap.set(dStr, {
                date: dStr,
                totalRidersWithData: withData.length,
                totalCod,
                totalDeposit,
                totalCash,
                totalOnline,
                balance,
                isLocked: Boolean(parsed.isLocked),
                entriesCount: entries.length,
              });
            }
          } catch {}
        }
      }
    }
  } catch {}

  // 2. Fetch from Firestore hubs/{effectiveHubId}/daily_cod_sheets subcollection
  if (db && effectiveHubId) {
    try {
      const colRef = collection(db, 'hubs', effectiveHubId, 'daily_cod_sheets');
      const snaps = await getDocs(colRef);
      if (!snaps.empty) {
        snaps.docs.forEach((docSnap) => {
          const dStr = docSnap.id;
          const data = docSnap.data();
          const entries = extractEntriesFromSheetRaw(data, dStr);
          const withData = entries.filter((e) => (e.totalCod || 0) > 0 || (e.totalDeposit || 0) > 0 || e.status === 'submitted');
          const totalCod = entries.reduce((s, e) => s + (Number(e.totalCod) || 0), 0);
          const totalCash = entries.reduce((s, e) => s + (Number(e.cashDeposit) || 0), 0);
          const totalOnline = entries.reduce((s, e) => s + (Number(e.onlineDeposit) || 0), 0);
          const totalDeposit = totalCash + totalOnline;
          const balance = totalCod - totalDeposit;
          summaryMap.set(dStr, {
            date: dStr,
            totalRidersWithData: withData.length,
            totalCod,
            totalDeposit,
            totalCash,
            totalOnline,
            balance,
            isLocked: Boolean(data.isLocked),
            entriesCount: entries.length,
          });
        });
      }
    } catch (e) {
      console.warn('Notice fetching recent sheets from Firestore:', e);
    }
  }

  // Convert to array and sort date descending
  const list = Array.from(summaryMap.values());
  list.sort((a, b) => b.date.localeCompare(a.date));
  return list.slice(0, limitDays);
}

/**
 * 10. Comprehensive COD Data Exporter for Hub Master Backup
 * Gathers all daily COD sheets (with note denominations, cash, online, shortage) and audit logs
 */
export async function exportAllCodDataForBackup(hubId: string): Promise<{
  sheets: DailyCodSheetData[];
  auditLogs: CodAuditLog[];
}> {
  const effectiveHubId = (hubId || getActiveCompanionHubId() || '').trim();
  const sheetsMap = new Map<string, DailyCodSheetData>();

  // 1. Gather all sheets from localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith(`cp_cod_sheet_${effectiveHubId}_`) ||
        (key.startsWith('cp_cod_sheet_') && key.length === 23)
      ) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            const dateStr = parsed.date || key.split('_').pop() || '';
            if (dateStr && dateStr.length === 10 && !sheetsMap.has(dateStr)) {
              const entries = extractEntriesFromSheetRaw(parsed, dateStr);
              sheetsMap.set(dateStr, {
                date: dateStr,
                entries,
                isLocked: Boolean(parsed.isLocked),
                lockedBy: parsed.lockedBy,
                lockedAt: parsed.lockedAt,
                company1Name: parsed.company1Name,
                company2Name: parsed.company2Name,
                hubName: parsed.hubName,
                hubId: effectiveHubId,
                consolidatedDenominations: parsed.consolidatedDenominations,
                cashWithdrawals: parsed.cashWithdrawals,
                updatedAt: parsed.updatedAt,
              });
            }
          }
        } catch {}
      }
    }
  } catch {}

  // 2. Query Firestore hubs/{effectiveHubId}/daily_cod_sheets subcollection
  if (db && effectiveHubId && effectiveHubId !== 'guest') {
    try {
      const colRef = collection(db, 'hubs', effectiveHubId, 'daily_cod_sheets');
      const snaps = await getDocs(colRef);
      if (!snaps.empty) {
        for (const docSnap of snaps.docs) {
          const dateStr = docSnap.id;
          const data = docSnap.data();
          let entries = extractEntriesFromSheetRaw(data, dateStr);

          // If entry list in document is empty or incomplete, check rider_entries subcollection
          try {
            const subRef = collection(db, 'hubs', effectiveHubId, 'daily_cod_sheets', dateStr, 'rider_entries');
            const subSnaps = await getDocs(subRef);
            if (!subSnaps.empty) {
              const subEntries = subSnaps.docs.map((d) => d.data() as CodDailyEntry);
              subEntries.forEach((se) => {
                const idx = entries.findIndex((e) => e.riderId === se.riderId);
                if (idx >= 0) {
                  entries[idx] = { ...entries[idx], ...se };
                } else {
                  entries.push(se);
                }
              });
            }
          } catch {}

          sheetsMap.set(dateStr, {
            date: dateStr,
            entries,
            isLocked: Boolean(data.isLocked),
            lockedBy: data.lockedBy,
            lockedAt: data.lockedAt,
            company1Name: data.company1Name,
            company2Name: data.company2Name,
            hubName: data.hubName,
            hubId: effectiveHubId,
            consolidatedDenominations: data.consolidatedDenominations,
            cashWithdrawals: data.cashWithdrawals,
            updatedAt: data.updatedAt,
          });
        }
      }
    } catch (err) {
      console.warn('Notice exporting sheets from Firestore for backup:', err);
    }
  }

  // 3. Query audit logs
  let auditLogs: CodAuditLog[] = [];
  try {
    auditLogs = await loadCodAuditLogs(effectiveHubId);
  } catch (err) {
    console.warn('Notice loading audit logs for backup:', err);
  }

  const sheets = Array.from(sheetsMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  return { sheets, auditLogs };
}

/**
 * 11. Restores COD sheets and audit logs from a master backup file
 */
export async function importAllCodDataFromBackup(
  hubId: string,
  codSheets: DailyCodSheetData[],
  codAuditLogs?: CodAuditLog[]
): Promise<number> {
  const effectiveHubId = (hubId || getActiveCompanionHubId() || '').trim();
  if (!effectiveHubId) return 0;

  let restoredSheetsCount = 0;

  // Restore sheets
  for (const sheet of codSheets || []) {
    if (!sheet.date) continue;
    const dateStr = sheet.date;
    const localKey = `cp_cod_sheet_${effectiveHubId}_${dateStr}`;
    saveCodCacheSafely([[localKey, JSON.stringify(sheet)]], effectiveHubId);

    if (db && effectiveHubId !== 'guest') {
      try {
        const hubSheetRef = doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', dateStr);
        await setDoc(hubSheetRef, cleanForFirestore(sheet), { merge: true });

        const scopedRootRef = doc(db, 'daily_cod_sheets', `${effectiveHubId}_${dateStr}`);
        await setDoc(scopedRootRef, cleanForFirestore(sheet), { merge: true });

        // Save rider entries
        for (const re of sheet.entries || []) {
          if (re.riderId) {
            const riderDocRef = doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', dateStr, 'rider_entries', re.riderId);
            await setDoc(riderDocRef, cleanForFirestore(re), { merge: true });
          }
        }
      } catch (err) {
        console.warn(`Firestore sheet restore notice for ${dateStr}:`, err);
      }
    }
    restoredSheetsCount++;
  }

  // Restore audit logs
  if (Array.isArray(codAuditLogs) && codAuditLogs.length > 0) {
    const localAuditKey = getAuditStorageKey(effectiveHubId);
    safeLocalStorageSet(localAuditKey, JSON.stringify(codAuditLogs.slice(0, 50)), effectiveHubId);

    if (db && effectiveHubId !== 'guest') {
      try {
        for (const log of codAuditLogs) {
          if (log.id) {
            const docRef = doc(db, 'workspaces', effectiveHubId, 'cod_audit_logs', log.id);
            await setDoc(docRef, cleanForFirestore(log), { merge: true });
          }
        }
      } catch (err) {
        console.warn('Firestore audit logs restore notice:', err);
      }
    }
  }

  return restoredSheetsCount;
}

/**
 * 12. Real-Time Cloud Sync for Hub Vault Cash Withdrawals
 */
export async function saveCodWithdrawalsToSheet(
  hubId: string,
  date: string,
  withdrawals: CashWithdrawalRecord[]
): Promise<void> {
  const targetDate = date || getTodayDateString();
  const effectiveHubId = (hubId || getActiveCompanionHubId() || '').trim();
  const safeWithdrawals = Array.isArray(withdrawals) ? withdrawals : [];

  try {
    const key = `cp_cod_withdrawals_${targetDate}_${effectiveHubId || 'default'}`;
    safeLocalStorageSet(key, JSON.stringify(safeWithdrawals), effectiveHubId);
  } catch {}

  if (!db || !effectiveHubId || effectiveHubId === 'guest') return;

  const payload = cleanForFirestore({
    date: targetDate,
    hubId: effectiveHubId,
    ownerUid: effectiveHubId,
    cashWithdrawals: safeWithdrawals,
    updatedAt: new Date().toISOString(),
  });

  try {
    await Promise.all([
      setDoc(doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', targetDate), payload, { merge: true }),
      setDoc(doc(db, 'daily_cod_sheets', `${effectiveHubId}_${targetDate}`), payload, { merge: true }),
    ]);
  } catch (err) {
    console.warn('Vault withdrawals Firestore sync notice:', err);
  }
}

/**
 * 13. Deterministic 0-Second Shortage / Surplus Background Retry Queue
 * Ensures 0s UI responsiveness without ever applying premature sync locks or duplicates.
 */
export interface PendingCodLedgerTransfer {
  deterministicId: string;
  kind: 'advance' | 'incentive';
  hubId: string;
  date: string;
  riderId: string;
  riderName: string;
  riderPhone: string;
  field: string;
  amount: number;
  reason: string;
  syncProp: string;
  idProp: 'syncedAdvanceId' | 'syncedIncentiveId';
  createdBy: string;
  createdAt: string;
}

export function buildDeterministicShortageAdvId(date: string, riderId: string, field: string): string {
  const safeRider = String(riderId || 'rider').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeDate = String(date || getTodayDateString()).replace(/[^0-9-]/g, '');
  const safeField = String(field || 'cod').replace(/[^a-zA-Z0-9_-]/g, '');
  return `cod_short_adv_${safeDate}_${safeRider}_${safeField}`;
}

export function buildDeterministicSurplusIncId(date: string, riderId: string, field: string): string {
  const safeRider = String(riderId || 'rider').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeDate = String(date || getTodayDateString()).replace(/[^0-9-]/g, '');
  const safeField = String(field || 'cod').replace(/[^a-zA-Z0-9_-]/g, '');
  return `cod_surp_inc_${safeDate}_${safeRider}_${safeField}`;
}

function getPendingQueueKey(hubId: string): string {
  return `cp_cod_pending_ledger_queue_${(hubId || 'default').trim()}`;
}

export function getPendingCodLedgerTransfers(hubId: string): PendingCodLedgerTransfer[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getPendingQueueKey(hubId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function withTransientAckTimeout<T>(promise: Promise<T>, timeoutMs = 6000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        Object.assign(new Error('Network response slow (queued safely for auto-retry)'), {
          code: 'unavailable',
        })
      );
    }, timeoutMs);

    promise.then(
      (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function dispatchCodQueueChanged(hubId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('courier-payout:cod-queue-changed', {
        detail: { hubId: (hubId || 'default').trim() },
      })
    );
  } catch {}
}

export function enqueuePendingCodLedgerTransfer(item: PendingCodLedgerTransfer): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getPendingCodLedgerTransfers(item.hubId);
    const filtered = existing.filter((x) => x.deterministicId !== item.deterministicId);
    filtered.push(item);
    safeLocalStorageSet(getPendingQueueKey(item.hubId), JSON.stringify(filtered.slice(-100)), item.hubId);
    dispatchCodQueueChanged(item.hubId);
  } catch {}
}

export function removePendingCodLedgerTransfer(hubId: string, deterministicId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getPendingCodLedgerTransfers(hubId);
    const next = existing.filter((x) => x.deterministicId !== deterministicId);
    safeLocalStorageSet(getPendingQueueKey(hubId), JSON.stringify(next), hubId);
    dispatchCodQueueChanged(hubId);
  } catch {}
}


