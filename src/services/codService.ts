import { 
  CodDailyEntry, 
  CodStaffUser, 
  CodAuditLog, 
  CodSettings, 
  CodStaffRole,
  DailyCodSheetData,
  Rider 
} from '../types';
import { db } from '../firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  writeBatch,
  onSnapshot,
  query,
  where,
  Unsubscribe 
} from 'firebase/firestore';
import { cleanForFirestore, isSuperAdmin, SUPER_ADMIN_EMAIL, normalizeUserPermissions } from './firestoreSync';
import { getTodayDateString } from '../utils/formatters';

const DEFAULT_COMPANY_1 = 'Valmo COD';
const DEFAULT_COMPANY_2 = 'Xpressbees COD';

export const DEFAULT_COD_SETTINGS: CodSettings = {
  isEnabled: false, // Protected by default until Super Admin / Hub Owner enables it
  company1Name: DEFAULT_COMPANY_1,
  company2Name: DEFAULT_COMPANY_2,
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

  // Attempt Firestore load
  if (db && userId && userId !== 'guest') {
    try {
      const docRef = doc(db, 'workspaces', userId, 'cod_settings', 'config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const firestoreData = snap.data() as CodSettings;
        localStorage.setItem(localKey, JSON.stringify(firestoreData));
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
  try {
    localStorage.setItem(localKey, JSON.stringify(updated));
  } catch {}

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
        localStorage.setItem(localKey, JSON.stringify(existingStaff));
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
    try {
      localStorage.setItem(localKey, JSON.stringify(mergedList));
    } catch {}
  }

  return mergedList;
}

export async function saveCodStaffUsers(userId: string, staffList: CodStaffUser[]): Promise<void> {
  const localKey = getStaffStorageKey(userId);
  try {
    localStorage.setItem(localKey, JSON.stringify(staffList));
    localStorage.setItem('cp_cod_staff_pins_cache', JSON.stringify(staffList));
  } catch {}

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
    createdAt: new Date().toISOString(),
  };
}

/**
 * Helper to robustly extract and normalize entries from daily_cod_sheets document
 * Supports entries stored as an Array OR an Object/Map ({ [riderPhoneOrId]: entry }),
 * and merges with entriesMap if present.
 */
export function extractEntriesFromSheetRaw(raw: any, targetDate: string): CodDailyEntry[] {
  if (!raw) return [];
  const rawList: any[] = [];

  if (Array.isArray(raw.entries)) {
    rawList.push(...raw.entries);
  } else if (raw.entries && typeof raw.entries === 'object') {
    rawList.push(...Object.values(raw.entries));
  }

  if (raw.entriesMap && typeof raw.entriesMap === 'object') {
    const mapValues = Object.values(raw.entriesMap);
    mapValues.forEach((mv: any) => {
      if (mv && typeof mv === 'object') {
        const mvId = mv.riderId || mv.id;
        const mvPhone = (mv.riderPhone || mv.phone || '').replace(/\D/g, '').slice(-10);
        const exists = rawList.some((e: any) => 
          (mvId && (e.riderId === mvId || e.id === mvId)) ||
          (mvPhone && (e.riderPhone || '').replace(/\D/g, '').slice(-10) === mvPhone)
        );
        if (!exists) {
          rawList.push(mv);
        }
      }
    });
  }

  // De-duplicate by riderId or clean phone
  const seenKeys = new Set<string>();
  const normalized: CodDailyEntry[] = [];

  rawList.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const riderId = String(item.riderId || item.id || `rider_${index}`);
    const riderPhone = String(item.riderPhone || item.phone || '');
    const cleanPhone = riderPhone.replace(/\D/g, '').slice(-10);
    const dedupeKey = cleanPhone || riderId;

    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);

    const riderName = String(item.riderName || item.name || 'राइडर');
    const company1Amount = Number(item.company1Amount ?? item.company1Cod ?? item.company1 ?? 0);
    const company2Amount = Number(item.company2Amount ?? item.company2Cod ?? item.company2 ?? 0);
    const cashDeposit = Number(item.cashDeposit ?? 0);
    const onlineDeposit = Number(item.onlineDeposit ?? 0);
    const totalCod = Number(item.totalCod ?? (company1Amount + company2Amount));
    const totalDeposit = Number(item.totalDeposit ?? (cashDeposit + onlineDeposit));
    const balance = Number(item.balance ?? (totalCod - totalDeposit));

    normalized.push({
      ...item,
      id: item.id || `cod_${targetDate}_${riderId}`,
      date: item.date || targetDate,
      riderId,
      riderName,
      riderPhone,
      company1Amount,
      company2Amount,
      totalCod,
      cashDeposit,
      onlineDeposit,
      totalDeposit,
      balance,
      status: item.status || 'draft',
      updatedAt: item.updatedAt || new Date().toISOString(),
    });
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

  // 1. Try hub-scoped daily_cod_sheets in local cache first
  try {
    const hubLocalKey = userId ? `cp_cod_sheet_${userId}_${targetDate}` : `cp_cod_sheet_${targetDate}`;
    const rawSheet = localStorage.getItem(hubLocalKey) || localStorage.getItem(`cp_cod_sheet_${targetDate}`);
    if (rawSheet) {
      const parsedSheet = JSON.parse(rawSheet);
      savedEntries = extractEntriesFromSheetRaw(parsedSheet, targetDate);
    }
  } catch {}

  // 2. Try legacy workspace entries local cache
  if (savedEntries.length === 0) {
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) savedEntries = extractEntriesFromSheetRaw({ entries: JSON.parse(raw) }, targetDate);
    } catch {}
  }

  // 3. Attempt direct Firestore fetch: first from hubs/{userId}/daily_cod_sheets/{targetDate}
  if (db && savedEntries.length === 0) {
    try {
      if (userId && userId !== 'guest' && userId !== 'super_admin_hub') {
        const hubSheetRef = doc(db, 'hubs', userId, 'daily_cod_sheets', targetDate);
        const hubSnap = await getDoc(hubSheetRef);
        if (hubSnap.exists()) {
          const hubData = hubSnap.data();
          savedEntries = extractEntriesFromSheetRaw(hubData, targetDate);
          if (savedEntries.length > 0) {
            try {
              localStorage.setItem(localKey, JSON.stringify(savedEntries));
              localStorage.setItem(`cp_cod_sheet_${userId}_${targetDate}`, JSON.stringify(hubData));
            } catch {}
          }
        }
        if (savedEntries.length === 0) {
          // Check scoped root doc: daily_cod_sheets/{userId}_{targetDate}
          const scopedSnap = await getDoc(doc(db, 'daily_cod_sheets', `${userId}_${targetDate}`));
          if (scopedSnap.exists()) {
            const scopedData = scopedSnap.data();
            savedEntries = extractEntriesFromSheetRaw(scopedData, targetDate);
          }
        }
      } else {
        // Fallback for demo accounts, unauthenticated guests, or super admin hub
        const sheetRef = doc(db, 'daily_cod_sheets', targetDate);
        const sheetSnap = await getDoc(sheetRef);
        if (sheetSnap.exists()) {
          const sheetData = sheetSnap.data();
          savedEntries = extractEntriesFromSheetRaw(sheetData, targetDate);
          if (savedEntries.length > 0) {
            try {
              localStorage.setItem(localKey, JSON.stringify(savedEntries));
              localStorage.setItem(`cp_cod_sheet_${targetDate}`, JSON.stringify(sheetData));
            } catch {}
          }
        }
      }
    } catch (err) {
      console.warn('daily_cod_sheets direct fetch notice:', err);
    }
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
          try {
            localStorage.setItem(localKey, JSON.stringify(savedEntries));
          } catch {}
        }
      }
    } catch (err) {
      console.warn('COD entries firestore fetch error:', err);
    }
  }

  // Populate/reconcile with active riders
  const entryMap = new Map<string, CodDailyEntry>();
  savedEntries.forEach((e) => {
    if (e.riderId) entryMap.set(e.riderId, e);
    const cleanPhone = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone) entryMap.set(cleanPhone, e);
  });

  const result: CodDailyEntry[] = riders.map((rider) => {
    const cleanRiderPhone = (rider.phone || '').replace(/\D/g, '').slice(-10);
    const existing = entryMap.get(rider.id) || (cleanRiderPhone ? entryMap.get(cleanRiderPhone) : undefined);

    if (existing) {
      // Auto-recalculate totals in case of legacy fields
      const totalCod = (Number(existing.company1Amount) || 0) + (Number(existing.company2Amount) || 0);
      const totalDeposit = (Number(existing.cashDeposit) || 0) + (Number(existing.onlineDeposit) || 0);
      const balance = totalCod - totalDeposit;
      return {
        ...existing,
        riderName: rider.name,
        riderPhone: rider.phone,
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

  return result;
}

export async function saveCodDailyEntries(
  userId: string, 
  date: string, 
  entries: CodDailyEntry[]
): Promise<void> {
  const targetDate = date || getTodayDateString();
  const localKey = getEntriesStorageKey(userId, targetDate);
  try {
    localStorage.setItem(localKey, JSON.stringify(entries));
    localStorage.setItem(`cp_cod_sheet_${targetDate}`, JSON.stringify(entries));
    if (userId) {
      localStorage.setItem(`cp_cod_sheet_${userId}_${targetDate}`, JSON.stringify(entries));
    }
  } catch {}

  if (db) {
    try {
      const entriesMap = buildEntriesMap(entries);
      const payload = cleanForFirestore({
        date: targetDate,
        hubId: userId,
        ownerUid: userId,
        entries,
        entriesMap,
        updatedAt: new Date().toISOString(),
      });

      // 1. Hub-scoped path: hubs/{userId}/daily_cod_sheets/{date} (No cross-hub contamination)
      if (userId && userId !== 'guest' && userId !== 'super_admin_hub') {
        const hubSheetRef = doc(db, 'hubs', userId, 'daily_cod_sheets', targetDate);
        await setDoc(hubSheetRef, payload, { merge: true });

        // Dual-write to daily_cod_sheets/{userId}_{date} for query compatibility
        const scopedRootRef = doc(db, 'daily_cod_sheets', `${userId}_${targetDate}`);
        await setDoc(scopedRootRef, payload, { merge: true });
      } else {
        // Fallback write for un-isolated setups, local guest, or super admin demo
        const sheetRef = doc(db, 'daily_cod_sheets', targetDate);
        await setDoc(sheetRef, payload, { merge: true });
      }

      // 2. Also persist in user workspace
      if (userId && userId !== 'guest') {
        const batch = writeBatch(db);
        entries.forEach((entry) => {
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
        localStorage.setItem(localKey, JSON.stringify(logs));
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
    const updated = [newLog, ...current].slice(0, 300); // keep recent 300 audit events
    localStorage.setItem(localKey, JSON.stringify(updated));
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
export function exportCodGridToCSV(
  date: string,
  entries: CodDailyEntry[],
  company1Name: string,
  company2Name: string,
  hubName: string = 'Saraikela Courier Hub'
): void {
  const headers = [
    'Date',
    'Rider Name',
    'Phone',
    `${company1Name} (₹)`,
    `${company2Name} (₹)`,
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

  const rows = entries.map((e) => {
    const totalShort = (e.company1Shortage || 0) + (e.company2Shortage || 0) + (e.cashShortage || 0) + (e.onlineShortage || 0);
    const shortDetails: string[] = [];
    if (e.company1Shortage) shortDetails.push(`${company1Name}: -₹${e.company1Shortage}`);
    if (e.company2Shortage) shortDetails.push(`${company2Name}: -₹${e.company2Shortage}`);
    if (e.cashShortage) shortDetails.push(`Cash: -₹${e.cashShortage}`);
    if (e.onlineShortage) shortDetails.push(`Online: -₹${e.onlineShortage}`);
    const shortText = totalShort > 0 ? `${totalShort} (${shortDetails.join('; ')})` : 0;

    return [
      `"${e.date}"`,
      `"${e.riderName.replace(/"/g, '""')}"`,
      `"${e.riderPhone || ''}"`,
      e.company1Amount,
      e.company2Amount,
      e.totalCod,
      e.cashDeposit,
      e.onlineDeposit,
      e.totalDeposit,
      e.balance,
      `"${shortText}"`,
      `"${e.status.toUpperCase()}"`,
      `"${(e.verifiedBy || '').replace(/"/g, '""')}"`,
      `"${(e.notes || '').replace(/"/g, '""')}"`,
    ];
  });

  // Total summary footer row
  const sumC1 = entries.reduce((s, e) => s + (e.company1Amount || 0), 0);
  const sumC2 = entries.reduce((s, e) => s + (e.company2Amount || 0), 0);
  const sumTotalCod = entries.reduce((s, e) => s + (e.totalCod || 0), 0);
  const sumCash = entries.reduce((s, e) => s + (e.cashDeposit || 0), 0);
  const sumOnline = entries.reduce((s, e) => s + (e.onlineDeposit || 0), 0);
  const sumTotalDep = entries.reduce((s, e) => s + (e.totalDeposit || 0), 0);
  const sumBal = entries.reduce((s, e) => s + (e.balance || 0), 0);
  const sumShortage = entries.reduce((s, e) => s + ((e.company1Shortage || 0) + (e.company2Shortage || 0) + (e.cashShortage || 0) + (e.onlineShortage || 0)), 0);

  const totalRow = [
    `"TOTALS"`,
    `"${entries.length} Riders"`,
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
    `"${hubName} - Daily COD Reconciliation Sheet (${date})"`,
    headers.join(','),
    ...rows.map((r) => r.join(',')),
    totalRow.join(','),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `COD-Reconciliation-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * =========================================================================
 * 6. STANDALONE COMPANION APP: COD Entry (हिसाब किताब)
 * Exclusively for Delivery Boys (Riders) and Hub Staff
 * =========================================================================
 */

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
  reason?: 'invalid_credentials' | 'inactive' | 'not_found' | 'error';
  message: string;
}> {
  const cleanPhone = phoneInput.replace(/\D/g, '').slice(-10);
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

  // 1. Authenticate against Firebase Firestore cod_staff_pins collection
  if (db) {
    try {
      // Direct document lookup by clean 10-digit phone number
      const phoneDocRef = doc(db, 'cod_staff_pins', cleanPhone);
      const phoneSnap = await getDoc(phoneDocRef);
      if (phoneSnap.exists()) {
        const data = phoneSnap.data() as CodStaffUser;
        if (data.pin === pin) {
          matchedUser = data;
        }
      }

      // If not found by phone ID, scan cod_staff_pins collection
      if (!matchedUser) {
        const colRef = collection(db, 'cod_staff_pins');
        const snaps = await getDocs(colRef);
        for (const d of snaps.docs) {
          const data = d.data() as CodStaffUser & { cleanPhone?: string };
          const dPhone = (data.phone || data.cleanPhone || '').replace(/\D/g, '').slice(-10);
          if (dPhone === cleanPhone && data.pin === pin) {
            matchedUser = data;
            break;
          }
        }
      }
    } catch (err) {
      console.warn('Firestore PIN auth lookup notice:', err);
    }
  }

  // 2. Check local cached staff list (handles offline / local mode seamlessly)
  if (!matchedUser) {
    try {
      const cachedRaw = localStorage.getItem('cp_cod_staff_pins_cache');
      if (cachedRaw) {
        const staffList: CodStaffUser[] = JSON.parse(cachedRaw);
        matchedUser = staffList.find((s) => {
          const sPhone = (s.phone || '').replace(/\D/g, '').slice(-10);
          return sPhone === cleanPhone && s.pin === pin;
        }) || null;
      }
    } catch {}
  }

  // 3. Check workspace staff caches
  if (!matchedUser) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cp_cod_staff_')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const list: CodStaffUser[] = JSON.parse(raw);
            const found = list.find((s) => {
              const sPhone = (s.phone || '').replace(/\D/g, '').slice(-10);
              return sPhone === cleanPhone && s.pin === pin;
            });
            if (found) {
              matchedUser = found;
              break;
            }
          }
        }
      }
    } catch {}
  }

  // 4. Default Seed/Demo accounts for immediate out-of-the-box mobile testing
  if (!matchedUser) {
    const demoAccounts: CodStaffUser[] = [
      { id: 'staff_demo_rider', riderId: 'rider_1', name: 'सुरेश कुमार (Rider)', phone: '9876543210', role: 'rider', pin: '1234', isActive: true, hubId: 'super_admin_hub', createdAt: new Date().toISOString() },
      { id: 'staff_demo_tl', name: 'रोहित वर्मा (Team Leader)', phone: '9876543211', role: 'team_leader', pin: '4321', isActive: true, canVerifyCod: true, canVerifyCash: false, canVerifyOnline: true, hubId: 'super_admin_hub', createdAt: new Date().toISOString() },
      { id: 'staff_demo_sup', name: 'अमित सिंह (Supervisor)', phone: '9876543212', role: 'supervisor', pin: '5678', isActive: true, canVerifyCod: true, canVerifyCash: true, canVerifyOnline: true, hubId: 'super_admin_hub', createdAt: new Date().toISOString() },
      { id: 'staff_demo_incharge', name: 'पवन कबी (Hub Incharge)', phone: '9876543213', role: 'hub_incharge', pin: '9999', isActive: true, canVerifyCod: true, canVerifyCash: true, canVerifyOnline: true, hubId: 'super_admin_hub', createdAt: new Date().toISOString() },
    ];
    matchedUser = demoAccounts.find((d) => {
      const dPhone = d.phone!.replace(/\D/g, '').slice(-10);
      return dPhone === cleanPhone && d.pin === pin;
    }) || null;
  }

  if (!matchedUser) {
    return {
      success: false,
      reason: 'not_found',
      message: 'मोबाइल नंबर या 4-अंकों का पिन गलत है! कृपया सही विवरण दर्ज करें।',
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

  // 5. HUB-BASED MULTI-TENANT RESOLUTION & SUPER ADMIN ACCESS GATE
  let hubId = presetHubId || matchedUser.hubId || matchedUser.ownerUid || matchedUser.workspaceId;

  // Look up rider's record in Firestore riders collection to get workspaceId / hubId / ownerUid
  if (!hubId && db) {
    try {
      const ridersQ = query(collection(db, 'riders'), where('phone', '==', cleanPhone));
      const snaps = await getDocs(ridersQ);
      if (!snaps.empty) {
        const rData = snaps.docs[0].data();
        hubId = rData.workspaceId || rData.hubId || rData.ownerUid || rData.userId || rData.createdBy;
      } else {
        const ridersPrefixedQ = query(collection(db, 'riders'), where('phone', '==', `+91${cleanPhone}`));
        const snapPrefixed = await getDocs(ridersPrefixedQ);
        if (!snapPrefixed.empty) {
          const rData = snapPrefixed.docs[0].data();
          hubId = rData.workspaceId || rData.hubId || rData.ownerUid || rData.userId || rData.createdBy;
        }
      }
    } catch (err) {
      console.warn('Rider hub resolution notice:', err);
    }
  }

  // Scan local rider cache for parent hub resolution if needed
  if (!hubId) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('cp_cache_riders_') || key.startsWith('courier_riders_'))) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              const found = list.find((r: any) => (r.phone || '').replace(/\D/g, '').slice(-10) === cleanPhone);
              if (found) {
                const parts = key.split('_');
                hubId = found.workspaceId || found.hubId || found.ownerUid || found.userId || found.createdBy || parts[parts.length - 1];
                break;
              }
            }
          }
        }
      }
    } catch {}
  }

  if (!hubId && matchedUser.id?.startsWith('staff_demo_')) {
    hubId = 'super_admin_hub';
  }

  // If no hubId could be resolved: Reject with required Hindi access message
  if (!hubId) {
    return {
      success: false,
      reason: 'inactive',
      message: 'यह सेवा आपके हब के लिए अभी सक्रिय नहीं है या हब रिकॉर्ड नहीं मिला। कृपया व्यवस्थापक से संपर्क करें।',
    };
  }

  // Check Feature Gate: codCompanionAccess
  // Default State: OFF for all accounts (only Master Super Admin has it active by default)
  // If toggle is OFF, display required exact Hindi message:
  // "यह सेवा आपके हब के लिए अभी सक्रिय नहीं है। कृपया व्यवस्थापक से संपर्क करें।"
  if (hubId !== 'super_admin_hub' && db) {
    try {
      let hubDoc = await getDoc(doc(db, 'users', hubId));
      if (!hubDoc.exists()) {
        hubDoc = await getDoc(doc(db, 'all_users', hubId));
      }

      if (hubDoc.exists()) {
        const hubData = hubDoc.data();
        const isHubSuperAdmin = isSuperAdmin(hubData?.email);
        if (!isHubSuperAdmin) {
          const perms = normalizeUserPermissions(hubData?.permissions);
          if (!perms.codCompanionAccess) {
            return {
              success: false,
              reason: 'inactive',
              message: 'यह सेवा आपके हब के लिए अभी सक्रिय नहीं है। कृपया व्यवस्थापक से संपर्क करें।',
            };
          }
        }
      } else {
        // Hub document missing and not super admin: default OFF
        return {
          success: false,
          reason: 'inactive',
          message: 'यह सेवा आपके हब के लिए अभी सक्रिय नहीं है। कृपया व्यवस्थापक से संपर्क करें।',
        };
      }
    } catch (gateErr) {
      console.warn('Feature gate evaluation notice:', gateErr);
      return {
        success: false,
        reason: 'inactive',
        message: 'यह सेवा आपके हब के लिए अभी सक्रिय नहीं है। कृपया व्यवस्थापक से संपर्क करें।',
      };
    }
  }

  matchedUser.hubId = hubId;
  matchedUser.workspaceId = hubId;
  matchedUser.ownerUid = hubId;

  // Save session & authenticatedHubId
  try {
    sessionStorage.setItem('cp_authenticated_hub_id', hubId);
    localStorage.setItem('cp_authenticated_hub_id', hubId);
    sessionStorage.setItem('cp_cod_companion_user', JSON.stringify(matchedUser));
    localStorage.setItem('cp_cod_companion_user', JSON.stringify(matchedUser));
  } catch {}

  return {
    success: true,
    user: matchedUser,
    message: `स्वागत है, ${matchedUser.name}!`,
  };
}

/**
 * Super Admin Feature Gate Checker for a specific hub
 */
export async function checkHubCodAccess(hubId?: string): Promise<boolean> {
  if (!hubId) return false;
  if (hubId === 'super_admin_hub') return true;
  if (!db) return true;
  try {
    let hubDoc = await getDoc(doc(db, 'users', hubId));
    if (!hubDoc.exists()) {
      hubDoc = await getDoc(doc(db, 'all_users', hubId));
    }
    if (hubDoc.exists()) {
      const hubData = hubDoc.data();
      if (isSuperAdmin(hubData?.email)) return true;
      const perms = normalizeUserPermissions(hubData?.permissions);
      return Boolean(perms.codCompanionAccess);
    }
  } catch {}
  return false;
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
    sessionStorage.removeItem('cp_cod_companion_user');
    localStorage.removeItem('cp_cod_companion_user');
  } catch {}
}

/**
 * Helper to retrieve active riders strictly scoped to the target Hub (No cross-hub data leakage)
 * Scoped by hubId / workspaceId
 * CRITICAL: If authenticatedHubId is missing, null, or empty, return an EMPTY ARRAY [].
 * Under NO circumstances fetch global riders or fall back to an unfiltered query.
 */
export async function getAllActiveRidersForCod(authenticatedHubId?: string | null): Promise<Rider[]> {
  // CRITICAL: If authenticatedHubId is missing, null, or empty, return an EMPTY ARRAY []
  if (!authenticatedHubId || typeof authenticatedHubId !== 'string' || !authenticatedHubId.trim()) {
    return [];
  }

  const hubId = authenticatedHubId.trim();
  const ridersMap = new Map<string, Rider>();

  // 1. Strictly query target Hub's riders from their isolated workspace collection: workspaces/{hubId}/riders
  if (db) {
    try {
      const wsCol = collection(db, 'workspaces', hubId, 'riders');
      const wsSnaps = await getDocs(wsCol);
      wsSnaps.docs.forEach((d) => {
        const data = d.data() as Rider;
        const id = data.id || d.id;
        if (id && data.active !== false) {
          ridersMap.set(id, { ...data, id, workspaceId: hubId });
        }
      });

      // 2. Query root riders collection strictly where workspaceId == authenticatedHubId
      const qWs = query(collection(db, 'riders'), where('workspaceId', '==', hubId));
      const snapsWs = await getDocs(qWs);
      snapsWs.docs.forEach((d) => {
        const data = d.data() as Rider;
        const id = data.id || d.id;
        if (id && data.active !== false && !ridersMap.has(id)) {
          ridersMap.set(id, { ...data, id, workspaceId: hubId });
        }
      });

      // 3. Query root riders collection strictly where hubId == authenticatedHubId
      const qHub = query(collection(db, 'riders'), where('hubId', '==', hubId));
      const snapsHub = await getDocs(qHub);
      snapsHub.docs.forEach((d) => {
        const data = d.data() as Rider;
        const id = data.id || d.id;
        if (id && data.active !== false && !ridersMap.has(id)) {
          ridersMap.set(id, { ...data, id, workspaceId: hubId });
        }
      });

      // 4. Query root riders collection strictly where userId == authenticatedHubId
      const qUser = query(collection(db, 'riders'), where('userId', '==', hubId));
      const snapsUser = await getDocs(qUser);
      snapsUser.docs.forEach((d) => {
        const data = d.data() as Rider;
        const id = data.id || d.id;
        if (id && data.active !== false && !ridersMap.has(id)) {
          ridersMap.set(id, { ...data, id, workspaceId: hubId });
        }
      });
    } catch (err) {
      console.warn('Strict hub riders query notice:', err);
    }
  }

  // 5. Scan localStorage rider caches strictly for target Hub (no cross-hub scanning)
  try {
    const keys = [`cp_cache_riders_${hubId}`, `courier_riders_${hubId}`];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw) {
        const list: Rider[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach((r) => {
            if (r && r.id && r.name && r.active !== false && !ridersMap.has(r.id)) {
              if (!r.workspaceId || r.workspaceId === hubId || r.hubId === hubId || r.userId === hubId) {
                ridersMap.set(r.id, { ...r, workspaceId: hubId });
              }
            }
          });
        }
      }
    }
  } catch {}

  // 6. Scan staff pins strictly for target hub if role === 'rider'
  try {
    const rawStaff = localStorage.getItem(`cp_cod_staff_${hubId}`);
    if (rawStaff) {
      const staffList: CodStaffUser[] = JSON.parse(rawStaff);
      staffList.forEach((s) => {
        if (s.role === 'rider' && s.isActive !== false) {
          const riderId = s.riderId || s.id;
          if (!ridersMap.has(riderId)) {
            ridersMap.set(riderId, {
              id: riderId,
              name: s.name,
              phone: s.phone || '',
              joinedDate: s.createdAt || new Date().toISOString(),
              active: true,
              workspaceId: hubId,
            });
          }
        }
      });
    }
  } catch {}

  // Absolute Isolation: filter to only active riders belonging strictly to this authenticatedHubId
  return Array.from(ridersMap.values()).filter(
    (r) => r.active !== false && (!r.workspaceId || r.workspaceId === hubId || r.hubId === hubId)
  ).map((r) => ({ ...r, workspaceId: hubId }));
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

  // Strict Hub Isolation: if hubId is missing or empty, companion app has NO access to any sheet
  if (!hubId || typeof hubId !== 'string' || !hubId.trim()) {
    onUpdate({
      date: targetDate,
      entries: [],
      isLocked: false,
      company1Name: DEFAULT_COMPANY_1,
      company2Name: DEFAULT_COMPANY_2,
      hubId: '',
    });
    return () => {};
  }

  const effectiveHubId = hubId.trim();
  const localCacheKey = `cp_cod_sheet_${effectiveHubId}_${targetDate}`;

  // Helper to ensure empty entries list is populated with active riders
  const enrichWithActiveRiders = async (baseData: DailyCodSheetData) => {
    if (!baseData.entries || baseData.entries.length === 0) {
      const activeRiders = await getAllActiveRidersForCod(effectiveHubId);
      if (activeRiders.length > 0) {
        const defaultEntries = buildDefaultCodEntriesForRiders(targetDate, activeRiders);
        const enriched: DailyCodSheetData = {
          ...baseData,
          entries: defaultEntries,
          hubId: effectiveHubId,
        };
        try {
          localStorage.setItem(localCacheKey, JSON.stringify(enriched));
          localStorage.setItem(`cp_cod_sheet_${targetDate}`, JSON.stringify(enriched));
        } catch {}
        onUpdate(enriched);
        return;
      }
    }
    onUpdate({ ...baseData, hubId: effectiveHubId });
  };

  // Instant Cache-First load in 0.0s
  try {
    const cachedRaw = localStorage.getItem(localCacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      const parsedEntries = extractEntriesFromSheetRaw(cached, targetDate);
      enrichWithActiveRiders({
        date: targetDate,
        entries: parsedEntries,
        isLocked: Boolean(cached.isLocked),
        company1Name: cached.company1Name || DEFAULT_COMPANY_1,
        company2Name: cached.company2Name || DEFAULT_COMPANY_2,
        hubId: effectiveHubId,
      });
    } else {
      getAllActiveRidersForCod(effectiveHubId).then((riders) => {
        if (riders.length > 0) {
          const defaultSheet: DailyCodSheetData = {
            date: targetDate,
            entries: buildDefaultCodEntriesForRiders(targetDate, riders),
            isLocked: false,
            company1Name: DEFAULT_COMPANY_1,
            company2Name: DEFAULT_COMPANY_2,
            hubId: effectiveHubId,
          };
          onUpdate(defaultSheet);
        }
      });
    }
  } catch {}

  if (!db) {
    return () => {};
  }

  try {
    // Strictly scoped path: hubs/{effectiveHubId}/daily_cod_sheets/{targetDate}
    const docRef = doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', targetDate);

    const unsubscribe = onSnapshot(
      docRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const raw = snapshot.data();
          const existingEntries: CodDailyEntry[] = extractEntriesFromSheetRaw(raw, targetDate);
          const company1Name = raw.company1Name || DEFAULT_COMPANY_1;
          const company2Name = raw.company2Name || DEFAULT_COMPANY_2;

          let finalEntries = existingEntries;

          if (finalEntries.length === 0) {
            const activeRiders = await getAllActiveRidersForCod(effectiveHubId);
            if (activeRiders.length > 0) {
              finalEntries = buildDefaultCodEntriesForRiders(targetDate, activeRiders);
            }
          } else {
            const activeRiders = await getAllActiveRidersForCod(effectiveHubId);
            const existingRiderIds = new Set(finalEntries.map((e) => e.riderId));
            const existingPhones = new Set(
              finalEntries
                .map((e) => (e.riderPhone || '').replace(/\D/g, '').slice(-10))
                .filter(Boolean)
            );

            const missingRiders = activeRiders.filter((r) => {
              const cleanPhone = (r.phone || '').replace(/\D/g, '').slice(-10);
              return !existingRiderIds.has(r.id) && (!cleanPhone || !existingPhones.has(cleanPhone));
            });

            if (missingRiders.length > 0) {
              const missingEntries = buildDefaultCodEntriesForRiders(targetDate, missingRiders);
              finalEntries = [...finalEntries, ...missingEntries];
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
            updatedAt: raw.updatedAt,
          };
          try {
            localStorage.setItem(localCacheKey, JSON.stringify(sheetData));
          } catch {}
          onUpdate(sheetData);
        } else {
          // Document not found in hubs/{effectiveHubId}; check fallback daily_cod_sheets/{effectiveHubId}_{targetDate}
          try {
            const rootFallbackSnap = await getDoc(doc(db, 'daily_cod_sheets', `${effectiveHubId}_${targetDate}`));
            if (rootFallbackSnap.exists()) {
              const raw = rootFallbackSnap.data();
              const existingEntries = extractEntriesFromSheetRaw(raw, targetDate);
              const sheetData: DailyCodSheetData = {
                date: targetDate,
                entries: existingEntries,
                isLocked: Boolean(raw.isLocked),
                company1Name: raw.company1Name || DEFAULT_COMPANY_1,
                company2Name: raw.company2Name || DEFAULT_COMPANY_2,
                hubId: effectiveHubId,
                updatedAt: raw.updatedAt,
              };
              onUpdate(sheetData);
              return;
            }
          } catch {}

          // Document does not exist yet! Automatically pull active riders strictly for this hub
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
          try {
            localStorage.setItem(localCacheKey, JSON.stringify(defaultSheet));
          } catch {}
          onUpdate(defaultSheet);
        }
      },
      (err) => {
        console.warn('Real-time daily_cod_sheets snapshot notice:', err);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to attach daily_cod_sheets listener:', err);
    if (onError && err instanceof Error) onError(err);
    return () => {};
  }
}

/**
 * 8. Zero-Second Real-Time Update for Single Rider Row in daily_cod_sheets (Hub-Scoped)
 */
export async function updateSingleRiderEntryInSheet(
  date: string,
  updatedEntry: CodDailyEntry,
  changedBy: { name: string; role: CodStaffRole | 'owner' },
  hubId?: string
): Promise<void> {
  const targetDate = date || getTodayDateString();
  const effectiveHubId = hubId && hubId !== 'super_admin_hub' ? hubId : undefined;
  const localCacheKey = effectiveHubId ? `cp_cod_sheet_${effectiveHubId}_${targetDate}` : `cp_cod_sheet_${targetDate}`;

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

  // 1. Instant local cache update
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
    localStorage.setItem(localCacheKey, JSON.stringify(updatedSheet));
    localStorage.setItem(`cp_cod_sheet_${targetDate}`, JSON.stringify(updatedSheet));
  } catch {}

  // 2. Commit to Firestore (triggers onSnapshot immediately across devices)
  if (db) {
    try {
      const targetDocRef = effectiveHubId 
        ? doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', targetDate)
        : doc(db, 'daily_cod_sheets', targetDate);

      let entries: CodDailyEntry[] = [];
      let isLocked = false;
      let company1Name = DEFAULT_COMPANY_1;
      let company2Name = DEFAULT_COMPANY_2;

      try {
        const snap = await getDoc(targetDocRef);
        if (snap.exists()) {
          const data = snap.data();
          entries = extractEntriesFromSheetRaw(data, targetDate);
          isLocked = Boolean(data.isLocked);
          company1Name = data.company1Name || DEFAULT_COMPANY_1;
          company2Name = data.company2Name || DEFAULT_COMPANY_2;
        }
      } catch (e) {
        console.warn('Notice fetching current sheet:', e);
      }

      if (entries.length === 0) {
        try {
          const cachedRaw = localStorage.getItem(localCacheKey) || localStorage.getItem(`cp_cod_sheet_${targetDate}`);
          if (cachedRaw) {
            entries = extractEntriesFromSheetRaw(JSON.parse(cachedRaw), targetDate);
          }
        } catch {}
      }

      const existingIndex = entries.findIndex((e) => {
        const eCleanPhone = (e.riderPhone || '').replace(/\D/g, '').slice(-10);
        return e.riderId === finalizedEntry.riderId || (cleanPhone && eCleanPhone === cleanPhone);
      });

      if (existingIndex >= 0) {
        entries[existingIndex] = finalizedEntry;
      } else {
        entries.push(finalizedEntry);
      }

      const entriesMap = buildEntriesMap(entries);
      const payload = cleanForFirestore({
        date: targetDate,
        hubId: effectiveHubId,
        ownerUid: effectiveHubId,
        entries,
        entriesMap,
        isLocked,
        company1Name,
        company2Name,
        updatedAt: new Date().toISOString(),
      });

      // Write to hub-scoped document: hubs/{hubId}/daily_cod_sheets/{targetDate}
      await setDoc(targetDocRef, payload, { merge: true });

      // If hubId is set, also dual-write to daily_cod_sheets/{hubId}_{date} for query consistency
      if (effectiveHubId) {
        const rootScopedDocRef = doc(db, 'daily_cod_sheets', `${effectiveHubId}_${targetDate}`);
        await setDoc(rootScopedDocRef, payload, { merge: true }).catch(() => {});
      } else {
        const rootDocRef = doc(db, 'daily_cod_sheets', targetDate);
        await setDoc(rootDocRef, payload, { merge: true }).catch(() => {});
      }
    } catch (err) {
      console.warn('Failed to update entry in daily_cod_sheets:', err);
    }
  }
}

/**
 * 9. Toggle Day-End Lock in daily_cod_sheets (Instant lock across all connected staff & riders)
 */
export async function toggleDayEndLockForSheet(
  date: string,
  isLocked: boolean,
  lockedBy: string,
  hubId?: string
): Promise<void> {
  const targetDate = date || getTodayDateString();
  const effectiveHubId = hubId && hubId !== 'super_admin_hub' ? hubId : undefined;
  const localCacheKey = effectiveHubId ? `cp_cod_sheet_${effectiveHubId}_${targetDate}` : `cp_cod_sheet_${targetDate}`;

  const updateData = {
    isLocked,
    lockedBy: isLocked ? lockedBy : null,
    lockedAt: isLocked ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  };

  // Local cache
  try {
    const raw = localStorage.getItem(localCacheKey) || localStorage.getItem(`cp_cod_sheet_${targetDate}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        parsed.isLocked = isLocked;
        parsed.lockedBy = isLocked ? lockedBy : undefined;
        parsed.lockedAt = isLocked ? new Date().toISOString() : undefined;
        localStorage.setItem(localCacheKey, JSON.stringify(parsed));
        localStorage.setItem(`cp_cod_sheet_${targetDate}`, JSON.stringify(parsed));
      }
    }
  } catch {}

  // Firestore
  if (db) {
    try {
      const targetDocRef = effectiveHubId
        ? doc(db, 'hubs', effectiveHubId, 'daily_cod_sheets', targetDate)
        : doc(db, 'daily_cod_sheets', targetDate);
      await setDoc(targetDocRef, cleanForFirestore(updateData), { merge: true });

      if (effectiveHubId) {
        await setDoc(doc(db, 'daily_cod_sheets', `${effectiveHubId}_${targetDate}`), cleanForFirestore(updateData), { merge: true }).catch(() => {});
      }
    } catch (err) {
      console.warn('Failed to toggle Day-End lock in daily_cod_sheets:', err);
    }
  }
}
