import { db } from '../firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection 
} from 'firebase/firestore';
import { 
  RiderAttendanceRecord, 
  HubDailyExpenseRecord, 
  DeliveryEntry 
} from '../types';
import { getTodayDateString } from '../utils/formatters';
import { cleanForFirestore } from './firestoreSync';
import { safeLocalStorageSet } from './appStorageAndFirebaseShield';

const LOCAL_ATTENDANCE_KEY = 'cp_hub_attendance_';
const LOCAL_EXPENSES_KEY = 'cp_hub_expenses_';

/**
 * 1. Save Rider Attendance Record for a Date
 */
export async function saveRiderAttendance(
  hubId: string,
  record: RiderAttendanceRecord
): Promise<void> {
  const effectiveHubId = (hubId || 'guest').trim();
  const dateStr = record.date || getTodayDateString();
  const storageKey = `${LOCAL_ATTENDANCE_KEY}${effectiveHubId}_${dateStr}`;

  // Local storage update
  try {
    const raw = localStorage.getItem(storageKey);
    let list: RiderAttendanceRecord[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((r) => r.riderId === record.riderId);
    if (idx >= 0) {
      list[idx] = record;
    } else {
      list.push(record);
    }
    safeLocalStorageSet(storageKey, JSON.stringify(list), effectiveHubId);
  } catch {}

  // Firestore
  if (db && effectiveHubId !== 'guest') {
    try {
      const docRef = doc(db, 'hubs', effectiveHubId, 'attendance', `${dateStr}_${record.riderId}`);
      await setDoc(docRef, cleanForFirestore(record), { merge: true });
    } catch (err) {
      console.warn('Attendance firestore write notice:', err);
    }
  }
}

/**
 * Load Attendance Records for a Date
 */
export async function loadRiderAttendance(
  hubId: string,
  date: string
): Promise<RiderAttendanceRecord[]> {
  const effectiveHubId = (hubId || 'guest').trim();
  const dateStr = date || getTodayDateString();
  const recordsMap = new Map<string, RiderAttendanceRecord>();

  // 1. Local storage
  try {
    const raw = localStorage.getItem(`${LOCAL_ATTENDANCE_KEY}${effectiveHubId}_${dateStr}`);
    if (raw) {
      const list: RiderAttendanceRecord[] = JSON.parse(raw);
      list.forEach((r) => recordsMap.set(r.riderId, r));
    }
  } catch {}

  // 2. Firestore
  if (db && effectiveHubId !== 'guest') {
    try {
      const colRef = collection(db, 'hubs', effectiveHubId, 'attendance');
      const snaps = await getDocs(colRef);
      if (!snaps.empty) {
        snaps.docs.forEach((docSnap) => {
          const data = docSnap.data() as RiderAttendanceRecord;
          if (data && data.date === dateStr && data.riderId) {
            recordsMap.set(data.riderId, data);
          }
        });
      }
    } catch (err) {
      console.warn('Notice loading attendance from firestore:', err);
    }
  }

  return Array.from(recordsMap.values());
}

/**
 * 2. Save Hub Daily Expense Record
 */
export async function saveHubExpense(
  hubId: string,
  expense: HubDailyExpenseRecord
): Promise<void> {
  const effectiveHubId = (hubId || 'guest').trim();
  const dateStr = expense.date || getTodayDateString();
  const storageKey = `${LOCAL_EXPENSES_KEY}${effectiveHubId}_${dateStr}`;

  // Local storage update
  try {
    const raw = localStorage.getItem(storageKey);
    let list: HubDailyExpenseRecord[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((e) => e.id === expense.id);
    if (idx >= 0) {
      list[idx] = expense;
    } else {
      list.push(expense);
    }
    safeLocalStorageSet(storageKey, JSON.stringify(list), effectiveHubId);
  } catch {}

  // Firestore
  if (db && effectiveHubId !== 'guest') {
    try {
      const docRef = doc(db, 'hubs', effectiveHubId, 'expenses', expense.id);
      await setDoc(docRef, cleanForFirestore(expense), { merge: true });
    } catch (err) {
      console.warn('Expense firestore write notice:', err);
    }
  }
}

/**
 * Delete Hub Expense (Soft Delete)
 */
export async function deleteHubExpense(
  hubId: string,
  date: string,
  expenseId: string
): Promise<void> {
  const effectiveHubId = (hubId || 'guest').trim();
  const dateStr = date || getTodayDateString();
  const storageKey = `${LOCAL_EXPENSES_KEY}${effectiveHubId}_${dateStr}`;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      let list: HubDailyExpenseRecord[] = JSON.parse(raw);
      list = list.filter((e) => e.id !== expenseId);
      safeLocalStorageSet(storageKey, JSON.stringify(list), effectiveHubId);
    }
  } catch {}

  if (db && effectiveHubId !== 'guest') {
    try {
      const docRef = doc(db, 'hubs', effectiveHubId, 'expenses', expenseId);
      await setDoc(docRef, { isDeleted: true, deletedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.warn('Expense soft-delete firestore notice:', err);
    }
  }
}

/**
 * Load Hub Expenses for a Date
 */
export async function loadHubExpenses(
  hubId: string,
  date: string
): Promise<HubDailyExpenseRecord[]> {
  const effectiveHubId = (hubId || 'guest').trim();
  const dateStr = date || getTodayDateString();
  const expensesMap = new Map<string, HubDailyExpenseRecord>();

  // 1. Local storage
  try {
    const raw = localStorage.getItem(`${LOCAL_EXPENSES_KEY}${effectiveHubId}_${dateStr}`);
    if (raw) {
      const list: HubDailyExpenseRecord[] = JSON.parse(raw);
      list.forEach((e) => {
        if (!((e as any).isDeleted)) expensesMap.set(e.id, e);
      });
    }
  } catch {}

  // 2. Firestore
  if (db && effectiveHubId !== 'guest') {
    try {
      const colRef = collection(db, 'hubs', effectiveHubId, 'expenses');
      const snaps = await getDocs(colRef);
      if (!snaps.empty) {
        snaps.docs.forEach((docSnap) => {
          const data = docSnap.data() as HubDailyExpenseRecord;
          if (data && data.date === dateStr && !((data as any).isDeleted)) {
            expensesMap.set(data.id, data);
          }
        });
      }
    } catch (err) {
      console.warn('Notice loading expenses from firestore:', err);
    }
  }

  return Array.from(expensesMap.values());
}

/**
 * 3. Daily Hub Profit & Loss Calculation
 */
export function calculateHubDailyProfitLoss(
  dateEntries: DeliveryEntry[],
  expenses: HubDailyExpenseRecord[],
  companyRatePerParcel: number = 18
): {
  totalDeliveredParcels: number;
  companyRatePerParcel: number;
  grossCompanyRevenue: number;
  totalRiderPayouts: number;
  grossHubMargin: number;
  totalExpenses: number;
  netProfit: number;
} {
  const activeEntries = (dateEntries || []).filter((e) => !e.isDeleted);
  const totalDeliveredParcels = activeEntries.reduce((sum, e) => sum + (Number(e.parcels) || 0), 0);
  const totalRiderPayouts = activeEntries.reduce((sum, e) => sum + (Number(e.totalEarnings) || 0), 0);
  const grossCompanyRevenue = totalDeliveredParcels * companyRatePerParcel;
  const grossHubMargin = grossCompanyRevenue - totalRiderPayouts;
  const totalExpenses = (expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netProfit = grossHubMargin - totalExpenses;

  return {
    totalDeliveredParcels,
    companyRatePerParcel,
    grossCompanyRevenue,
    totalRiderPayouts,
    grossHubMargin,
    totalExpenses,
    netProfit,
  };
}
